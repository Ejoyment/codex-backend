import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';
import * as editorDrafts from '../lib/editorDrafts';
import { registerEditorSnippets } from '../lib/monacoExtras';
import { normalizeMarkers, countProblems, setRunProblems } from '../lib/monacoDiagnostics';
import { startRun, streamRun, runLanguageFor } from '../lib/ideRun';
import { lspApi, docUri, lspKindToMonaco, lspRangeToMonaco } from '../lib/lspClient';
import {
  Save, ChevronDown, ChevronRight, FileCode, Terminal, Bot, Layers, Rocket, Box,
  Users, GitBranch, Eye, X, FolderOpen, Search, Settings, Folder, Trash2,
  FolderPlus, AlertCircle, CheckCircle, XCircle, RefreshCw, Puzzle, HelpCircle,
  FilePlus, Play, Loader2, LayoutDashboard, GitPullRequestArrow, Copy,
} from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import useToastStore from '../store/toastStore';
import { ConfirmDialog } from '../components/ConfirmDialog';
import DeploymentLogsModal from '../components/DeploymentLogsModal';
import { useCurrentCompany } from '../hooks/useCurrentCompany';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

// --- ANSI output handling (run output can carry terminal color codes) -------
const ANSI_SGR_RE = /\x1b\[([0-9;]*)m/g;
const ANSI_PALETTE = [
  '#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
  '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
];

function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_SGR_RE, '');
}

function ansi256Color(v) {
  if (v < 16) return ANSI_PALETTE[v];
  if (v > 231) { const g = 8 + (v - 232) * 10; return `rgb(${g},${g},${g})`; }
  const n = v - 16;
  const steps = [0, 95, 135, 175, 215, 255];
  return `rgb(${steps[Math.floor(n / 36) % 6]},${steps[Math.floor(n / 6) % 6]},${steps[n % 6]})`;
}

// Split one output line into styled segments (fg/bg/bold/dim/underline).
function ansiSegments(text) {
  const str = String(text ?? '');
  const segs = [];
  const st = { fg: null, bg: null, bold: false, dim: false, underline: false };
  const applyCodes = (raw) => {
    const codes = String(raw || '0').split(';').filter((x) => x !== '').map((x) => parseInt(x, 10));
    if (!codes.length) codes.push(0);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) { st.fg = null; st.bg = null; st.bold = false; st.dim = false; st.underline = false; }
      else if (c === 1) st.bold = true;
      else if (c === 2) st.dim = true;
      else if (c === 4) st.underline = true;
      else if (c === 22) { st.bold = false; st.dim = false; }
      else if (c === 24) st.underline = false;
      else if (c === 39) st.fg = null;
      else if (c === 49) st.bg = null;
      else if (c >= 30 && c <= 37) st.fg = ANSI_PALETTE[c - 30];
      else if (c >= 90 && c <= 97) st.fg = ANSI_PALETTE[c - 90 + 8];
      else if (c >= 40 && c <= 47) st.bg = ANSI_PALETTE[c - 40];
      else if (c >= 100 && c <= 107) st.bg = ANSI_PALETTE[c - 100 + 8];
      else if ((c === 38 || c === 48) && codes[i + 1] === 5) {
        const col = ansi256Color(codes[i + 2] || 0);
        if (c === 38) st.fg = col; else st.bg = col;
        i += 2;
      } else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
        const col = `rgb(${codes[i + 2] || 0},${codes[i + 3] || 0},${codes[i + 4] || 0})`;
        if (c === 38) st.fg = col; else st.bg = col;
        i += 4;
      }
    }
  };
  let cursor = 0;
  let m;
  ANSI_SGR_RE.lastIndex = 0;
  const push = (end) => {
    if (end > cursor) segs.push({ text: str.slice(cursor, end), ...st });
  };
  while ((m = ANSI_SGR_RE.exec(str))) {
    push(m.index);
    applyCodes(m[1]);
    cursor = m.index + m[0].length;
  }
  push(str.length);
  return segs;
}

function getMonacoLanguage(lang) {
  if (!lang) return 'plaintext';
  const l = lang.toLowerCase();
  const map = {
    js: 'javascript', javascript: 'javascript', ts: 'typescript', typescript: 'typescript',
    tsx: 'typescript', jsx: 'javascript', py: 'python', python: 'python',
    html: 'html', css: 'css', json: 'json', md: 'markdown', markdown: 'markdown',
    yaml: 'yaml', yml: 'yaml', sh: 'shell', bash: 'shell',
    go: 'go', rust: 'rust', java: 'java', cpp: 'cpp', c: 'c', sql: 'sql',
    dockerfile: 'dockerfile', plaintext: 'plaintext',
  };
  return map[l] || l;
}

function detectLanguage(filename) {
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', java: 'java', go: 'go', rs: 'rust', cpp: 'cpp', c: 'c',
    rb: 'ruby', php: 'php', html: 'html', css: 'css', json: 'json',
    yml: 'yaml', yaml: 'yaml', md: 'markdown', sh: 'shell', bash: 'shell', sql: 'sql',
    lua: 'lua', groovy: 'groovy', pl: 'perl', r: 'r',
  };
  return map[ext] || 'text';
}

function getFileIcon(name) {
  const lang = detectLanguage(name);
  return LANG_COLORS()[lang] || '#565d6b';
}

function LANG_COLORS() {
  return {
    javascript: '#f7df1e', typescript: '#3178c6', python: '#3776ab',
    java: '#ed8b00', go: '#00add8', rust: '#dea584', cpp: '#00599c',
    c: '#555555', ruby: '#cc342d', php: '#777bb4', html: '#e34c26',
    css: '#563d7c', json: '#292929', yaml: '#cb171e', markdown: '#083fa1',
    shell: '#89e051', sql: '#e38c00', text: '#6e7681',
    lua: '#000080', groovy: '#4298b4', perl: '#0298c3', r: '#276dc3',
  };
}

function getLanguageGlyph(name) {
  const lang = detectLanguage(name);
  const color = LANG_COLORS()[lang] || '#6e7681';
  const iconProps = {
    stroke: '#0b1020',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none'
  };

  return (
    <svg className="ed-file-glyph" viewBox="0 0 24 24" aria-hidden="true" role="img">
      <rect x="2" y="2" width="20" height="20" rx="5" fill={color} />
      {lang === 'javascript' || lang === 'typescript' ? (
        <>
          <path d="M8.4 7.8L5.7 12l2.7 4.2M15.6 7.8L18.3 12l-2.7 4.2M13.2 6.2l-2.4 11.6" {...iconProps} />
        </>
      ) : lang === 'python' ? (
        <>
          <path d="M9.3 7.2h5.4a2 2 0 0 1 2 2v4.6a2 2 0 0 1-2 2H9.3a2 2 0 0 1-2-2V9.2a2 2 0 0 1 2-2Z" {...iconProps} />
          <path d="M9.3 7.2V5.6M14.7 16.8v1.6M9.3 12h5.4" {...iconProps} />
        </>
      ) : lang === 'html' ? (
        <>
          <path d="M7.8 7.6 5.5 12l2.3 4.4M16.2 7.6 18.5 12l-2.3 4.4M13.4 6.5l-2.8 11" {...iconProps} />
        </>
      ) : lang === 'css' ? (
        <>
          <path d="M8 7.8h8l-1.1 8.7-3.9 1.9-3.8-1.9L8 7.8Z" {...iconProps} />
          <path d="M9.2 10.5h5.6M9.2 13h3.8" {...iconProps} />
        </>
      ) : lang === 'json' ? (
        <>
          <path d="M9.2 7.4c-2 0-3.5 1.5-3.5 3.4s1.5 3.4 3.5 3.4M14.8 7.4c2 0 3.5 1.5 3.5 3.4s-1.5 3.4-3.5 3.4" {...iconProps} />
          <path d="M10.4 8.3h3.2M10.4 15.7h3.2" {...iconProps} />
        </>
      ) : lang === 'markdown' ? (
        <>
          <path d="M6.5 15.5V8.5h2.2l2.1 2.7 2.2-2.7h2.2v7M8.8 12.6h2.5" {...iconProps} />
        </>
      ) : lang === 'shell' ? (
        <>
          <path d="M6.5 8.5 9 12l-2.5 3.5M12.5 15.5h5.1" {...iconProps} />
        </>
      ) : lang === 'java' ? (
        <>
          <path d="M7 7.5h10a2 2 0 0 1 2 2v5.4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z" {...iconProps} />
          <path d="M9 7.5V6.1M15 7.5V6.1M9 16.9v1.4M15 16.9v1.4" {...iconProps} />
        </>
      ) : lang === 'go' ? (
        <>
          <path d="M8.5 8.5h7a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2.5a2 2 0 0 1 2-2Z" {...iconProps} />
          <path d="M9.3 12h5.4" {...iconProps} />
          <path d="M12 8.5v7" {...iconProps} />
        </>
      ) : lang === 'rust' ? (
        <>
          <path d="M9.2 7.5h5.4a2 2 0 0 1 2 2v2.1a2 2 0 0 1-2 2H9.2a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z" {...iconProps} />
          <path d="M12 7.5V5.8M12 16.8v1.7M8.5 12h7" {...iconProps} />
        </>
      ) : lang === 'yaml' || lang === 'sql' ? (
        <>
          <path d="M7.3 8.5h9.4M7.3 12h9.4M7.3 15.5h6.5" {...iconProps} />
          <path d="M7.2 7.2h.01" stroke="transparent" />
        </>
      ) : (
        <>
          <path d="M8 7.5h8v9H8z" {...iconProps} />
          <path d="M10 10.5h4M10 13.5h4" {...iconProps} />
        </>
      )}
    </svg>
  );
}

// Two file shapes exist: GitHub tree entries store the FULL path (including
// the filename, e.g. '/src/app.js'), workspace CodeFiles store the DIRECTORY
// path plus name (path '/src' + name 'app.js'). Normalize to a full path.
function fileFullPath(f) {
  const name = f.name || '';
  const base = String(f.path || '/').replace(/\/+$/, '');
  if (!name) return base || '/';
  if (!base) return `/${name}`;
  if (base === name || base.endsWith(`/${name}`)) return `/${base}`.replace(/^\/+/, '/');
  return `${base}/${name}`;
}

function buildFileTree(files) {
  const root = { name: 'root', type: 'folder', children: {} };
  files.forEach((f) => {
    const full = fileFullPath(f);
    const parts = full.split('/').filter(Boolean);
    if (!parts.length) return;
    // VFS creates '.gitkeep' placeholders so empty folders show up in the
    // explorer — render the folder itself, never a file node.
    const isKeep = (f.name || '') === '.gitkeep';
    const dirParts = parts.slice(0, -1);
    const leaf = isKeep ? null : parts[parts.length - 1];
    let cur = root; let rp = '';
    for (let i = 0; i < dirParts.length; i++) {
      rp = rp ? rp + '/' + dirParts[i] : dirParts[i];
      if (!cur.children[dirParts[i]] || cur.children[dirParts[i]].type !== 'folder') {
        cur.children[dirParts[i]] = { name: dirParts[i], type: 'folder', children: {}, path: rp };
      }
      cur = cur.children[dirParts[i]];
    }
    if (leaf) {
      if (!cur.children[leaf] || cur.children[leaf].type !== 'folder') {
        cur.children[leaf] = { ...f, name: leaf, type: 'file', _fullPath: full, _id: f._id || `github:${full}` };
      }
    }
  });
  return root;
}

function FileTreeNode({ node, depth, selectedId, onSelect, expanded, onToggle }) {
  const sortedChildren = useMemo(() => {
    if (!node.children) return null;
    return Object.values(node.children).sort((a, b) => {
      if ((a.type === 'folder' || a.children) !== (b.type === 'folder' || b.children)) return a.children ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [node.children]);

  if (node.type === 'file' && !node.children) {
    const isSelected = node._id === selectedId;
    return (
      <button
        type="button"
        className={`ed-tree-row ${isSelected ? 'is-selected' : ''}`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        onClick={() => onSelect(node)}
      >
        {getLanguageGlyph(node.name)}
        <span className="ed-tree-name is-file">{node.name}</span>
      </button>
    );
  }
  if (node.type === 'folder' || node.children) {
    const isOpen = expanded[node.path || node.name] !== false;
    return (
      <div>
        <button
          type="button"
          className={`ed-tree-row is-folder ${isOpen ? 'is-open' : ''}`}
          style={{ paddingLeft: `${2 + depth * 14}px` }}
          onClick={() => onToggle(node.path || node.name)}
        >
          <ChevronRight className="w-3 h-3 ed-tree-chev" />
          <Folder className="w-3.5 h-3.5 ed-folder-ico" />
          <span className="ed-tree-name">{node.name}</span>
        </button>
        {isOpen && sortedChildren && (
          <div>
            {sortedChildren.map((child) => (
              <FileTreeNode key={child._fullPath || child.path || child.name || child._id} node={child} depth={depth + 1}
                selectedId={selectedId} onSelect={onSelect} expanded={expanded} onToggle={onToggle} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
}

const FEATURE_MODULES = [
  { id: 'git', name: 'Version Control', sub: 'Branches, commit, pull & push', icon: GitBranch },
  { id: 'deploy', name: 'Deployments', sub: 'One-click https deploys → .buildrshq.dev', icon: Rocket },
  { id: 'terminal', name: 'Integrated Terminal', sub: 'Drive a real sandbox from the IDE', icon: Terminal },
  { id: 'ai', name: 'AI Pair Assistant', sub: 'Context-aware help on your code', icon: Bot },
  { id: 'figma', name: 'Figma Sync', sub: 'Design → code split preview', icon: Layers },
  { id: 'collab', name: 'Live Share', sub: 'Real-time cursors & presence', icon: Users },
];

const SMART_PROMPTS = [
  { label: 'Explain this file', hint: 'Summarize logic and risk areas', icon: FileCode },
  { label: 'Refactor safely', hint: 'Improve maintainability without breaking behavior', icon: Layers },
  { label: 'Ship this build', hint: 'Review deployment readiness and potential issues', icon: Rocket },
  { label: 'Fix the bug', hint: 'Diagnose and patch the current issue', icon: Bot },
];

export default function Editor() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);
  const openContentsRef = useRef({});
  const openDirtyRef = useRef({});
  const openOriginalsRef = useRef({});     // last locally-saved content per file (dirty = buffer !== this)
  const remoteBaselineRef = useRef({});     // last-known GitHub remote content (for SCM changes)
  const parkedRef = useRef({});             // saved-but-closed GitHub drafts (still deploy/push-able)
  const persistTimerRef = useRef(null);
  const pendingRestoreRef = useRef(null);
  const autoRedeployRef = useRef(new Set());
  const pollTimersRef = useRef({});
  const pollWhenDoneRef = useRef({});
  const [content, setContent] = useState('');
  const [languages, setLanguages] = useState([]);
  const [tier, setTier] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileLang, setNewFileLang] = useState('javascript');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFilePath, setNewFilePath] = useState('/');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('/');
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [problemList, setProblemList] = useState([]);
  const [externalProblems, setExternalProblems] = useState([]); // compiler/run diagnostics with explicit file names
  const [outputLines, setOutputLines] = useState([]);
  const monacoRef = useRef(null);
  const markersSubscribedRef = useRef(false);
  const lspProvidersRef = useRef(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [activeSidebar, setActiveSidebar] = useState('explorer');
  const [panel, setPanel] = useState(null);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  const [agentExecution, setAgentExecution] = useState(null);
  const [taskCards, setTaskCards] = useState([
    { id: 'task-1', title: 'Ship bug fix', owner: 'AI pair', status: 'ready', priority: 'high', summary: 'Patch the current issue and validate the result.' },
    { id: 'task-2', title: 'Refactor module', owner: 'Design system', status: 'review', priority: 'medium', summary: 'Improve maintainability while keeping the public behavior unchanged.' },
    { id: 'task-3', title: 'Prepare deploy', owner: 'Ops', status: 'waiting', priority: 'high', summary: 'Check release readiness and final deployment checks before shipping.' },
    { id: 'task-4', title: 'Spec contract', owner: 'Product', status: 'draft', priority: 'medium', summary: 'Create the implementation contract before large agent actions.' },
  ]);
  const [selectedTaskId, setSelectedTaskId] = useState('task-1');
  const [specMode, setSpecMode] = useState(false);
  const [byomOpen, setByomOpen] = useState(false);
  const [customModel, setCustomModel] = useState('GPT-4.1');
  const [collaborators, setCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [figmaFiles, setFigmaFiles] = useState([]);
  const [selectedFigmaFile, setSelectedFigmaFile] = useState(null);
  const [codegenOpen, setCodegenOpen] = useState(false);
  const [codegenLoading, setCodegenLoading] = useState(false);
  const [codegenError, setCodegenError] = useState(null);
  const [codegenResult, setCodegenResult] = useState(null);
  const socketRef = useRef(null);
  const [gitStatus, setGitStatus] = useState(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFile, setDiffFile] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBase, setPrBase] = useState('main');
  const [prBusy, setPrBusy] = useState(false);
  const [prError, setPrError] = useState(null);
  const [prDone, setPrDone] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [sandboxUrl, setSandboxUrl] = useState(null);
  const [running, setRunning] = useState(false);
  const [termInfo, setTermInfo] = useState(null); // { type: 'pty'|'simulated', sessionId }
  const [showSubdomainInput, setShowSubdomainInput] = useState(false);
  const [deploySubdomain, setDeploySubdomain] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [logDeployId, setLogDeployId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { success: toastSuccess, error: toastError } = useToastStore(
    (s) => ({ success: s.success, error: s.error })
  );
  const [confirmDiscard, setConfirmDiscard] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const terminalRef = useRef(null);
  const editorRef = useRef(null);
  const runRef = useRef(null);
  const runAbortRef = useRef(null);
  const runLineBufRef = useRef('');
  const runSeqRef = useRef(0);
  const termSocketRef = useRef(null);
  const termSessionRef = useRef(null);
  const originalContentRef = useRef('');
  const aiSessionRef = useRef(null);
  const { selectedCompany } = useCurrentCompany();
  const workspaceId = selectedCompany?._id;

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [githubRepos, setGithubRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [repoCreateOpen, setRepoCreateOpen] = useState(false);
  const [repoCreateName, setRepoCreateName] = useState('');
  const [repoCreateDescription, setRepoCreateDescription] = useState('');
  const [repoCreatePrivate, setRepoCreatePrivate] = useState(false);
  const [repoCreateBusy, setRepoCreateBusy] = useState(false);
  const [repoCreateError, setRepoCreateError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [fileFilter, setFileFilter] = useState('');

  const selectedFileRef = useRef(null);
  selectedFileRef.current = selectedFile;

  const tree = useMemo(() => buildFileTree(files), [files]);

  const getFileKey = useCallback((file) => {
    if (!file) return null;
    if (file._id) return String(file._id);
    if (file.id) return String(file.id);
    if (file.path) return `github:${file.path}`;
    if (file.name) return `github:${file.name}`;
    return `tmp:${Math.random().toString(36).slice(2)}`;
  }, []);

  function buildSession() {
    const contents = {};
    const metaByKey = {};
    openFiles.forEach((f) => { metaByKey[getFileKey(f)] = f; });
    files.forEach((f) => { const k = getFileKey(f); if (!metaByKey[k]) metaByKey[k] = f; });
    Object.entries(openContentsRef.current).forEach(([k, c]) => {
      const meta = metaByKey[k] || {};
      const o = openOriginalsRef.current[k] ?? c;
      const isGh = String(k).startsWith('github:') || meta.source === 'github';
      contents[k] = {
        c, o,
        n: meta.name || (String(k).startsWith('github:') ? String(k).split('/').pop() : k),
        p: meta.path || '/',
        s: isGh ? 'gh' : 'db',
        g: remoteBaselineRef.current[k],
        t: Date.now(),
      };
    });
    return {
      contents,
      parked: { ...parkedRef.current },
      openFiles: openFiles.map((f) => ({
        _id: getFileKey(f), name: f.name, path: f.path, source: f.source,
        language: f.language, sha: f.sha,
      })),
      selectedKey: selectedFileRef.current ? getFileKey(selectedFileRef.current) : null,
      repo: selectedRepo,
      projectId: selectedProject?._id || selectedProject?.id || null,
    };
  }
  const buildSessionRef = useRef(() => null);
  buildSessionRef.current = buildSession;

  function schedulePersist() {
    if (typeof window === 'undefined') return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      try { editorDrafts.saveSession(buildSessionRef.current()); } catch (_) { /* ignore */ }
    }, 400);
  }

  function refreshGitModified() {
    setGitStatus((prev) => {
      if (!prev || !prev.isGithub) return prev;
      return { ...prev, modified: computeLocalModified(prev.repo) };
    });
  }

  const monacoOptions = useMemo(() => ({
    fontSize: 13,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 2,
    automaticLayout: true,
    bracketPairColorization: { enabled: true },
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    // VS Code-like IntelliSense behaviour
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    tabCompletion: 'on',
    wordBasedSuggestions: 'currentDocument',
    snippetSuggestions: 'top',
    acceptSuggestionOnEnter: 'on',
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoSurround: 'languageDefined',
    formatOnType: true,
    suggest: { showWords: true, snippets: 'top', preview: true, showIcons: true },
    padding: { top: 8 },
  }), []);

  const monacoPreviewOptions = useMemo(() => ({
    fontSize: 12,
    minimap: { enabled: false },
    automaticLayout: true,
  }), []);

  // Restore the previous editor session (tabs, buffers, drafts, repo/project)
  // from localStorage before any data fetch resolves.
  useEffect(() => {
    const boot = editorDrafts.loadSession();
    if (!boot) return;
    Object.entries(boot.contents || {}).forEach(([k, e]) => {
      if (!e || typeof e.c !== 'string') return;
      openContentsRef.current[k] = e.c;
      openOriginalsRef.current[k] = typeof e.o === 'string' ? e.o : e.c;
      openDirtyRef.current[k] = e.c !== openOriginalsRef.current[k];
      if (typeof e.g === 'string') remoteBaselineRef.current[k] = e.g;
    });
    Object.entries(boot.parked || {}).forEach(([k, e]) => {
      if (e && typeof e.c === 'string') parkedRef.current[k] = e;
    });
    if (Array.isArray(boot.openFiles) && boot.openFiles.length) setOpenFiles(boot.openFiles);
    if (boot.repo && boot.repo.name) {
      setSelectedRepo(boot.repo);
      setSelectedProject(null);
      pendingRestoreRef.current = { selectedKey: boot.selectedKey || null, projectId: null };
    } else {
      pendingRestoreRef.current = { selectedKey: boot.selectedKey || null, projectId: boot.projectId || null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on unmount and when the tab is hidden so navigating away never
  // loses work (beforeunload catches hard refresh/close too).
  useEffect(() => {
    const flush = () => {
      try {
        if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
        editorDrafts.saveSession(buildSessionRef.current());
      } catch (_) { /* ignore */ }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFiles(workspaceId);
    loadLanguages();
    loadCollaborators();
    loadDeployments();
    loadProjects();
    loadGithubRepos();
    loadFigmaFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Version control follows the selection: a GitHub repo shows that repo's
  // branch/commits/local changes; otherwise the workspace git state.
  useEffect(() => {
    if (selectedRepo) {
      loadRepoGitStatus(selectedRepo);
      return;
    }
    if (workspaceId) {
      loadGitStatus();
      return;
    }
    setGitStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedRepo]);

  // Finish restoring a previous session once its inputs arrive.
  useEffect(() => {
    const pend = pendingRestoreRef.current;
    if (!pend) return;
    if (pend.projectId && projects.length) {
      const p = projects.find((x) => (x._id || x.id) === pend.projectId);
      pendingRestoreRef.current = { ...pend, projectId: null };
      if (!selectedProject && p) {
        setSelectedProject(p);
        setSelectedRepo(null);
        return;
      }
    }
    const cur = pendingRestoreRef.current;
    if (cur && cur.selectedKey && openFiles.length) {
      pendingRestoreRef.current = { ...cur, selectedKey: null };
      const target = openFiles.find((f) => getFileKey(f) === cur.selectedKey);
      if (target && getFileKey(selectedFile) !== cur.selectedKey) {
        openFile(target);
        loadFile(target);
      }
    } else if (cur && cur.selectedKey && !openFiles.length && !loading) {
      pendingRestoreRef.current = { ...cur, selectedKey: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, openFiles, selectedFile, loading, selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      loadProjectFiles(selectedProject._id || selectedProject.id);
    } else if (selectedRepo) {
      loadGithubRepoFiles(selectedRepo);
    } else {
      loadFiles(workspaceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, selectedRepo]);

  // Real-time collaboration socket
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('collab:user-joined', ({ user: joiner }) => {
      setCollaborators((prev) => {
        const exists = prev.some((c) => c.userId === joiner?.userId || c.id === joiner?.id);
        if (exists) return prev;
        return [...prev, joiner || {}];
      });
      setStatus({ type: 'success', msg: 'Collaborator joined' });
      setTimeout(() => setStatus(null), 2000);
    });

    socket.on('collab:user-left', ({ userId }) => {
      setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
      setRemoteCursors((prev) => { const n = { ...prev }; delete n[userId]; return n; });
    });

    socket.on('collab:cursor-update', ({ userId, userName, cursor }) => {
      setRemoteCursors((prev) => ({ ...prev, [userId]: { userName, cursor, ts: Date.now() } }));
    });

    socket.on('agent:confirmation_required', (request) => {
      if (!request?.id) return;
      setPendingConfirmations((prev) => {
        const exists = prev.some((item) => item.id === request.id);
        return exists ? prev : [request, ...prev];
      });
      setStatus({ type: 'warning', msg: `Approval required: ${request.tool || 'agent action'}` });
      setTimeout(() => setStatus(null), 2500);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const loadPendingConfirmations = useCallback(async () => {
    try {
      const data = await apiFetch('/api/agent-confirmation/pending');
      if (data?.success) {
        setPendingConfirmations(data.confirmations || []);
      }
    } catch (error) {
      console.warn('Failed to fetch pending confirmations:', error);
    }
  }, []);

  useEffect(() => {
    loadPendingConfirmations();
  }, [loadPendingConfirmations]);

  const respondToConfirmation = useCallback(async (confirmationId, approved, reason = '') => {
    try {
      const data = await apiFetch('/api/agent-confirmation/respond', {
        method: 'POST',
        body: JSON.stringify({ confirmationId, approved, reason }),
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Could not respond to the approval request');
      }

      setPendingConfirmations((prev) => prev.filter((item) => item.id !== confirmationId));
      setStatus({
        type: approved ? 'success' : 'warning',
        msg: approved ? 'Agent action approved.' : 'Agent action rejected.'
      });
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      setStatus({ type: 'error', msg: error.message || 'Approval request failed' });
    }
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !selectedFile?._id) return;
    socket.emit('collab:join', {
      fileId: selectedFile._id,
      user: { userId: user?.id || user?._id, name: user?.fullName || user?.name || 'You', email: user?.email },
    });
    return () => {
      socket.emit('collab:leave', { fileId: selectedFile._id });
    };
  }, [selectedFile?._id, user]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowProjectSelector(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global IDE shortcuts
  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        if (selectedFileRef.current) handleSave();
      } else if (k === 'b') {
        e.preventDefault();
        setSidebarVisible((v) => !v);
      } else if (k === 'p') {
        e.preventDefault();
        setPaletteOpen(true);
        setPaletteQuery('');
      } else if (k === '`') {
        e.preventDefault();
        setPanel((p) => (p === 'terminal' ? null : 'terminal'));
      } else if (k === 'w') {
        e.preventDefault();
        if (selectedFileRef.current) closeTab(selectedFileRef.current);
      } else if (k === 'n') {
        e.preventDefault();
        setShowNewModal(true);
      } else if (k === 'd' && e.shiftKey) {
        e.preventDefault();
        router.push('/dashboard');
      } else if (k === 'r') {
        e.preventDefault();
        runRef.current?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terminal xterm init — real PTY shell via the /terminal socket.io namespace
  useEffect(() => {
    if (panel !== 'terminal' || !terminalRef.current || terminalRef.current.hasChildNodes()) return;
    let disposed = false;
    let socket = null;
    let fitOnResize = null;
    let resizeObserver = null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

    Promise.all([import('xterm'), import('@xterm/addon-fit')])
      .then(([xtermMod, fitMod]) => {
        if (disposed || !terminalRef.current) return;
        const term = new xtermMod.Terminal({
          theme: {
            background: '#091118',
            foreground: '#e6f1ff',
            cursor: '#67e8f9',
            cursorAccent: '#091118',
            black: '#0b1017',
            red: '#f87171',
            green: '#34d399',
            yellow: '#fbbf24',
            blue: '#60a5fa',
            magenta: '#c084fc',
            cyan: '#67e8f9',
            white: '#e2e8f0',
            brightBlack: '#475569',
            brightRed: '#fca5a5',
            brightGreen: '#6ee7b7',
            brightYellow: '#fcd34d',
            brightBlue: '#93c5fd',
            brightMagenta: '#d8b4fe',
            brightCyan: '#a5f3fc',
            brightWhite: '#f8fafc',
          },
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.45,
          letterSpacing: 0.12,
          cursorBlink: true,
          scrollback: 4000,
          allowTransparency: false,
        });
        const fit = new fitMod.FitAddon();
        term.loadAddon(fit);
        term.open(terminalRef.current);
        try { fit.fit(); } catch (_) { /* ignore */ }

        if (!token) {
          term.writeln('\x1b[31mNot authenticated — sign in to open a shell.\x1b[0m');
          return;
        }

        term.writeln('\x1b[36mConnecting to workspace shell…\x1b[0m');
        socket = io(`${SOCKET_URL}/terminal`, { auth: { token }, transports: ['websocket', 'polling'] });
        termSocketRef.current = socket;

        socket.on('connect', () => {
          socket.emit('terminal:create', {
            workspaceId: workspaceId || user?._id || 'default',
            options: { cols: term.cols, rows: term.rows },
          });
        });
        socket.on('terminal:created', (data) => {
          if (disposed) return;
          termSessionRef.current = data.sessionId;
          setTermInfo({ type: data.type, sessionId: data.sessionId });
          term.write('\r\n\x1b[1;32m● Connected\x1b[0m');
          if (data.type !== 'pty') {
            term.write(' \x1b[33m(simulated shell — node-pty unavailable on server)\x1b[0m');
          }
          term.write('\r\n\r\n');
          term.focus();
        });
        socket.on('terminal:data', ({ data }) => term.write(data));
        socket.on('terminal:error', ({ message }) => {
          term.write(`\r\n\x1b[1;31m${message}\x1b[0m\r\n`);
        });
        socket.on('terminal:destroyed', () => {
          termSessionRef.current = null;
          setTermInfo(null);
          term.write('\r\n\x1b[1;33mSession ended\x1b[0m\r\n');
        });
        socket.on('connect_error', (err) => {
          if (disposed) return;
          term.write(`\r\n\x1b[1;31mConnection failed: ${err?.message || err}\x1b[0m\r\n`);
        });

        term.onData((data) => {
          if (termSessionRef.current && socket) {
            socket.emit('terminal:input', { sessionId: termSessionRef.current, data });
          }
        });

        fitOnResize = () => {
          try { fit.fit(); } catch (_) { /* ignore */ }
          if (termSessionRef.current && socket) {
            socket.emit('terminal:resize', { sessionId: termSessionRef.current, cols: term.cols, rows: term.rows });
          }
        };
        window.addEventListener('resize', fitOnResize);
        if (typeof ResizeObserver !== 'undefined' && terminalRef.current) {
          resizeObserver = new ResizeObserver(() => fitOnResize());
          resizeObserver.observe(terminalRef.current);
        }
        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => { if (!disposed) fitOnResize(); }).catch(() => {});
        }
      })
      .catch(() => {
        if (terminalRef.current) terminalRef.current.innerHTML = '<div style="padding:1rem;color:#8c8c8c;font-size:0.76rem">Terminal failed to load. Refresh to retry.</div>';
      });

    return () => {
      disposed = true;
      if (fitOnResize) window.removeEventListener('resize', fitOnResize);
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch (_) { /* ignore */ } }
      const sess = termSessionRef.current;
      if (socket) {
        if (sess) socket.emit('terminal:destroy', { sessionId: sess });
        setTimeout(() => { try { socket.disconnect(); } catch (_) { /* ignore */ } }, 50);
      }
      termSessionRef.current = null;
      termSocketRef.current = null;
      setTermInfo(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, workspaceId]);

  async function loadFiles(companyId) {
    try {
      setLoading(true);
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
      const data = await apiFetch(`/api/code-editor/files${qs}`);
      setFiles(data.files || []);
    } catch {
      setStatus({ type: 'error', msg: 'Failed to load files' });
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const data = await projectApi.list();
      setProjects(data.projects || []);
    } catch {}
  }

  async function loadProjectFiles(projectId) {
    setLoading(true);
    try {
      const data = await projectApi.listProjectFiles(projectId);
      setFiles(data.files || []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadGithubRepos() {
    try {
      const data = await apiFetch('/api/github/repos?per_page=20');
      setGithubRepos(data.repositories || []);
    } catch {}
  }

  async function handleCreateGithubRepo(e) {
    e?.preventDefault();
    if (!repoCreateName.trim()) {
      setRepoCreateError('Repository name is required.');
      return;
    }

    setRepoCreateBusy(true);
    setRepoCreateError(null);

    try {
      const data = await apiFetch('/api/github/repos', {
        method: 'POST',
        body: JSON.stringify({
          name: repoCreateName.trim(),
          description: repoCreateDescription.trim(),
          private: repoCreatePrivate,
          autoInit: true,
        }),
      });

      if (!data.success) {
        throw new Error(data.message || 'GitHub repo creation failed');
      }

      const repoMeta = data.repository || {};
      const githubOwner = repoMeta.owner || repoMeta.ownerName || user?.githubUsername || user?.github?.login || user?.login || 'github';
      const repoName = repoMeta.name || repoCreateName.trim();
      const createdRepo = {
        id: repoMeta.id || repoName,
        name: repoName,
        fullName: repoMeta.fullName || repoMeta.full_name || `${githubOwner}/${repoName}`,
        owner: githubOwner,
        ownerName: githubOwner,
        default_branch: repoMeta.defaultBranch || repoMeta.default_branch || 'main',
        defaultBranch: repoMeta.defaultBranch || repoMeta.default_branch || 'main',
        private: repoMeta.private ?? repoCreatePrivate,
        url: repoMeta.url || repoMeta.html_url || `https://github.com/${githubOwner}/${repoName}`,
        cloneUrl: repoMeta.cloneUrl || repoMeta.clone_url || `https://github.com/${githubOwner}/${repoName}.git`,
        description: repoMeta.description || repoCreateDescription.trim(),
      };

      if (workspaceId) {
        await apiFetch('/api/git/init', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId,
            userName: user?.fullName || 'Buildrs User',
            userEmail: user?.email || 'user@buildrs.dev',
          }),
        }).catch(() => null);

        await apiFetch('/api/git/remote', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId,
            name: 'origin',
            url: createdRepo.cloneUrl,
          }),
        }).catch(() => null);
      }

      setGithubRepos((prev) => [createdRepo, ...prev.filter((repo) => (repo.fullName || `${repo.owner}/${repo.name}`) !== (createdRepo.fullName || `${createdRepo.owner}/${createdRepo.name}`))]);
      setSelectedRepo(createdRepo);
      setSelectedProject(null);
      setShowProjectSelector(false);
      setRepoCreateOpen(false);
      setRepoCreateName('');
      setRepoCreateDescription('');
      setRepoCreatePrivate(false);
      setStatus({ type: 'success', msg: `GitHub repo ${createdRepo.fullName || createdRepo.name} is ready` });
    } catch (err) {
      setRepoCreateError(err.message || 'Could not create GitHub repository.');
    } finally {
      setRepoCreateBusy(false);
    }
  }

  async function loadFigmaFiles() {
    try {
      const data = await apiFetch('/api/figma/files').catch(() => null);
      if (data && data.files) setFigmaFiles(data.files);
    } catch {}
  }

  async function generateFromDesign() {
    if (!selectedFigmaFile) return;
    setCodegenOpen(true);
    setCodegenLoading(true);
    setCodegenError(null);
    setCodegenResult(null);
    try {
      const data = await apiFetch('/api/design-code/generate', {
        method: 'POST',
        body: JSON.stringify({
          fileKey: selectedFigmaFile.key || selectedFigmaFile.id,
          nodeId: null,
          target: 'react',
          companyId: selectedCompany?._id || undefined,
          workspaceId,
        }),
      });
      if (data.success) {
        setCodegenResult(data);
      } else {
        setCodegenError(data.message || 'Could not generate code');
      }
    } catch (err) {
      setCodegenError(err.message || 'Could not generate code');
    } finally {
      setCodegenLoading(false);
    }
  }

  async function saveCodegenFile(f) {
    try {
      await apiFetch('/api/code-editor/files', {
        method: 'POST',
        body: JSON.stringify({
          name: f.name,
          language: f.language || 'javascript',
          content: f.content,
          companyId: selectedProject?.workspaceId || workspaceId,
          projectId: selectedProject?._id || selectedProject?.id || null,
          path: `/${f.name}`,
        }),
      });
      setStatus({ type: 'success', msg: `Saved ${f.name} to project` });
      await reloadFiles();
    } catch (err) {
      setStatus({ type: 'error', msg: `Failed to save ${f.name}: ${err.message}` });
    }
  }

  async function loadGithubRepoFiles(repo) {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/github/repos/${repo.owner}/${repo.name}/git/tree?recursive=1`);
      setFiles(data.files || []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadLanguages() {
    try {
      const data = await apiFetch('/api/code-editor/languages');
      setLanguages(data.languages || []);
      setTier(data.tier || '');
    } catch {}
  }

  async function loadCollaborators() {
    try {
      const data = await apiFetch('/api/collaboration/file/placeholder/users').catch(() => ({ users: [] }));
      setCollaborators(data.users || []);
    } catch {}
  }

  async function loadGitStatus() {
    if (!workspaceId) return;
    try {
      const data = await apiFetch(`/api/git/status/${workspaceId}`).catch(() => null);
      if (data) setGitStatus(data);
    } catch {}
  }

  // Branch + recent commits + local changes for the selected GitHub repo.
  // Local changes = dirty buffers, locally-saved-but-unpushed files, and
  // parked drafts that differ from the last-known remote content.
  async function loadRepoGitStatus(repo) {
    if (!repo) return;
    const owner = repo.owner?.login || repo.owner || repo.ownerName || '';
    const fullName = repo.fullName || `${owner}/${repo.name}`;
    let commits = [];
    try {
      const data = await apiFetch(`/api/github/repos/${owner}/${repo.name}/commits?per_page=10`);
      commits = data?.commits || [];
    } catch {}
    setGitStatus({
      success: true,
      branch: repo.default_branch || repo.defaultBranch || 'main',
      ahead: 0,
      behind: 0,
      modified: computeLocalModified(fullName),
      commits,
      isGithub: true,
      repo: fullName,
    });
  }

  function computeLocalModified(repoFull) {
    const out = [];
    const seen = new Set();
    const push = (label, k) => { if (!seen.has(k)) { seen.add(k); out.push(label); } };
    openFiles.forEach((f) => {
      const k = getFileKey(f);
      const dirtyBuffer = !!openDirtyRef.current[k];
      const buf = openContentsRef.current[k];
      const remote = remoteBaselineRef.current[k];
      const unpushed = repoFull && typeof buf === 'string' && typeof remote === 'string' && buf !== remote;
      if (dirtyBuffer || unpushed) push(f.name || k, k);
    });
    Object.entries(parkedRef.current).forEach(([k, e]) => {
      if (e?.s !== 'gh' || typeof e.c !== 'string') return;
      const remote = e.g;
      if (remote === undefined || e.c !== remote) push(e.n || k, k);
    });
    return out;
  }

  async function loadDeployments() {
    try {
      const data = await apiFetch('/api/deployments').catch(() => null);
      if (data && data.deployments) setDeployments(data.deployments);
    } catch {}
  }

  async function ensureAiSession() {
    if (aiSessionRef.current) return aiSessionRef.current;
    const sessionMeta = {
      sessionName: `Editor session ${new Date().toLocaleString()}`,
      repositoryId: selectedRepo?._id || selectedProject?._id || 'local-workspace',
      repositoryName: selectedRepo?.name || selectedProject?.name || 'workspace',
      repositoryOwner: selectedRepo?.owner?.login || selectedRepo?.owner || selectedProject?.owner || user?.username || 'local',
      branch: selectedRepo?.default_branch || selectedProject?.defaultBranch || 'main',
    };

    const data = await apiFetch('/api/ai-pair/session', {
      method: 'POST',
      body: JSON.stringify(sessionMeta),
    });
    if (!data.success) throw new Error(data.message || 'Could not start an AI session');
    aiSessionRef.current = data.session;
    return data.session;
  }

  const startAgentExecution = useCallback((taskLabel) => {
    const goal = taskLabel || (selectedFile ? `Fix ${selectedFile.name}` : 'Review workspace');
    const title = selectedFile ? `Fix ${selectedFile.name}` : 'Review workspace';
    const steps = [
      'Scanning relevant files and context...',
      'Drafting the minimal patch...',
      'Running validation checks...',
      'Preparing final review for approval...'
    ];

    const initialExecution = {
      id: `agent-${Date.now()}`,
      title,
      goal,
      status: 'running',
      logs: ['Starting agent execution...'],
      diffSummary: { filesChanged: 1, insertions: 0, deletions: 0 },
      stepIndex: 0,
      completed: false,
      approvalRequired: false,
      outcome: null,
    };

    setAgentExecution(initialExecution);

    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setAgentExecution((prev) => {
        if (!prev) return prev;

        const nextStepIndex = Math.min((prev.stepIndex || 0) + 1, steps.length - 1);
        const nextLogs = [...prev.logs, steps[Math.min(prev.stepIndex || 0, steps.length - 1)]];
        const nextStatus = tick >= steps.length ? 'awaiting_approval' : 'running';

        return {
          ...prev,
          status: nextStatus,
          logs: nextLogs,
          stepIndex: nextStepIndex,
          approvalRequired: nextStatus === 'awaiting_approval',
          diffSummary: {
            filesChanged: 1,
            insertions: 6 + tick * 4,
            deletions: 1 + tick,
          },
          completed: nextStatus === 'awaiting_approval',
        };
      });

      if (tick >= steps.length) {
        clearInterval(timer);
      }
    }, 1200);
  }, [selectedFile]);

  const settleAgentExecution = useCallback((approved) => {
    setAgentExecution((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: approved ? 'completed' : 'rejected',
        completed: true,
        approvalRequired: false,
        outcome: approved ? 'approved' : 'rejected',
        logs: [
          ...prev.logs,
          approved ? 'Approved and merged into the working branch.' : 'Rejected and rolled back the agent patch.'
        ],
      };
    });
  }, []);

  const hydrateAgentExecutionFromResult = useCallback((taskTitle, result) => {
    if (!result) return;

    const summary = result.summary || {};
    const iterationCount = Array.isArray(result.iterations) ? result.iterations.length : 0;
    const finalStatus = result.success ? 'awaiting_approval' : 'rejected';

    setAgentExecution({
      id: `agent-${Date.now()}`,
      title: taskTitle || 'Workspace task',
      goal: taskTitle || 'Workspace task',
      status: finalStatus,
      logs: [
        'Agent loop started on the selected workspace...',
        ...(Array.isArray(result.iterations) ? result.iterations.map((iteration) => iteration?.reasoning?.thought || iteration?.result?.message || 'Agent iteration complete.') : []),
        summary?.message || summary?.summary || 'Agent completed a workspace pass.'
      ].filter(Boolean).slice(-6),
      diffSummary: {
        filesChanged: Array.isArray(summary?.filesChanged) ? summary.filesChanged.length : (summary?.filesChanged || 1),
        insertions: summary?.insertions || 0,
        deletions: summary?.deletions || 0,
      },
      stepIndex: Math.max(0, iterationCount - 1),
      completed: false,
      approvalRequired: result.success,
      outcome: result.success ? 'awaiting_approval' : 'failed',
    });
  }, []);

  const selectedTask = useMemo(
    () => taskCards.find((task) => task.id === selectedTaskId) || taskCards[0] || null,
    [taskCards, selectedTaskId]
  );

  const runSelectedTask = useCallback(() => {
    const taskLabel = selectedTask ? selectedTask.title : (selectedFile ? `Fix ${selectedFile.name}` : 'Review workspace');
    startAgentExecution(taskLabel);
  }, [selectedTask, selectedFile, startAgentExecution]);

  const handleTaskSelect = useCallback((taskId) => {
    setSelectedTaskId(taskId);
    const task = taskCards.find((entry) => entry.id === taskId);
    if (task) {
      setAiInput(task.summary);
      setStatus({ type: 'success', msg: `Task selected: ${task.title}` });
      setTimeout(() => setStatus(null), 1800);
    }
  }, [taskCards]);

  async function handleAiHelperSend(e) {
    e.preventDefault();
    if (!aiInput.trim()) return;
    const userMsg = { role: 'user', content: aiInput };
    setAiMessages((prev) => [...prev, userMsg]);
    const input = aiInput;
    setAiInput('');
    setAiLoading(true);
    try {
      const session = await ensureAiSession();
      const companyId = selectedCompany?._id;
      const shouldUseAgentLoop = /fix|refactor|review|debug|ship|patch|build|deploy/i.test(input);
      const data = await apiFetch('/api/ai-pair/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: session._id,
          message: input,
          companyId,
          enableActions: shouldUseAgentLoop,
          useAgentLoop: shouldUseAgentLoop,
          codeContext: {
            workspace: {
              id: workspaceId || selectedProject?._id || selectedRepo?._id || 'local-workspace',
              name: selectedProject?.name || selectedRepo?.name || 'workspace',
            },
            files: files.slice(0, 25).map((file) => ({ id: file._id || file.id, name: file.name, path: file.path, language: file.language })),
            currentFile: selectedFile ? { name: selectedFile.name, path: selectedFile.path, content: content.slice(0, 2000) } : undefined,
            repository: selectedRepo ? {
              id: selectedRepo._id || selectedRepo.id,
              name: selectedRepo.name,
              owner: selectedRepo.owner?.login || selectedRepo.owner || 'local',
              defaultBranch: selectedRepo.default_branch || 'main',
            } : undefined,
          },
        }),
      });
      const reply = data.message?.content || data.message || data.result?.summary?.message || 'No response';
      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      if (shouldUseAgentLoop && data.result) {
        hydrateAgentExecutionFromResult(input.trim(), data.result);
      } else if (shouldUseAgentLoop) {
        startAgentExecution(input.trim());
      }
    } catch (err) {
      setAiMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  }

  const fetchGithubFileContent = useCallback(async (file) => {
    if (!selectedRepo || !file?.path) return file?.content || '';
    const owner = selectedRepo.owner?.login || selectedRepo.owner || selectedRepo.ownerName;
    const repo = selectedRepo.name;
    const path = String(file.path).replace(/^\/+/, '');
    const ref = selectedRepo.default_branch ? `?ref=${encodeURIComponent(selectedRepo.default_branch)}` : '';
    try {
      const data = await apiFetch(`/api/github/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${ref}`);
      const content = data?.file?.content ?? '';
      if (typeof content === 'string') return content;
    } catch (err) {
      console.warn('GitHub repo file content load failed:', err);
    }
    return file?.content || '';
  }, [selectedRepo]);

  const loadFile = useCallback(async (file) => {
    const fileKey = getFileKey(file);
    const sourceFile = file && file.path && selectedRepo ? { ...file, _id: fileKey, id: fileKey, source: 'github', owner: selectedRepo.owner?.login || selectedRepo.owner, repo: selectedRepo.name } : file;
    const saved = openContentsRef.current[fileKey];
    let val;
    let baseline;
    if (saved !== undefined) {
      // Buffer already in memory (open tab, restored session, or local draft).
      val = saved;
      baseline = openOriginalsRef.current[fileKey] ?? saved;
    } else if (sourceFile?.source === 'github') {
      baseline = await fetchGithubFileContent(sourceFile);
      val = baseline;
    } else if (file?.content !== undefined && file?.content !== null) {
      baseline = file.content;
      val = file.content;
    } else if (/^[0-9a-f]{24}$/i.test(String(file?._id || ''))) {
      // Project file lists are metadata-only — hydrate the real content so
      // opening a project file (and saving it) actually works.
      try {
        const data = await apiFetch(`/api/code-editor/files/${file._id}`);
        baseline = typeof data?.file?.content === 'string' ? data.file.content : '';
      } catch (_) {
        baseline = '';
      }
      val = baseline;
    } else {
      baseline = '';
      val = '';
    }
    if (sourceFile?.source === 'github' && remoteBaselineRef.current[fileKey] === undefined) {
      remoteBaselineRef.current[fileKey] = baseline;
    }
    setSelectedFile(sourceFile || file);
    setContent(val);
    originalContentRef.current = baseline;
    openContentsRef.current[fileKey] = val;
    openOriginalsRef.current[fileKey] = baseline;
    const initDirty = openDirtyRef.current[fileKey] ?? (val !== baseline);
    openDirtyRef.current[fileKey] = initDirty;
    setDirty(initDirty);
    schedulePersist();
    refreshProblems();
    setShowProjectSelector(false);
    setStatus(null);
    if (sourceFile?._id) {
      apiFetch(`/api/collaboration/file/${sourceFile._id}/join`, { method: 'POST' }).catch(() => {});
    }
  }, [fetchGithubFileContent, getFileKey, selectedRepo]);

  const openFile = useCallback((file) => {
    const fileKey = getFileKey(file);
    setOpenFiles((prev) => (prev.some((f) => getFileKey(f) === fileKey) ? prev : [...prev, { ...file, _id: fileKey, id: fileKey }]));
  }, [getFileKey]);

  function selectFile(file) {
    if (dirty) {
      setConfirmDiscard(file);
      return;
    }
    openFile(file);
    loadFile(file);
  }

  const handleConfirmDiscard = () => {
    const file = confirmDiscard;
    setConfirmDiscard(null);
    if (!file) return;
    openFile(file);
    loadFile(file);
  };

  function closeTab(file, e) {
    if (e) e.stopPropagation();
    const fileKey = getFileKey(file);
    const i = openFiles.findIndex((o) => getFileKey(o) === fileKey);
    if (i === -1) return;
    if (openDirtyRef.current[fileKey] || (getFileKey(selectedFile) === fileKey && dirty)) {
      setConfirmClose(file);
      return;
    }
    doRemoveTab(i);
  }

  function doRemoveTab(i) {
    const file = openFiles[i];
    const fileKey = getFileKey(file);
    const next = [...openFiles];
    next.splice(i, 1);
    setOpenFiles(next);
    const isGh = String(fileKey).startsWith('github:') || file?.source === 'github';
    const buf = openContentsRef.current[fileKey];
    if (isGh && typeof buf === 'string') {
      const o = openOriginalsRef.current[fileKey] ?? buf;
      if (buf === o) {
        const repoOwner = selectedRepo?.owner?.login || selectedRepo?.owner || selectedRepo?.ownerName || '';
        parkedRef.current[fileKey] = {
          c: buf, o,
          n: file?.name || String(fileKey).split('/').pop(),
          p: file?.path || '/',
          s: 'gh',
          g: remoteBaselineRef.current[fileKey],
          r: selectedRepo ? (selectedRepo.fullName || `${repoOwner}/${selectedRepo.name}`) : null,
        };
      }
    }
    delete openContentsRef.current[fileKey];
    delete openDirtyRef.current[fileKey];
    delete openOriginalsRef.current[fileKey];
    delete remoteBaselineRef.current[fileKey];
    if (getFileKey(selectedFile) === fileKey) {
      const neighbour = next[i] || next[i - 1];
      if (neighbour) {
        const neighbourKey = getFileKey(neighbour);
        const saved = openContentsRef.current[neighbourKey];
        const baseline = openOriginalsRef.current[neighbourKey];
        const val = saved !== undefined ? saved : (baseline ?? neighbour.content ?? '');
        setSelectedFile(neighbour);
        setContent(val);
        originalContentRef.current = baseline ?? val;
        setDirty(!!openDirtyRef.current[neighbourKey]);
      } else {
        setSelectedFile(null);
        setContent('');
        originalContentRef.current = '';
        setDirty(false);
      }
    }
    schedulePersist();
    refreshGitModified();
    refreshProblems();
  }

  const handleConfirmClose = () => {
    const file = confirmClose;
    setConfirmClose(null);
    if (!file) return;
    const fileKey = getFileKey(file);
    const i = openFiles.findIndex((o) => getFileKey(o) === fileKey);
    if (i !== -1) doRemoveTab(i);
  };

  const monacoLanguage = useMemo(() => getMonacoLanguage(selectedFile?.language), [selectedFile?.language]);

  const handleEditorChange = useCallback((value) => {
    const val = value ?? '';
    setContent(val);
    const fileKey = getFileKey(selectedFile);
    if (fileKey) {
      openContentsRef.current[fileKey] = val;
      openDirtyRef.current[fileKey] = val !== originalContentRef.current;
    }
    setDirty(val !== originalContentRef.current);
    schedulePersist();
    refreshGitModified();
  }, [getFileKey, selectedFile]);

  async function handleSave() {
    const file = selectedFile;
    if (!file) return;
    try {
      setSaving(true);
      const fileKey = getFileKey(file);
      const isGithub = file.source === 'github' || String(fileKey).startsWith('github:');
      if (isGithub && selectedRepo) {
        // Local save: the editor buffer becomes the source of truth for
        // deploys; Push in Source Control is what writes changes to GitHub.
        openContentsRef.current[fileKey] = content;
        openOriginalsRef.current[fileKey] = content;
        openDirtyRef.current[fileKey] = false;
        setDirty(false);
        schedulePersist();
        refreshGitModified();
        setStatus({ type: 'success', msg: 'Saved locally — Deploy republishes it, Push commits it to GitHub' });
        setTimeout(() => setStatus(null), 3000);
        maybeAutoRedeploy();
        return;
      }
      if (!/^[0-9a-f]{24}$/i.test(String(file._id || ''))) {
        throw new Error('Cannot save: this file has no workspace record — recreate it from the Explorer.');
      }
      const data = await apiFetch(`/api/code-editor/files/${file._id}`, {
        method: 'PUT',
        body: JSON.stringify({ content, name: file.name }),
      });
      openContentsRef.current[fileKey] = content;
      openOriginalsRef.current[fileKey] = content;
      openDirtyRef.current[fileKey] = false;
      originalContentRef.current = content;
      setDirty(false);
      setFiles((prev) => prev.map((f) => (getFileKey(f) === fileKey ? { ...f, ...data.file } : f)));
      schedulePersist();
      setStatus({ type: 'success', msg: 'File saved' });
      setTimeout(() => setStatus(null), 2000);
      maybeAutoRedeploy();
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  function refreshProblems() {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel?.() || null;
    setProblemList(normalizeMarkers(monaco, model));
  }

  function jumpToProblem(p) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setPosition({ lineNumber: p.line || 1, column: p.column || 1 });
    editor.revealLineInCenterIfOutsideViewport(p.line || 1);
    editor.focus();
  }

  function appendOutput(kind, text) {
    const lines = String(text ?? '').split('\n');
    setOutputLines((prev) => {
      const next = [...prev, ...lines.map((line) => ({ kind, text: line, ts: Date.now() }))];
      return next.length > 2000 ? next.slice(next.length - 2000) : next;
    });
  }

  function clearOutput() {
    setOutputLines([]);
  }

  function copyOutput() {
    try {
      const text = outputLines.map((l) => stripAnsi(l.text)).join('\n');
      navigator.clipboard?.writeText(text);
    } catch (_) { /* clipboard unavailable */ }
  }

  function flushRunLine() {
    const rest = runLineBufRef.current;
    if (rest) {
      runLineBufRef.current = '';
      appendOutput('out', rest);
    }
  }

  function applyRunResult(result, file) {
    const problems = Array.isArray(result?.problems) ? result.problems : [];
    setExternalProblems(problems);
    const model = editorRef.current?.getModel?.() || null;
    const base = file?.name;
    const forFile = problems.filter((p) => !p?.file || p.file === base || String(p.file).endsWith(`/${base}`));
    setRunProblems(monacoRef.current, model, forFile);
    problems.forEach((p) => {
      appendOutput('err', `${p.file || base}:${p.line}:${p.column || 1} ${p.severity || 'error'} — ${p.message}`);
    });
    if (result?.error) appendOutput('err', result.error);
    if (result?.timedOut) appendOutput('err', 'Run timed out');
    if (result?.success) {
      appendOutput('sys', `✓ Finished successfully (${result.backend} backend)`);
    } else if (!result?.error) {
      appendOutput('sys', `✗ Exited with code ${result.exitCode ?? -1} (${result.backend || 'unknown'} backend)`);
    }
  }

  function stopRun() {
    if (runAbortRef.current) {
      runAbortRef.current.abort();
      appendOutput('sys', '▸ Run stopped');
    }
  }

  async function handleRun() {
    const file = selectedFileRef.current;
    if (!file) return;
    if (running) {
      stopRun();
      return;
    }
    const lang = runLanguageFor(file);
    if (lang.error) {
      setStatus({ type: 'error', msg: lang.error });
      return;
    }
    const editor = editorRef.current;
    const activeContent = editor?.getValue?.();
    if (typeof activeContent !== 'string') {
      setStatus({ type: 'error', msg: 'Open a file to run it' });
      return;
    }

    const safePath = (p) => {
      const rel = String(p || '').replace(/^\/+/, '');
      return /^[\w.\-]+(\/[\w.\-]+)*$/.test(rel) ? rel : null;
    };
    const files = [];
    openFiles.forEach((f) => {
      const rel = safePath(f.path || f.name);
      if (!rel || files.some((x) => x.path === rel) || files.length >= 50) return;
      const key = getFileKey(f);
      const content = key === getFileKey(file)
        ? activeContent
        : openContentsRef.current[key];
      if (typeof content === 'string') files.push({ path: rel, content });
    });
    const entry = safePath(file.path || file.name);
    if (!entry || !files.some((f) => f.path === entry)) {
      setStatus({ type: 'error', msg: `Cannot run '${file.name}': file name has unsupported characters` });
      return;
    }

    runAbortRef.current?.abort();
    const myRun = ++runSeqRef.current;
    setRunning(true);
    setExternalProblems([]);
    setRunProblems(monacoRef.current, editor?.getModel?.() || null, []);
    clearOutput();
    setPanel('output');
    appendOutput('sys', `▸ Running ${file.name} as ${lang.language}${dirty ? ' (unsaved buffer)' : ''}…`);
    runLineBufRef.current = '';

    try {
      const started = await startRun({ language: lang.language, files, entry });
      const stream = streamRun(started.runId, (event, data) => {
        if (runSeqRef.current !== myRun) return;
        if (event === 'output') {
          const buf = runLineBufRef.current + (data?.chunk || '');
          const parts = buf.split('\n');
          runLineBufRef.current = parts.pop() ?? '';
          parts.forEach((line) => appendOutput('out', line));
        } else if (event === 'result') {
          flushRunLine();
          applyRunResult(data, file);
        }
      });
      runAbortRef.current = stream;
      await stream.done;
    } catch (err) {
      if (err?.name !== 'AbortError' && runSeqRef.current === myRun) {
        appendOutput('err', `Run failed: ${err.message || err}`);
      }
    } finally {
      if (runSeqRef.current === myRun) {
        flushRunLine();
        runAbortRef.current = null;
        setRunning(false);
      }
    }
  }
  runRef.current = handleRun;

  // Backend LSP providers. JS/TS/HTML/CSS use Monaco's built-in workers;
  // Python (and other server-backed languages) get completions/hover/
  // definition from /api/lsp. Failures degrade to empty results.
  function registerLspProviders(editor, monaco) {
    const activeUri = () => {
      const f = selectedFileRef.current;
      if (!f) return null;
      return docUri(f.path || f.name);
    };
    const lspPayload = (model, position) => {
      if (model.getLanguageId() !== 'python') return null;
      const uri = activeUri();
      if (!uri) return null;
      return {
        documentUri: uri,
        position: { line: position.lineNumber - 1, character: position.column - 1 },
        content: model.getValue(),
        language: 'python',
      };
    };

    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', '(', '"', "'"],
      async provideCompletionItems(model, position) {
        const payload = lspPayload(model, position);
        if (!payload) return { suggestions: [] };
        try {
          const res = await lspApi.completions(payload);
          const items = Array.isArray(res?.completions?.items)
            ? res.completions.items
            : Array.isArray(res?.completions) ? res.completions : [];
          return {
            suggestions: items.slice(0, 120).map((it, idx) => ({
              label: it.label,
              kind: lspKindToMonaco(monaco, it.kind),
              insertText: it.textEdit?.newText || it.insertText || it.label,
              detail: it.detail,
              documentation: it.documentation
                ? { value: typeof it.documentation === 'string' ? it.documentation : it.documentation.value || '' }
                : undefined,
              sortText: it.sortText || String(idx).padStart(4, '0'),
            })),
          };
        } catch (_) {
          return { suggestions: [] };
        }
      },
    });

    monaco.languages.registerHoverProvider('python', {
      async provideHover(model, position) {
        const payload = lspPayload(model, position);
        if (!payload) return null;
        try {
          const res = await lspApi.hover(payload);
          const contents = res?.hover?.contents;
          const list = Array.isArray(contents) ? contents : contents ? [contents] : [];
          const values = list
            .map((c) => (typeof c === 'string' ? c : c?.value || ''))
            .filter(Boolean)
            .map((value) => ({ value }));
          if (!values.length) return null;
          return {
            contents: values,
            range: lspRangeToMonaco(res.hover.range) || undefined,
          };
        } catch (_) {
          return null;
        }
      },
    });

    monaco.languages.registerDefinitionProvider('python', {
      async provideDefinition(model, position) {
        const payload = lspPayload(model, position);
        if (!payload) return null;
        try {
          const res = await lspApi.definition(payload);
          const def = Array.isArray(res?.definition) ? res.definition[0] : res?.definition;
          if (!def) return null;
          const uri = def.uri || def.targetUri;
          const range = lspRangeToMonaco(def.range || def.targetSelectionRange);
          if (!uri || !range) return null;
          return { uri: monaco.Uri.parse(uri), range };
        } catch (_) {
          return null;
        }
      },
    });

    monaco.languages.registerReferenceProvider('python', {
      async provideReferences(model, position) {
        const payload = lspPayload(model, position);
        if (!payload) return null;
        try {
          const res = await lspApi.references({ ...payload, includeDeclaration: true });
          const list = Array.isArray(res?.references) ? res.references : [];
          return list
            .map((loc) => {
              const range = lspRangeToMonaco(loc.range);
              if (!loc.uri || !range) return null;
              return { uri: monaco.Uri.parse(loc.uri), range };
            })
            .filter(Boolean);
        } catch (_) {
          return [];
        }
      },
    });

    // Keep the server-side document in sync with the buffer (debounced).
    let lspChangeTimer = null;
    editor.onDidChangeModelContent(() => {
      if (lspChangeTimer) clearTimeout(lspChangeTimer);
      lspChangeTimer = setTimeout(() => {
        const model = editor.getModel();
        if (!model || model.getLanguageId() !== 'python') return;
        const uri = activeUri();
        if (!uri) return;
        lspApi.change({ documentUri: uri, content: model.getValue(), language: 'python' }).catch(() => {});
      }, 700);
    });
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerEditorSnippets(monaco);
    if (!markersSubscribedRef.current) {
      markersSubscribedRef.current = true;
      try {
        // Any diagnostic change (TS/JS/HTML/CSS workers, run markers) refreshes
        // the Problems panel.
        monaco.editor.onDidChangeMarkers(() => refreshProblems());
      } catch (_) { /* ignore */ }
    }
    if (!lspProvidersRef.current) {
      lspProvidersRef.current = true;
      registerLspProviders(editor, monaco);
    }
    refreshProblems();
    const decorationsCollection = editor.createDecorationsCollection([]);
    const currentUserName = user?.fullName || user?.name || 'You';

    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
      const socket = socketRef.current;
      if (socket && selectedFile?._id) {
        socket.emit('collab:cursor', {
          fileId: selectedFile._id,
          userId: user?.id || user?._id,
          userName: currentUserName,
          cursor: { line: e.position.lineNumber, column: e.position.column },
        });
      }
    });

    const renderRemote = () => {
      const decos = [];
      Object.values(remoteCursors).forEach(({ userName, cursor }) => {
        if (!cursor) return;
        const pos = { lineNumber: cursor.line, column: cursor.column || 1 };
        const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
        decos.push({
          range,
          options: {
            className: 'remote-cursor-widget',
            hoverMessage: { value: `${userName} is here` },
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            zIndex: 1000,
          },
        });
      });
      decorationsCollection.set(decos);
    };
    renderRemote();
  }

  async function handleCreateFile(e) {
    e.preventDefault();
    if (!newFileName.trim()) return;
    if (selectedRepo && !selectedProject) {
      setStatus({ type: 'error', msg: 'Repo files come from GitHub — switch to a workspace or project to create files.' });
      return;
    }
    try {
      setCreating(true);
      const filePath = newFilePath || '/';
      const payload = {
        name: newFileName.trim(),
        language: newFileLang,
        content: newFileContent,
        companyId: selectedProject?.workspaceId || workspaceId,
        projectId: selectedProject?._id || selectedProject?.id || null,
        path: filePath,
      };
      const data = await apiFetch('/api/code-editor/files', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!data.success && !data.file) {
        throw new Error(data.message || 'Create failed');
      }
      const created = data.file || data;
      setShowNewModal(false);
      setNewFileName('');
      setNewFileLang('javascript');
      setNewFileContent('');
      setStatus({ type: 'success', msg: 'File created' });
      setTimeout(() => setStatus(null), 2000);
      await reloadFiles();
      if (created) {
        openFile(created);
        loadFile(created);
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || 'Create failed' });
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    if (selectedRepo && !selectedProject) {
      setStatus({ type: 'error', msg: 'Repo files come from GitHub — switch to a workspace or project to create folders.' });
      return;
    }
    try {
      setCreating(true);
      const folderPath = newFolderPath || '/';
      const data = await apiFetch('/api/vfs/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: newFolderName.trim(),
          path: folderPath,
          companyId: selectedProject?.workspaceId || workspaceId,
          projectId: selectedProject?._id || selectedProject?.id || null,
        }),
      });
      if (!data.success) {
        throw new Error(data.error || 'Folder create failed');
      }
      setShowNewFolderModal(false);
      setNewFolderName('');
      setStatus({ type: 'success', msg: 'Folder created' });
      setTimeout(() => setStatus(null), 2000);
      const fp = (folderPath === '/' ? '' : folderPath) + '/' + newFolderName.trim();
      setExpandedFolders((prev) => ({ ...prev, [fp]: true }));
      await reloadFiles();
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || 'Folder create failed' });
    } finally {
      setCreating(false);
    }
  }

  async function reloadFiles() {
    if (selectedProject) {
      await loadProjectFiles(selectedProject._id || selectedProject.id);
    } else if (selectedRepo) {
      await loadGithubRepoFiles(selectedRepo);
    } else {
      await loadFiles(workspaceId);
    }
  }

  const gatherDeploymentFiles = useCallback(() => {
    const sourceFiles = selectedProject
      ? files
      : selectedRepo
        ? (files.length ? files : (selectedFile ? [selectedFile] : []))
        : (selectedFile ? [selectedFile] : []);

    if (!sourceFiles.length) return [];

    return sourceFiles.map((file) => {
      const key = getFileKey(file);
      const rawValue = openContentsRef.current[key] ?? parkedRef.current[key]?.c ?? file.content;
      const hasContent = typeof rawValue === 'string';
      const contentValue = hasContent ? rawValue : '';
      const pathValue = (file.path || '/').replace(/\\/g, '/').replace(/\/+$|^\/+$/, '/');
      return {
        name: file.name,
        path: pathValue === '/' ? '/' : pathValue,
        content: contentValue,
        language: file.language || 'plaintext',
        // GitHub blob sha lets the backend resolve content via the blob API
        // when the tarball fetch can't cover a file.
        sha: file.sha || undefined,
        // Marks client-provided content (including intentional empties) as
        // final so the server's backfill does not overwrite it.
        _resolved: hasContent,
      };
    });
  }, [files, getFileKey, selectedFile, selectedProject, selectedRepo]);

  // ---- Save-triggered auto-redeploy -----------------------------------
  // After a successful save, if this project/repo already has a deployment,
  // republish it (same subdomain) with the current editor buffers. No GitHub
  // push involved — the edited files are what get deployed.

  function findOwnDeployment() {
    const pid = selectedProject?._id || selectedProject?.id || null;
    const owner = selectedRepo?.owner?.login || selectedRepo?.owner || selectedRepo?.ownerName || '';
    const repoFull = selectedRepo ? (selectedRepo.fullName || `${owner}/${selectedRepo.name}`) : null;
    return deployments.find((d) => {
      const dk = d.projectKey || (d.projectId?._id ? String(d.projectId._id) : (d.projectId ? String(d.projectId) : null));
      if (pid && dk && dk === String(pid)) return true;
      if (repoFull && d.repoFullName && d.repoFullName === repoFull) return true;
      return false;
    }) || null;
  }

  function pollDeploymentToTerminal(id, subdomain, redeployWhenDone) {
    if (redeployWhenDone) pollWhenDoneRef.current[subdomain] = true;
    if (pollTimersRef.current[subdomain]) return;
    let tries = 0;
    pollTimersRef.current[subdomain] = setInterval(async () => {
      tries += 1;
      try {
        const data = await apiFetch(`/api/deployments/${id}`);
        const d = data?.deployment;
        if (d) {
          setDeployments((prev) => prev.map((x) => (x._id === id
            ? { ...x, status: d.status, deployedUrl: d.deployedUrl, fault: d.fault, failureStage: d.failureStage, errorMessage: d.errorMessage }
            : x)));
        }
        const done = !d || ['success', 'failed', 'stopped'].includes(d.status) || tries > 200;
        if (done) {
          clearInterval(pollTimersRef.current[subdomain]);
          delete pollTimersRef.current[subdomain];
          const whenDone = !!pollWhenDoneRef.current[subdomain];
          delete pollWhenDoneRef.current[subdomain];
          if (whenDone) triggerRedeploy({ subdomain, _id: id });
        }
      } catch (_) {
        clearInterval(pollTimersRef.current[subdomain]);
        delete pollTimersRef.current[subdomain];
      }
    }, 3000);
  }

  async function triggerRedeploy(dep) {
    const key = dep.subdomain || String(dep._id);
    if (autoRedeployRef.current.has(key)) return;
    autoRedeployRef.current.add(key);
    try {
      const deploymentFiles = gatherDeploymentFiles();
      if (!deploymentFiles.length) throw new Error('Nothing to deploy — open your files first.');
      const payload = {
        projectId: selectedProject?._id || selectedProject?.id || null,
        subdomain: dep.subdomain,
        companyId: selectedProject?.workspaceId || workspaceId,
        source: selectedRepo ? 'github' : selectedProject ? 'project' : 'local',
        repo: selectedRepo ? {
          owner: selectedRepo.owner?.login || selectedRepo.owner || selectedRepo.ownerName,
          name: selectedRepo.name,
          defaultBranch: selectedRepo.default_branch || 'main',
          fullName: selectedRepo.fullName || selectedRepo.name,
        } : null,
        files: deploymentFiles,
      };
      const data = await apiFetch('/api/deployments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data?.deployment) {
        setDeployments((prev) => {
          const next = prev.filter((d) => d._id !== data.deployment._id && d.subdomain !== data.deployment.subdomain);
          return [data.deployment, ...next];
        });
        setStatus({ type: 'success', msg: `Auto-redeploying ${dep.subdomain}.buildrshq.dev…` });
        setTimeout(() => setStatus(null), 3000);
        pollDeploymentToTerminal(data.deployment._id, dep.subdomain, false);
      }
    } catch (err) {
      setStatus({ type: 'error', msg: `Auto-redeploy failed: ${err?.data?.error || err?.data?.message || err?.message}` });
      setTimeout(() => setStatus(null), 4000);
    } finally {
      autoRedeployRef.current.delete(key);
    }
  }

  function maybeAutoRedeploy() {
    const dep = findOwnDeployment();
    if (!dep || !dep.subdomain) return;
    if (['pending', 'building', 'deploying'].includes(dep.status)) {
      setStatus({ type: 'success', msg: 'Saved — waiting for the current deploy, then republishing…' });
      pollDeploymentToTerminal(dep._id, dep.subdomain, true);
      return;
    }
    triggerRedeploy(dep);
  }

  async function handleGitAction(action) {
    // A selected GitHub repo always drives version control, even inside a
    // workspace — branch/status/commits follow the selected repo.
    if (selectedRepo) {
      try {
        if (action === 'status') {
          await loadRepoGitStatus(selectedRepo);
          setStatus({ type: 'success', msg: `Status refreshed for ${selectedRepo.fullName || selectedRepo.name}` });
          setTimeout(() => setStatus(null), 2000);
          return;
        }

        if (action === 'pull') {
          await loadGithubRepoFiles(selectedRepo);
          await loadRepoGitStatus(selectedRepo);
          setStatus({ type: 'success', msg: 'GitHub repo refreshed' });
          setTimeout(() => setStatus(null), 2000);
          return;
        }

        if (action === 'commit') {
          setStatus({ type: 'success', msg: 'Push commits your saved changes to GitHub' });
          setTimeout(() => setStatus(null), 3000);
          return;
        }

        if (action === 'push') {
          const filesToPush = gatherDeploymentFiles().filter((file) => !!file.name && !!file.content);
          if (!filesToPush.length) {
            setStatus({ type: 'error', msg: 'No file changes to push to the selected repository.' });
            return;
          }

          const repoOwner = selectedRepo.owner?.login || selectedRepo.owner || selectedRepo.ownerName;
          const repoName = selectedRepo.name;
          const data = await apiFetch('/api/github-advanced/push', {
            method: 'POST',
            body: JSON.stringify({
              owner: repoOwner,
              repo: repoName,
              branch: selectedRepo.default_branch || 'main',
              files: filesToPush.map((file) => ({ path: file.path === '/' ? file.name : `${file.path.replace(/^\/+|\/+$/g, '')}/${file.name}`, content: file.content })),
              message: `Update ${filesToPush[0].name} from Buildrs HQ`,
            }),
          });

          if (!data.success) {
            throw new Error(data.message || 'GitHub push failed');
          }

          // Push published everything — local drafts now match the remote.
          const fullName = selectedRepo.fullName || `${repoOwner}/${repoName}`;
          Object.keys(openContentsRef.current).forEach((k) => {
            if (String(k).startsWith('github:')) {
              remoteBaselineRef.current[k] = openContentsRef.current[k];
            }
          });
          Object.keys(parkedRef.current).forEach((k) => {
            const e = parkedRef.current[k];
            if (e?.s === 'gh' && (!e.r || e.r === fullName)) delete parkedRef.current[k];
          });
          openFiles.forEach((f) => {
            const k = getFileKey(f);
            if (String(k).startsWith('github:')) openDirtyRef.current[k] = false;
          });
          schedulePersist();
          refreshGitModified();

          setStatus({ type: 'success', msg: `Pushed ${filesToPush.length} file(s) to ${repoOwner}/${repoName}` });
          return;
        }
      } catch (e) {
        setStatus({ type: 'error', msg: `Git ${action} failed: ${e.message}` });
        return;
      }
    }

    if (!workspaceId) {
      setStatus({ type: 'error', msg: 'Join a workspace or select a GitHub repo to use version control.' });
      return;
    }
    try {
      if (action === 'status') {
        const data = await apiFetch(`/api/git/status/${workspaceId}`);
        setGitStatus(data);
        setStatus({ type: 'success', msg: 'Git status refreshed' });
        return;
      }
      const data = await apiFetch(`/api/git/${action}`, { method: 'POST', body: JSON.stringify({ workspaceId, fileId: selectedFile?._id }) });
      setGitStatus(data);
      setStatus({ type: 'success', msg: `Git ${action} done` });
    } catch (e) {
      setStatus({ type: 'error', msg: `Git ${action} failed: ${e.message}` });
    }
  }

  async function loadFileDiff(file) {
    if (!workspaceId) return;
    setDiffOpen(true);
    setDiffLoading(true);
    setDiffFile(file);
    setDiffData(null);
    try {
      const data = await apiFetch(`/api/git/diff/${workspaceId}?file=${encodeURIComponent(file)}`);
      setDiffData(data.parsed || []);
    } catch {
      setDiffData([]);
    } finally {
      setDiffLoading(false);
    }
  }

  async function createPR(e) {
    e.preventDefault();
    if (!selectedRepo) {
      setPrError('Select a GitHub repository in the Explorer first.');
      return;
    }
    setPrBusy(true);
    setPrError(null);
    setPrDone(null);
    try {
      const data = await apiFetch('/api/github-advanced/pull-request', {
        method: 'POST',
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.name,
          title: prTitle.trim(),
          body: prBody.trim(),
          head: gitStatus?.branch || 'main',
          base: prBase.trim() || 'main',
        }),
      });
      if (data.pullRequest) {
        setPrDone(data.message || `Pull request #${data.pullRequest.number} created`);
        setPrTitle('');
        setPrBody('');
        const url = data.pullRequest.html_url || data.pullRequest.url;
        if (url) window.open(url, '_blank');
      } else {
        setPrError(data.message || 'Create PR failed');
      }
    } catch (err) {
      setPrError(err.message || 'Create PR failed');
    } finally {
      setPrBusy(false);
    }
  }

  function handleDeploy() {
    setPanel('deploy');
    setShowSubdomainInput(true);

    const deployName =
      selectedProject?.name ||
      selectedRepo?.name ||
      selectedFile?.name ||
      'project';

    setDeploySubdomain(deployName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-'));

    if (!selectedProject && !selectedRepo && !selectedFile && !files.length) {
      setStatus({ type: 'error', msg: 'Select a project, repo, or file in the Explorer before deploying.' });
    }
  }

  async function confirmDeploy(e) {
    e.preventDefault();
    const subdomain = deploySubdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!subdomain || subdomain.length < 2) {
      setStatus({ type: 'error', msg: 'Subdomain must be at least 2 characters.' });
      return;
    }

    const projectId = selectedProject?._id || selectedProject?.id || null;
    const deploymentFiles = gatherDeploymentFiles();
    if (!projectId && !selectedRepo && !selectedFile && !deploymentFiles.length) {
      setStatus({ type: 'error', msg: 'Select a project, repo, or file in the Explorer before deploying.' });
      return;
    }

    try {
      setDeploying(true);
      setStatus({ type: 'success', msg: 'Deploying...' });
      const payload = {
        projectId,
        subdomain,
        companyId: selectedProject?.workspaceId || workspaceId,
        source: selectedRepo ? 'github' : selectedProject ? 'project' : 'local',
        repo: selectedRepo ? {
          owner: selectedRepo.owner?.login || selectedRepo.owner || selectedRepo.ownerName,
          name: selectedRepo.name,
          defaultBranch: selectedRepo.default_branch || 'main',
          fullName: selectedRepo.fullName || selectedRepo.name,
        } : null,
        files: deploymentFiles,
      };

      const data = await apiFetch('/api/deployments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data.deployment) {
        setDeployments((prev) => [data.deployment, ...prev]);
        setStatus({ type: 'success', msg: `Deploying to ${subdomain}.buildrshq.dev...` });
        setShowSubdomainInput(false);
        setDeploySubdomain('');
        setLogDeployId(data.deployment._id);
        setTimeout(loadDeployments, 5000);
      }
    } catch (err) {
      const msg = err?.data?.error || err?.data?.message || err?.message || 'Deploy failed';
      setStatus({ type: 'error', msg });
    } finally {
      setDeploying(false);
    }
  }

  async function stopDeployment(deploymentId, subdomain) {
    if (!confirm(`Stop deployment "${subdomain}.buildrshq.dev"?`)) return;
    try {
      await apiFetch(`/api/deployments/${deploymentId}`, { method: 'DELETE' });
      setDeployments((prev) => prev.map((d) =>
        d._id === deploymentId ? { ...d, status: 'stopped', deployedUrl: null } : d
      ));
      setStatus({ type: 'success', msg: 'Deployment stopped.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err?.data?.message || err?.data?.error || err?.message || 'Failed to stop' });
    }
  }

  // Patch the list entry when the log modal polls a newer status (keeps the
  // status pill in sync without refetching the whole list).
  function handleDeploymentUpdate(upd) {
    if (!upd?._id) return;
    setDeployments((prev) => prev.map((d) => {
      if (d._id !== upd._id) return d;
      if (d.status === upd.status && d.deployedUrl === upd.deployedUrl) return d;
      return { ...d, status: upd.status, deployedUrl: upd.deployedUrl, fault: upd.fault, failureStage: upd.failureStage };
    }));
  }

  async function handleSandboxStart() {
    const previewTarget = selectedFile || files[0] || null;
    if (!previewTarget) {
      setStatus({ type: 'error', msg: 'Select a file to preview first.' });
      return;
    }

    try {
      setStatus({ type: 'success', msg: 'Starting sandbox...' });
      const payload = {
        fileId: previewTarget._id || previewTarget.id || null,
        name: previewTarget.name,
        path: previewTarget.path || '/',
        language: previewTarget.language || 'javascript',
        content: openContentsRef.current[getFileKey(previewTarget)] ?? previewTarget.content ?? content ?? '',
        source: selectedRepo ? 'github' : selectedProject ? 'project' : 'local',
      };

      const data = await apiFetch('/api/sandbox/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data.sandboxUrl) {
        setSandboxUrl(data.sandboxUrl);
        setStatus({ type: 'success', msg: 'Sandbox ready!' });
        setTimeout(() => setStatus(null), 2000);
      }
    } catch (err) {
      setStatus({ type: 'error', msg: `Sandbox error: ${err.message}` });
    }
  }

  const eyebrow = (fn) => {
    setMenuOpen(null);
    setPaletteOpen(false);
    setAboutOpen(false);
    fn();
  };

  function handleDelete(file) {
    setConfirmDelete(file);
  }

  const handleConfirmDelete = async () => {
    const file = confirmDelete;
    if (!file) return;
    setConfirmDelete(null);
    try {
      await apiFetch(`/api/code-editor/files/${file._id}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((f) => f._id !== file._id));
      const delKey = getFileKey(file);
      delete openContentsRef.current[delKey];
      delete openDirtyRef.current[delKey];
      delete openOriginalsRef.current[delKey];
      delete remoteBaselineRef.current[delKey];
      delete parkedRef.current[delKey];
      setOpenFiles((prev) => prev.filter((f) => getFileKey(f) !== delKey));
      if (selectedFile?._id === file._id) {
        setSelectedFile(null);
        setContent('');
        originalContentRef.current = '';
        setDirty(false);
      }
      schedulePersist();
      toastSuccess('File deleted');
    } catch (err) {
      toastError(err.message || 'Delete failed');
    }
  };

  const MENU_ITEMS = [
    {
      id: 'file', label: 'File', items: [
        { label: 'New File', kbd: '⌘N', run: () => setShowNewModal(true) },
        { label: 'New Folder', kbd: '⇧⌘N', run: () => setShowNewFolderModal(true) },
        { label: null },
        { label: 'Save', kbd: '⌘S', run: handleSave },
        { label: null },
        { label: 'Close Editor', kbd: '⌘W', run: () => { if (selectedFileRef.current) closeTab(selectedFileRef.current); } },
        { label: null },
        { label: 'Back to Dashboard', kbd: '⌘⇧D', run: () => router.push('/dashboard') },
      ],
    },
    {
      id: 'edit', label: 'Edit', items: [
        { label: 'Undo', kbd: '⌘Z', run: () => editorRef.current?.trigger('keyboard', 'undo', null) },
        { label: 'Redo', kbd: '⇧⌘Z', run: () => editorRef.current?.trigger('keyboard', 'redo', null) },
        { label: null },
        { label: 'Command Palette...', kbd: '⌘P', run: () => { setPaletteOpen(true); setPaletteQuery(''); } },
      ],
    },
    {
      id: 'view', label: 'View', items: [
        { label: 'Toggle Sidebar', kbd: '⌘B', run: () => setSidebarVisible((v) => !v) },
        { label: 'Toggle Terminal', kbd: '⌘`', run: () => setPanel((p) => (p === 'terminal' ? null : 'terminal')) },
        { label: null },
        { label: 'Explorer', run: () => showSidebar('explorer') },
        { label: 'Search', run: () => showSidebar('search') },
        { label: 'Source Control', run: () => showSidebar('scm') },
        { label: 'Run & Deploy', run: () => showSidebar('run') },
        { label: 'Live Share', run: () => showSidebar('live') },
        { label: 'AI Assistant', run: () => showSidebar('ai') },
        { label: 'Extensions', run: () => showSidebar('extensions') },
      ],
    },
    {
      id: 'run', label: 'Run', items: [
        { label: 'Run File', kbd: '⌘R', run: () => handleRun() },
        { label: 'Stop Run', run: stopRun },
        { label: null },
        { label: 'Deploy Project...', run: handleDeploy },
        { label: 'Start Sandbox', run: handleSandboxStart },
        { label: null },
        { label: 'Open Terminal', kbd: '⌘`', run: () => setPanel((p) => (p === 'terminal' ? null : 'terminal')) },
      ],
    },
    {
      id: 'terminal', label: 'Terminal', items: [
        { label: 'New Terminal', kbd: '⌘`', run: () => setPanel((p) => (p === 'terminal' ? null : 'terminal')) },
        { label: 'Run git status', run: () => handleGitAction('status') },
        { label: null },
        { label: 'Open Deployments', run: () => setPanel('deploy') },
      ],
    },
    {
      id: 'help', label: 'Help', items: [
        { label: 'About Buildrs HQ', run: () => setAboutOpen(true) },
        { label: 'Keyboard Shortcuts', run: () => setAboutOpen(true) },
        { label: null },
        { label: 'Support Center', run: () => router.push('/support') },
      ],
    },
  ];

  const paletteEntries = (() => {
    const q = paletteQuery.trim().toLowerCase();
    const match = (s) => (q ? (s || '').toLowerCase().includes(q) : true);
    const fileMatches = files.filter((f) => match(f.name)).slice(0, 8).map((f) => ({ kind: 'file', label: f.name, icon: FileCode, file: f }));
    const cmds = [
      { kind: 'command', label: 'File: New File', icon: FilePlus, run: () => setShowNewModal(true) },
      { kind: 'command', label: 'File: Save', icon: Save, run: handleSave },
      { kind: 'command', label: 'Run: Run File', icon: Play, run: handleRun },
      { kind: 'command', label: 'Run: Stop Run', icon: XCircle, run: stopRun },
      { kind: 'command', label: 'Git: Refresh Status', icon: GitBranch, run: () => handleGitAction('status') },
      { kind: 'command', label: 'Deploy: Deploy Project', icon: Rocket, run: handleDeploy },
      { kind: 'command', label: 'Sandbox: Start preview', icon: Box, run: handleSandboxStart },
      { kind: 'command', label: 'Terminal: Toggle', icon: Terminal, run: () => setPanel((p) => (p === 'terminal' ? null : 'terminal')) },
      { kind: 'command', label: 'View: Toggle Sidebar', icon: FolderOpen, run: () => setSidebarVisible((v) => !v) },
      { kind: 'command', label: 'Help: About', icon: HelpCircle, run: () => setAboutOpen(true) },
    ].filter((c) => match(c.label));
    return [...fileMatches, ...cmds];
  })();

  function showSidebar(view) {
    setActiveSidebar(view);
    setSidebarVisible(true);
    setMenuOpen(null);
  }

  const runPaletteEntry = (entry) => {
    if (entry.file) selectFile(entry.file);
    else if (entry.run) entry.run();
    setPaletteOpen(false);
    setPaletteQuery('');
  };

  const extList = languages.filter((l) => l.allowed !== false);
  const modifiedCount = gitStatus?.modified?.length || 0;
  const blockCount = languages.filter((l) => l.allowed === false).length;
  const problemCounts = useMemo(
    () => countProblems([...externalProblems, ...problemList]),
    [externalProblems, problemList]
  );
  const allProblems = [...externalProblems, ...problemList];
  const filePathSegs = selectedFile ? String(selectedFile.path || selectedFile.name || '').split('/').filter(Boolean) : [];
  const commandStats = [
    { label: 'Files', value: files.length, tone: 'cyan', icon: FileCode },
    { label: 'Deploys', value: deployments.length, tone: 'green', icon: Rocket },
    { label: 'Collaborators', value: collaborators.length, tone: 'purple', icon: Users },
    { label: 'Git Changes', value: modifiedCount, tone: 'amber', icon: GitBranch },
  ];

  return (
    <AuthGuard>
      <Head>
        <title>Code Editor - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="ed-page">
        <div className="ed-product-shell">
          <div className="ed-command-header">
            <div className="ed-command-copy">
              <div className="ed-command-kicker">Buildrs HQ Workspace</div>
              <h1>{selectedProject ? selectedProject.name : selectedRepo ? (selectedRepo.fullName || selectedRepo.name) : (workspaceId ? 'Workspace Console' : 'No workspace')}</h1>
              <p>Product engineering operations, live collaboration, AI assistance, and deployment workflows in one command center.</p>
            </div>
            <div className="ed-command-actions">
              <div className="ed-product-pills">
                <span>AI</span>
                <span>Git</span>
                <span>Deploy</span>
                <span>Live</span>
              </div>
              <button type="button" className="btn-workspace btn-primary" onClick={() => setShowNewModal(true)}>
                <FilePlus className="w-4 h-4" /> New File
              </button>
            </div>
          </div>

          <div className="ed-command-stats">
            {commandStats.map(({ label, value, tone, icon: Icon }) => (
              <div key={label} className={`ed-stat-card is-${tone}`}>
                <div className="ed-stat-icon"><Icon className="w-4 h-4" /></div>
                <div>
                  <div className="ed-stat-label">{label}</div>
                  <div className="ed-stat-value">{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Menu bar ---- */}
        <div className="ed-menubar">
          <div className="ed-window-dots">
            <span className="ed-dot is-red" />
            <span className="ed-dot is-yellow" />
            <span className="ed-dot is-green" />
          </div>
          <button type="button" className="ed-menubar-brand" onClick={() => router.push('/dashboard')} title="Back to Dashboard">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Buildrs <em>HQ</em></span>
          </button>
          <nav className="ed-menubars" ref={menuRef}>
            {MENU_ITEMS.map((m) => (
              <div key={m.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`ed-menubtn ${menuOpen === m.id ? 'is-open' : ''}`}
                  onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                >
                  {m.label}
                </button>
                {menuOpen === m.id && (
                  <div className="ed-menudrop">
                    {m.items.map((it, i) =>
                      it.label === null ? (
                        <div key={`s${i}`} className="ed-menudrop-sep" />
                      ) : (
                        <button key={it.label} type="button" className="ed-menudrop-item" onClick={() => eyebrow(it.run)}>
                          <span>{it.label}</span>
                          {it.kbd && <kbd>{it.kbd}</kbd>}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="ed-menubar-right">
            {selectedProject ? selectedProject.name : selectedRepo ? (selectedRepo.fullName || selectedRepo.name) : (workspaceId ? 'Workspace' : 'No workspace')}
          </div>
        </div>

        {/* ---- Body ---- */}
        <div className="ed-body">
          {/* Activity bar */}
          <nav className="ed-actbar">
            <button type="button" className={`ed-actbtn ${activeSidebar === 'explorer' ? 'is-active' : ''}`} onClick={() => showSidebar('explorer')} title="Explorer (⌘B)">
              <FolderOpen className="w-5 h-5" />
            </button>
            <button type="button" className={`ed-actbtn ${activeSidebar === 'search' ? 'is-active' : ''}`} onClick={() => showSidebar('search')} title="Search">
              <Search className="w-5 h-5" />
            </button>
            <button type="button" className={`ed-actbtn ${activeSidebar === 'scm' ? 'is-active' : ''}`} onClick={() => showSidebar('scm')} title="Source Control">
              <GitBranch className="w-5 h-5" />
              {modifiedCount > 0 && <span className="ed-actbadge">{modifiedCount}</span>}
            </button>
            <button type="button" className={`ed-actbtn ${activeSidebar === 'run' ? 'is-active' : ''}`} onClick={() => showSidebar('run')} title="Run & Deploy">
              <Play className="w-5 h-5" />
            </button>
            <button type="button" className={`ed-actbtn ${activeSidebar === 'live' ? 'is-active' : ''}`} onClick={() => showSidebar('live')} title="Live Share">
              <Users className="w-5 h-5" />
              {collaborators.length > 0 && <span className="ed-actbadge">{collaborators.length}</span>}
            </button>
            <button type="button" className={`ed-actbtn ${activeSidebar === 'ai' ? 'is-active' : ''}`} onClick={() => showSidebar('ai')} title="AI Assistant">
              <Bot className="w-5 h-5" />
              {aiLoading && <span className="ed-actbadge">·</span>}
            </button>
            <button type="button" className={`ed-actbtn ${activeSidebar === 'extensions' ? 'is-active' : ''}`} onClick={() => showSidebar('extensions')} title="Extensions">
              <Puzzle className="w-5 h-5" />
            </button>
            <div className="ed-actbar-grow" />
            <button type="button" className="ed-actbtn" onClick={() => setAboutOpen(true)} title="Help & shortcuts">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button type="button" className="ed-actbtn" onClick={() => router.push('/settings')} title="Settings">
              <Settings className="w-5 h-5" />
            </button>
          </nav>

          {/* ---- Contextual sidebar ---- */}
          {sidebarVisible && (
            <aside className="ed-sidebar">
              {activeSidebar === 'explorer' && (
                <>
                  <div className="ed-sidebar-head">
                    <span className="ed-sidebar-title">Explorer</span>
                    <div className="ed-sidebar-actions">
                      <button type="button" className="ed-sidebar-btn" onClick={() => setShowNewModal(true)} title="New File"><FilePlus className="w-3.5 h-3.5" /></button>
                      <button type="button" className="ed-sidebar-btn" onClick={() => setShowNewFolderModal(true)} title="New Folder"><FolderPlus className="w-3.5 h-3.5" /></button>
                      <button type="button" className="ed-sidebar-btn" onClick={reloadFiles} title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="ed-sidebar-body" style={{ padding: '0.6rem 0.75rem 0.4rem' }}>
                    <div className="ed-project-wrap" ref={dropdownRef}>
                      <button type="button" className="ed-project-btn" onClick={() => setShowProjectSelector(!showProjectSelector)}>
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span className="ed-project-label">{selectedProject ? selectedProject.name : selectedRepo ? (selectedRepo.fullName || selectedRepo.name) : 'Workspace'}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${showProjectSelector ? 'rotate-180' : ''}`} style={{ color: '#6e6e6e' }} />
                      </button>
                      {showProjectSelector && (
                        <div className="ed-drop">
                          <button type="button" className="ed-drop-item" onClick={() => { setSelectedProject(null); setSelectedRepo(null); setShowProjectSelector(false); }}>
                            <FolderOpen className="w-3.5 h-3.5" /> Workspace Files
                          </button>
                          {(workspaceId || selectedProject) && (
                            <button type="button" className="ed-drop-item" onClick={() => { setShowProjectSelector(false); setRepoCreateOpen(true); }}>
                              <GitBranch className="w-3.5 h-3.5" /> Create GitHub Repo
                            </button>
                          )}
                          {projects.length > 0 && <div className="ed-drop-section">Projects</div>}
                          {projects.map((p) => (
                            <button key={p._id || p.id} type="button" className="ed-drop-item" onClick={() => { setSelectedProject(p); setSelectedRepo(null); setShowProjectSelector(false); }}>
                              <Folder className="w-3.5 h-3.5" /> {p.name}
                            </button>
                          ))}
                          {githubRepos.length > 0 && <div className="ed-drop-section">GitHub Repos</div>}
                          {githubRepos.map((r) => (
                            <button key={r.id || r.fullName} type="button" className="ed-drop-item" onClick={() => { setSelectedRepo(r); setSelectedProject(null); setShowProjectSelector(false); }}>
                              <GitBranch className="w-3.5 h-3.5" /> {r.fullName || r.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="ed-filter-wrap">
                      <input type="text" className="ed-filter" placeholder="Filter files..."
                        value={fileFilter} onChange={(e) => setFileFilter(e.target.value)} />
                    </div>
                    <div className="ed-tree">
                      {loading ? (
                        <div className="ed-empty">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-xs">Loading files...</span>
                        </div>
                      ) : files.length === 0 ? (
                        <div className="ed-empty">
                          <FileCode className="w-6 h-6" />
                          <p className="text-xs">No files yet</p>
                          <button type="button" className="btn-workspace btn-primary" onClick={() => setShowNewModal(true)}>Create File</button>
                        </div>
                      ) : (
                        <FileTreeNode node={tree} depth={-1} selectedId={selectedFile?._id} onSelect={selectFile} expanded={expandedFolders}
                          onToggle={(path) => setExpandedFolders((prev) => ({ ...prev, [path]: prev[path] === false ? true : false }))} />
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeSidebar === 'search' && (
                <>
                  <div className="ed-sidebar-head">
                    <span className="ed-sidebar-title">Search</span>
                    <div className="ed-sidebar-actions"></div>
                  </div>
                  <div className="ed-sidebar-body">
                    <div className="ed-search-input-icon">
                      <Search className="w-3.5 h-3.5" />
                      <input
                        type="text"
                        className="ed-search-input"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {searchQuery.trim() ? (
                      <>
                        <div className="ed-stat">{files.filter((f) => f.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).length} matching file(s)</div>
                        {files.filter((f) => f.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 30).map((f) => (
                          <button key={f._id} type="button" className="ed-search-result" onClick={() => selectFile(f)}>
                            {getLanguageGlyph(f.name)}
                            <span><em>{f.name}</em> <span style={{ color: '#6e6e6e' }}>{f.path && f.path !== '/' ? `— ${f.path}` : ''}</span></span>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="ed-empty">
                        <Search className="w-6 h-6" />
                        <p className="text-xs">Type to search across your workspace files</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeSidebar === 'scm' && (
                <>
                  <div className="ed-sidebar-head">
                    <span className="ed-sidebar-title">Source Control</span>
                    <div className="ed-sidebar-actions">
                      <button type="button" className="ed-sidebar-btn" onClick={() => handleGitAction('status')} title="Refresh status"><RefreshCw className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="ed-sidebar-body">
                    <div className="ed-stat">
                      <span className="ed-badge-dot" style={{ background: '#2fd6e6' }} />
                      <b>{gitStatus?.branch || 'main'}</b>
                      <span style={{ color: '#6e6e6e' }}>
                        {gitStatus?.repo
                          ? ` · ${gitStatus.repo}`
                          : gitStatus ? ` · ${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind` : 'no git info'}
                      </span>
                    </div>
                    {!gitStatus && (
                      <div className="ed-empty">
                        <GitBranch className="w-6 h-6" />
                        <p className="text-xs">Opt in to version control from your workspace settings.</p>
                      </div>
                    )}
                    <div className="ed-sidebar-title" style={{ padding: '0.1rem 0.55rem' }}>
                      Changes {modifiedCount > 0 ? `(${modifiedCount})` : ''}
                    </div>
                    {modifiedCount === 0 ? (
                      <p className="text-xs" style={{ color: '#6e6e6e', padding: '0.2rem 0.55rem' }}>
                        {gitStatus ? 'Working tree clean' : 'No changes'}
                      </p>
                    ) : (
                      (gitStatus?.modified || []).map((name, i) => (
                        <button
                          key={`${name}-${i}`}
                          type="button"
                          className="ed-scm-file ed-scm-file-btn"
                          style={{ width: '100%', textAlign: 'left' }}
                          onClick={() => loadFileDiff(name)}
                          title="View diff"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          <span>{name}</span>
                        </button>
                      ))
                    )}
                    {(gitStatus?.commits || []).length > 0 && (
                      <>
                        <div className="ed-sidebar-title" style={{ padding: '0.4rem 0.55rem 0.1rem' }}>Recent commits</div>
                        {gitStatus.commits.slice(0, 8).map((c) => (
                          <div
                            key={c.sha}
                            className="ed-scm-file"
                            title={c.url || c.message || ''}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', cursor: c.url ? 'pointer' : 'default' }}
                            onClick={() => { if (c.url) window.open(c.url, '_blank'); }}
                          >
                            <span className="text-xs" style={{ color: '#c7d3df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {(c.message || '').split('\n')[0]}
                            </span>
                            <span className="text-xs" style={{ color: '#6e6e6e' }}>
                              {(c.sha || '').slice(0, 7)} · {c.author?.name || c.author?.username || ''}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                    {!selectedRepo && workspaceId && (
                      <div style={{ paddingBottom: '0.5rem' }}>
                        <button type="button" className="btn-workspace btn-secondary" style={{ width: '100%' }} onClick={() => setRepoCreateOpen(true)}>
                          <GitBranch className="w-3.5 h-3.5 mr-1 inline" /> Create GitHub Repo
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem', paddingTop: '0.4rem' }}>
                      <button type="button" className="btn-workspace btn-secondary" style={{ flex: 1 }} onClick={() => handleGitAction('pull')}>Pull</button>
                      <button type="button" className="btn-workspace btn-secondary" style={{ flex: 1 }} onClick={() => handleGitAction('commit')}>Commit</button>
                      <button type="button" className="btn-workspace btn-primary" style={{ flex: 1 }} onClick={() => handleGitAction('push')}>Push</button>
                    </div>
                    <div style={{ paddingTop: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn-workspace btn-secondary"
                        style={{ width: '100%' }}
                        onClick={() => { setPrError(null); setPrDone(null); setPrOpen(true); }}
                        disabled={!selectedRepo}
                        title={selectedRepo ? 'Open pull request from current branch' : 'Select a GitHub repository in the Explorer first'}
                      >
                        <GitPullRequestArrow className="w-3.5 h-3.5 mr-1 inline" />
                        Create Pull Request
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeSidebar === 'run' && (
                <>
                  <div className="ed-sidebar-head">
                    <span className="ed-sidebar-title">Run & Deploy</span>
                    <div className="ed-sidebar-actions">
                      <button type="button" className="ed-sidebar-btn" onClick={loadDeployments} title="Refresh deployments"><RefreshCw className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="ed-sidebar-body">
                    <div className="ed-stat">
                      <span className="ed-badge-dot" style={{ background: blockCount ? '#e5b84a' : '#28c840' }} />
                      {blockCount ? `${blockCount} language(s) locked on your tier` : 'All languages unlocked'}
                    </div>
                    <button
                      type="button"
                      className="btn-workspace btn-primary"
                      onClick={handleRun}
                      style={{ background: running ? '#b45309' : '#16a34a', color: '#fff' }}
                    >
                      {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {running ? 'Stop Run' : 'Run File (⌘R)'}
                    </button>
                    <button type="button" className="btn-workspace btn-primary" onClick={handleSandboxStart}>
                      <Box className="w-4 h-4" /> Start Sandbox
                    </button>
                    {sandboxUrl && (
                      <button type="button" className="btn-workspace btn-secondary" onClick={() => setPanel('preview')}>
                        <Eye className="w-4 h-4" /> Open Live Preview
                      </button>
                    )}
                    <div className="ed-sidebar-title" style={{ padding: '0.1rem 0.55rem' }}>Deployments</div>
                    {deployments.length === 0 ? (
                      <p className="text-xs" style={{ color: '#6e6e6e', padding: '0.2rem 0.55rem' }}>Nothing deployed yet</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {deployments.slice(0, 4).map((d, i) => (
                          <div
                            key={i}
                            className="ed-scm-file"
                            style={{ cursor: 'pointer' }}
                            title="View build & runtime logs"
                            onClick={() => setLogDeployId(d._id)}
                          >
                            <span className="ed-badge-dot" style={{ background: d.status === 'success' ? '#28c840' : d.status === 'failed' ? '#f87171' : '#e5b84a' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.subdomain ? `${d.subdomain}.buildrshq.dev` : d._id || 'Deployment'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" className="btn-workspace btn-secondary" onClick={handleDeploy}>
                      <Rocket className="w-4 h-4" /> Deploy Project
                    </button>
                  </div>
                </>
              )}

              {activeSidebar === 'live' && (
                <>
                  <div className="ed-sidebar-head">
                    <span className="ed-sidebar-title">Live Share</span>
                    <div className="ed-sidebar-actions"></div>
                  </div>
                  <div className="ed-sidebar-body">
                    <div className="ed-stat">
                      <span className="ed-badge-dot" style={{ background: '#28c840' }} />
                      {collaborators.length} collaborator(s) · {Object.keys(remoteCursors).length} remote cursor(s)
                    </div>
                    <div className="ed-stat" style={{ lineHeight: 1.8 }}>
                      <span style={{ color: '#6e6e6e' }}>Invite link</span>
                      <input
                        readOnly
                        value={selectedFile ? `${window.location.origin}/editor?file=${selectedFile._id}` : `${window.location.origin}/editor`}
                        onFocus={(e) => e.target.select()}
                        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#d4d4d4', fontSize: '0.68rem' }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-workspace btn-primary"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedFile ? `${window.location.origin}/editor?file=${selectedFile._id}` : `${window.location.origin}/editor`);
                        setStatus({ type: 'success', msg: 'Invite link copied' });
                        setTimeout(() => setStatus(null), 2000);
                      }}
                    >
                      Copy Link
                    </button>
                    <div className="ed-sidebar-title" style={{ padding: '0.1rem 0.55rem' }}>Active</div>
                    {collaborators.length === 0 ? (
                      <p className="text-xs" style={{ color: '#6e6e6e', padding: '0.2rem 0.55rem' }}>No active collaborators yet</p>
                    ) : (
                      collaborators.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0.55rem' }}>
                          <div className="ed-member-av" style={{ background: 'rgba(47,214,230,0.15)', color: '#2fd6e6', width: 26, height: 26, fontSize: '0.7rem' }}>{c.name?.[0] || 'U'}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="text-xs" style={{ color: '#d4d4d4', fontWeight: 600 }}>{c.name || 'Anonymous'}</div>
                            {c.email && <div className="text-xs" style={{ color: '#6e6e6e' }}>{c.email}</div>}
                          </div>
                        </div>
                      ))
                    )}
                    {Object.values(remoteCursors).filter((rc) => rc.userName !== (user?.fullName || user?.name)).map((rc, i) => (
                      <div key={`cursor-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0.55rem' }}>
                        <div className="ed-member-av" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', width: 26, height: 26, fontSize: '0.7rem' }}>{(rc.userName || 'U')[0]}</div>
                        <div className="text-xs" style={{ color: '#8c8c8c' }}>{rc.userName} @ line {rc.cursor?.line}, col {rc.cursor?.column}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeSidebar === 'ai' && (
                <>
                  <div className="ed-sidebar-head">
                    <span className="ed-sidebar-title">AI Assistant</span>
                    <div className="ed-sidebar-actions"></div>
                  </div>
                  <div className="ed-sidebar-body is-ai">
                    {pendingConfirmations.length > 0 && (
                      <div className="ed-ai-intel" style={{ marginBottom: '0.75rem', borderColor: 'rgba(245,158,11,0.5)' }}>
                        <div className="ed-ai-intel-header">
                          <AlertCircle className="w-4 h-4" style={{ color: '#fbbf24' }} />
                          <span>Pending approvals</span>
                        </div>
                        <div className="ed-ai-suggestions" style={{ gap: '0.5rem' }}>
                          {pendingConfirmations.slice(0, 3).map((confirmation) => (
                            <div key={confirmation.id} className="ed-ai-prompt" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                              <div>
                                <strong>{confirmation.tool || 'Agent action'}</strong>
                                <small>{confirmation.preview?.action || 'A risky action needs your approval.'}</small>
                              </div>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button type="button" className="btn-workspace btn-primary" style={{ flex: 1, minHeight: 0, padding: '0.38rem 0.6rem' }} onClick={() => respondToConfirmation(confirmation.id, true)}>
                                  Approve
                                </button>
                                <button type="button" className="btn-workspace btn-secondary" style={{ flex: 1, minHeight: 0, padding: '0.38rem 0.6rem' }} onClick={() => respondToConfirmation(confirmation.id, false, 'Rejected from IDE approval panel')}>
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="ed-ai-intel" style={{ marginBottom: '0.75rem', borderColor: 'rgba(59,130,246,0.35)' }}>
                      <div className="ed-ai-intel-header">
                        <Bot className="w-4 h-4" style={{ color: '#60a5fa' }} />
                        <span>Phase 2 task board</span>
                      </div>
                      <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.5rem' }}>
                        {taskCards.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className="ed-ai-prompt"
                            onClick={() => handleTaskSelect(task.id)}
                            style={{
                              borderColor: selectedTaskId === task.id ? 'rgba(96,165,250,0.9)' : 'rgba(255,255,255,0.05)',
                              background: selectedTaskId === task.id ? 'rgba(96,165,250,0.08)' : 'rgba(255,255,255,0.02)',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <strong>{task.title}</strong>
                              <span className="pill pill-mono" style={{ background: task.priority === 'high' ? 'rgba(248,113,113,0.12)' : task.priority === 'medium' ? 'rgba(234,179,8,0.12)' : 'rgba(52,211,153,0.12)', color: task.priority === 'high' ? '#fca5a5' : task.priority === 'medium' ? '#facc15' : '#7bd197' }}>
                                {task.priority}
                              </span>
                            </div>
                            <small>{task.summary}</small>
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.6rem' }}>
                        <button type="button" className="btn-workspace btn-primary" style={{ flex: 1 }} onClick={runSelectedTask}>
                          Run selected task
                        </button>
                        <button type="button" className="btn-workspace btn-secondary" style={{ flex: 1 }} onClick={() => setSpecMode((prev) => !prev)}>
                          {specMode ? 'Spec on' : 'Spec mode'}
                        </button>
                      </div>
                      {specMode && (
                        <div style={{ marginTop: '0.6rem', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8, background: 'rgba(96,165,250,0.05)', padding: '0.6rem' }}>
                          <div style={{ color: '#d4d4d4', fontWeight: 600, marginBottom: '0.35rem' }}>Implementation contract</div>
                          <div style={{ color: '#8c8c8c', fontSize: '0.68rem', lineHeight: 1.5 }}>
                            Scope: {selectedTask?.title || 'current task'}{selectedFile ? ` • file: ${selectedFile.name}` : ''}<br />
                            Safety: require approval for destructive actions, validate changes, and keep the public contract stable.
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.6rem', gap: '0.5rem' }}>
                        <button type="button" className="btn-workspace btn-secondary" style={{ flex: 1 }} onClick={() => setByomOpen((prev) => !prev)}>
                          BYOM model
                        </button>
                        <span style={{ color: '#8c8c8c', fontSize: '0.68rem' }}>{customModel}</span>
                      </div>
                      {byomOpen && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem' }}>
                          <input
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                            className="ws-input"
                            style={{ flex: 1 }}
                            placeholder="model name"
                          />
                        </div>
                      )}
                    </div>

                    {agentExecution && (
                      <div className="ed-ai-intel" style={{ marginBottom: '0.75rem', borderColor: 'rgba(47,214,230,0.5)' }}>
                        <div className="ed-ai-intel-header">
                          <Bot className="w-4 h-4" style={{ color: '#2fd6e6' }} />
                          <span>{agentExecution.title}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', color: '#d4d4d4', fontSize: '0.7rem' }}>
                          <span style={{ textTransform: 'capitalize' }}>{agentExecution.status}</span>
                          <span style={{ color: '#7bd197' }}>{agentExecution.diffSummary?.filesChanged || 0} files</span>
                        </div>
                        <div style={{ marginTop: '0.3rem', color: '#8c8c8c', fontSize: '0.64rem', lineHeight: 1.5 }}>
                          {agentExecution.goal || agentExecution.title}
                        </div>
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', fontSize: '0.68rem', color: '#a0a0a0' }}>
                          <span>+{agentExecution.diffSummary?.insertions || 0}</span>
                          <span>-{agentExecution.diffSummary?.deletions || 0}</span>
                        </div>
                        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.68rem', color: '#cfd4dc' }}>
                          {agentExecution.logs.slice(-4).map((log, idx) => (
                            <div key={`${log}-${idx}`} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, padding: '0.35rem 0.45rem' }}>
                              {log}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.65rem' }}>
                          <button type="button" className="btn-workspace btn-primary" style={{ flex: 1, minHeight: 0, padding: '0.38rem 0.6rem' }} onClick={() => settleAgentExecution(true)} disabled={agentExecution.status === 'completed' || agentExecution.status === 'rejected'}>
                            {agentExecution.status === 'awaiting_approval' ? 'Approve' : 'Apply'}
                          </button>
                          <button type="button" className="btn-workspace btn-secondary" style={{ flex: 1, minHeight: 0, padding: '0.38rem 0.6rem' }} onClick={() => settleAgentExecution(false)} disabled={agentExecution.status === 'completed' || agentExecution.status === 'rejected'}>
                            Tweak
                          </button>
                          <button type="button" className="btn-workspace btn-secondary" style={{ flex: 1, minHeight: 0, padding: '0.38rem 0.6rem', color: '#fca5a5' }} onClick={() => settleAgentExecution(false)} disabled={agentExecution.status === 'completed' || agentExecution.status === 'rejected'}>
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {aiMessages.length === 0 && (
                      <div className="ed-ai-intel">
                        <div className="ed-ai-intel-header">
                          <Bot className="w-4 h-4" />
                          <span>Product intelligence</span>
                        </div>
                        <div className="ed-ai-suggestions">
                          {SMART_PROMPTS.map(({ label, hint, icon: Icon }) => (
                            <button key={label} type="button" className="ed-ai-prompt" onClick={() => setAiInput(`${label} ${selectedFile ? `for ${selectedFile.name}` : ''}`)}>
                              <Icon className="w-3.5 h-3.5" />
                              <div>
                                <strong>{label}</strong>
                                <small>{hint}</small>
                              </div>
                            </button>
                          ))}
                        </div>
                        <button type="button" className="btn-workspace btn-primary" style={{ marginTop: '0.6rem' }} onClick={runSelectedTask}>
                          Run agent task
                        </button>
                      </div>
                    )}
                    <div className="ed-chat">
                      {aiMessages.length === 0 ? (
                        <div className="ed-empty">
                          <Bot className="w-6 h-6" />
                          <p className="text-xs">Ask about your code, get completions, or request refactors.</p>
                        </div>
                      ) : aiMessages.map((m, i) => (
                        <div key={i} className={`ed-chat-bubble ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
                          {m.content}
                        </div>
                      ))}
                      {aiLoading && <div className="ed-chat-gap" style={{ color: '#2fd6e6' }}>Thinking...</div>}
                    </div>
                    <form onSubmit={handleAiHelperSend} className="ed-composer">
                      <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask AI to explain or refactor..." />
                      <button type="submit" disabled={aiLoading || !aiInput.trim()} className="btn-workspace btn-primary" style={{ minHeight: 0, padding: '0.45rem 0.7rem' }}>
                        <Bot className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </>
              )}

              {activeSidebar === 'extensions' && (
                <>
                  <div className="ed-sidebar-head">
                    <span className="ed-sidebar-title">Extensions</span>
                    <div className="ed-sidebar-actions"></div>
                  </div>
                  <div className="ed-sidebar-body">
                    <div className="ed-stat">
                      <span className="ed-badge-dot" style={{ background: blockCount ? '#e5b84a' : '#28c840' }} />
                      Environment: <b>{tier || subscription?.tier || 'Free'}</b> · {extList.length}/{languages.length || '—'} languages active
                    </div>
                    <div className="ed-sidebar-title" style={{ padding: '0.1rem 0.55rem' }}>Productivity</div>
                    {FEATURE_MODULES.map((m) => (
                      <div key={m.id} className="ed-ext-item">
                        <div className="ed-ext-ico"><m.icon className="w-4 h-4" /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="ed-ext-name">{m.name}</div>
                          <div className="ed-ext-sub">{m.sub}</div>
                        </div>
                        <span className="pill pill-mono" style={{ marginLeft: 'auto', background: 'rgba(52,211,153,0.12)', color: '#7bd197' }}>on</span>
                      </div>
                    ))}
                    <div className="ed-sidebar-title" style={{ padding: '0.1rem 0.55rem' }}>Languages</div>
                    {languages.length === 0 ? (
                      <p className="text-xs" style={{ color: '#6e6e6e', padding: '0.2rem 0.55rem' }}>No language catalog yet</p>
                    ) : (
                      languages.map((l) => {
                        const glyphColor = LANG_COLORS()[l.name] || '#8c8c8c';
                        const glyphText = (l.name || '').slice(0, 2).toUpperCase() || 'FILE';
                        return (
                          <div key={l.name} className="ed-ext-item" style={{ padding: '0.4rem 0.55rem' }}>
                            <svg className="ed-file-glyph ed-file-glyph-sm" viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="2" y="2" width="20" height="20" rx="5" fill={glyphColor} />
                              <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#0b1020" fontFamily="ui-sans-serif, system-ui, sans-serif">{glyphText}</text>
                            </svg>
                            <div>
                              <div className="ed-ext-name" style={{ fontSize: '0.74rem' }}>{l.name}</div>
                            </div>
                            <span className={`pill pill-mono ${l.allowed === false ? 'is-free' : ''}`} style={{ marginLeft: 'auto', ...(l.allowed === false ? { background: 'rgba(248,113,113,0.12)', color: '#f87171' } : { background: 'rgba(52,211,153,0.12)', color: '#7bd197' }) }}>
                              {l.allowed === false ? 'locked' : 'active'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </aside>
          )}

          {/* ---- Editor group ---- */}
          <div className="ed-main">
            <div className="ed-tabsbar">
              {openFiles.map((f) => {
                const fileKey = getFileKey(f);
                const isActive = getFileKey(selectedFile) === fileKey;
                const fDirty = openDirtyRef.current[fileKey] || (isActive && dirty);
                return (
                  <div key={fileKey} className={`ed-tabhead ${isActive ? 'is-active' : ''}`} onClick={() => selectFile(f)} role="button">
                    {getLanguageGlyph(f.name)}
                    <span className="ed-tabname">{f.name}</span>
                    {fDirty ? <span className="ed-tabdirty" /> : null}
                    <button type="button" className="ed-tabclose" onClick={(e) => closeTab(f, e)} title="Close (⌘W)">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              <div className="ed-tabsbar-right">
                {selectedFile && (
                  <>
                    <button
                      type="button"
                      className="btn-workspace btn-primary"
                      onClick={handleRun}
                      title={running ? 'Stop run' : 'Run file (⌘R)'}
                      style={{ background: running ? '#b45309' : '#16a34a', color: '#fff' }}
                    >
                      {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      {running ? 'Stop' : 'Run'}
                    </button>
                    <button type="button" className="btn-workspace btn-secondary" onClick={() => handleDelete(selectedFile)} title="Delete file" style={{ color: '#f87171' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="btn-workspace btn-primary" onClick={handleSave} disabled={saving || !dirty}>
                      <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="ed-breadcrumb">
              {selectedFile ? (
                <>
                  <FolderOpen className="w-3 h-3" style={{ color: '#2fd6e6' }} />
                  <span>{selectedProject ? selectedProject.name : selectedRepo ? (selectedRepo.fullName || selectedRepo.name) : 'workspace'}</span>
                  {filePathSegs.map((seg, i) => (
                    <span key={`${seg}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="ed-breadcrumb-sep">›</span>
                      <span style={i === filePathSegs.length - 1 ? { color: '#d4d4d4' } : undefined}>{seg}</span>
                    </span>
                  ))}
                </>
              ) : (
                <span style={{ color: '#6e6e6e' }}>No file open — select a file from the Explorer</span>
              )}
            </div>

            <div className="ed-editor">
              {status && (
                <div className={`ed-alert ${status.type === 'success' ? 'ed-alert-success' : 'ed-alert-error'}`}>
                  {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {status.msg}
                </div>
              )}
              {!selectedFile ? (
                <div className="ed-ide-empty">
                  <FileCode className="w-8 h-8" />
                  <p>Select a file to start editing</p>
                  <button type="button" className="btn-workspace btn-primary" onClick={() => setShowNewModal(true)}>New File</button>
                </div>
              ) : (
                <div className="ed-code-wrap">
                  <MonacoEditor
                    height="100%"
                    language={monacoLanguage}
                    value={content}
                    onChange={handleEditorChange}
                    onMount={handleEditorMount}
                    theme="vs-dark"
                    options={monacoOptions}
                    loading={<div className="ed-ide-empty">Loading editor...</div>}
                  />
                </div>
              )}
            </div>

            {/* ---- Bottom panel ---- */}
            {panel && (
              <div className={`ed-panel ${panel === 'deploy' ? 'is-deploy' : ''}`}>
                <div className="ed-panelbar">
                  {[
                    { id: 'terminal', label: 'Terminal', icon: Terminal },
                    { id: 'problems', label: 'Problems', icon: AlertCircle },
                    { id: 'output', label: 'Output', icon: FileCode },
                    { id: 'preview', label: 'Preview', icon: Eye },
                    { id: 'deploy', label: 'Deployments', icon: Rocket },
                  ].map((t) => (
                    <button key={t.id} type="button" className={`ed-panel-tab ${panel === t.id ? 'is-active' : ''}`} onClick={() => setPanel(t.id)}>
                      <t.icon className="w-3.5 h-3.5" /> {t.label}
                      {t.id === 'problems' && (problemCounts.error > 0 || blockCount > 0) && (
                        <span style={{ color: problemCounts.error > 0 ? '#f87171' : '#e5b84a' }}> {problemCounts.error || blockCount}</span>
                      )}
                    </button>
                  ))}
                  <div className="ed-panel-actions">
                    {panel === 'output' && outputLines.length > 0 && (
                      <button type="button" className="ed-panel-close" onClick={copyOutput} title="Copy output">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {panel === 'output' && outputLines.length > 0 && (
                      <button type="button" className="ed-panel-close" onClick={clearOutput} title="Clear output">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button type="button" className="ed-panel-close" onClick={() => setPanel(null)} title="Close panel"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="ed-panel-body">
                  {panel === 'terminal' && (
                    <div className="ed-term-shell">
                      <div className="ed-term-toolbar">
                        <div className="ed-term-meta">
                          <span className={`ed-term-capsule ${termInfo ? 'is-live' : ''}`}>{termInfo ? 'LIVE' : 'CONNECTING'}</span>
                          <span className="ed-term-label">
                            {termInfo ? (termInfo.type === 'pty' ? 'Workspace Shell · PTY' : 'Workspace Shell · simulated') : 'Workspace Shell'}
                          </span>
                        </div>
                        <div className="ed-term-actions">
                          <span className="ed-term-pill">{termInfo?.type === 'simulated' ? 'Bash (sim)' : 'Bash'}</span>
                          {termInfo?.sessionId && <span className="ed-term-pill">{String(termInfo.sessionId).slice(-10)}</span>}
                        </div>
                      </div>
                      <div ref={terminalRef} className="ed-term-root" />
                    </div>
                  )}

                  {panel === 'problems' && (
                    <>
                      <div className="ed-stat">
                        {problemCounts.error === 0 && problemCounts.warning === 0 && problemCounts.info === 0 ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 ed-status-ok" style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
                            0 errors · 0 warnings — no problems detected
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5" style={{ color: problemCounts.error ? '#f87171' : '#e5b84a', verticalAlign: '-2px', marginRight: '0.4rem' }} />
                            {problemCounts.error} error(s) · {problemCounts.warning} warning(s) · {problemCounts.info} info
                          </>
                        )}
                      </div>
                      {allProblems.length > 0 && (
                        <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
                          {allProblems.map((p, i) => (
                            <button
                              key={`${p.file || ''}:${p.line || 0}:${p.column || 0}:${i}`}
                              type="button"
                              className="ed-scm-file ed-scm-file-btn"
                              style={{
                                width: '100%', textAlign: 'left',
                                color: p.severity === 'error' ? '#f87171' : p.severity === 'warning' ? '#e5b84a' : '#7bd197',
                              }}
                              onClick={() => {
                                if (p.line) jumpToProblem(p);
                              }}
                              title={p.message}
                            >
                              <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline' }}>
                                <span style={{ color: '#6e6e6e', fontSize: '0.66rem', whiteSpace: 'nowrap' }}>
                                  {p.file ? `${p.file}:` : ''}{p.line || 1}:{p.column || 1}
                                </span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.message}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {blockCount > 0 ? (
                        <div className="ed-stat">
                          <AlertCircle className="w-3.5 h-3.5" style={{ color: '#e5b84a', verticalAlign: '-2px', marginRight: '0.4rem' }} />
                          {blockCount} language(s) unavailable on your current tier — upgrade to unlock {blockCount <= 1 ? 'it' : 'them'}.
                        </div>
                      ) : null}
                      {modifiedCount > 0 && (
                        <div className="ed-stat">
                          <GitBranch className="w-3.5 h-3.5" style={{ color: '#e5b84a', verticalAlign: '-2px', marginRight: '0.4rem' }} />
                          {modifiedCount} modified file(s) — commit them from Source Control.
                        </div>
                      )}
                      {!allProblems.length && !blockCount && !modifiedCount && (
                        <div className="ed-stat">All systems nominal. No problems to report.</div>
                      )}
                    </>
                  )}

                  {panel === 'output' && (
                    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '0.72rem' }}>
                      {outputLines.length === 0 ? (
                        <div className="ed-empty" style={{ flex: 1 }}>
                          <Play className="w-6 h-6" />
                          <p className="text-xs">Run a file to see build &amp; program output here</p>
                        </div>
                      ) : (
                        <div style={{ overflowY: 'auto', minHeight: 0, flex: 1, padding: '0.35rem 0.6rem' }}>
                          {outputLines.map((l, i) => {
                            const segs = ansiSegments(l.text);
                            return (
                              <div
                                key={i}
                                style={{
                                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
                                  color: l.kind === 'err' ? '#f87171' : l.kind === 'sys' ? '#7bd197' : '#c7d3df',
                                }}
                              >
                                {segs.length === 0 ? ' ' : segs.map((seg, j) => (
                                  <span
                                    key={j}
                                    style={{
                                      ...(seg.fg ? { color: seg.fg } : null),
                                      ...(seg.bg ? { backgroundColor: seg.bg } : null),
                                      ...(seg.bold ? { fontWeight: 700 } : null),
                                      ...(seg.dim ? { opacity: 0.65 } : null),
                                      ...(seg.underline ? { textDecoration: 'underline' } : null),
                                    }}
                                  >
                                    {seg.text}
                                  </span>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {panel === 'preview' && (
                    <>
                      <div className="ed-intel-grid">
                        <div className="ed-intel-card">
                          <span className="ed-intel-label">Preview</span>
                          <strong>{sandboxUrl ? 'Live' : 'Idle'}</strong>
                          <small>{sandboxUrl ? 'Sandbox is running' : 'No sandbox started yet'}</small>
                        </div>
                        <div className="ed-intel-card">
                          <span className="ed-intel-label">Design</span>
                          <strong>{selectedFigmaFile ? 'Connected' : 'Not linked'}</strong>
                          <small>{selectedFigmaFile ? selectedFigmaFile.name || 'Selected design' : 'Connect a Figma file to generate code'}</small>
                        </div>
                        <div className="ed-intel-card">
                          <span className="ed-intel-label">Active file</span>
                          <strong>{selectedFile ? selectedFile.name : 'No file'}</strong>
                          <small>{selectedFile ? `${selectedFile.language || detectLanguage(selectedFile.name)} source` : 'Open a file to preview it'}</small>
                        </div>
                      </div>
                      {sandboxUrl ? (
                        <iframe src={sandboxUrl} className="w-full flex-1" style={{ background: '#ffffff', border: 'none', borderRadius: '6px', minHeight: 0 }} title="Live preview" />
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', minHeight: 0, flex: 1 }}>
                          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span className="ed-sidebar-title">Figma Design</span>
                            {!selectedFigmaFile ? (
                              figmaFiles.length === 0 ? (
                                <div className="ed-stat" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}>
                                  <Layers className="w-6 h-6" style={{ color: '#6e6e6e' }} />
                                  <span>No Figma files connected</span>
                                  <a href="/integrations" className="btn-workspace btn-secondary">Connect Figma</a>
                                </div>
                              ) : (
                                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  {figmaFiles.map((f) => (
                                    <button key={f.key || f.id} type="button" className="ed-drop-item" onClick={() => setSelectedFigmaFile(f)}>
                                      <Layers className="w-3.5 h-3.5" />
                                      <span style={{ minWidth: 0 }}>
                                        <span className="block truncate text-xs">{f.name || f.key}</span>
                                        <span className="block text-xs" style={{ color: '#6e6e6e' }}>{f.last_modified ? new Date(f.last_modified).toLocaleDateString() : ''}</span>
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )
                            ) : (
                              <div className="ed-design-pane" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div className="ed-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                                  <button type="button" onClick={() => setSelectedFigmaFile(null)} style={{ color: '#2fd6e6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.66rem' }}>← All files</button>
                                  <span className="truncate" style={{ color: '#bbbbbb' }}>{selectedFigmaFile.name || selectedFigmaFile.key}</span>
                                </div>
                                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {selectedFigmaFile.thumbnail_url ? (
                                    <img src={selectedFigmaFile.thumbnail_url} alt={selectedFigmaFile.name || 'design'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                  ) : (
                                    <Layers className="w-8 h-8" style={{ color: '#3c3c3c' }} />
                                  )}
                                </div>
                                <button type="button" className="btn-workspace btn-primary" onClick={generateFromDesign}>
                                  <Bot className="w-3.5 h-3.5" /> Generate React code
                                </button>
                              </div>
                            )}
                          </div>
                          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span className="ed-sidebar-title">Code</span>
                            <div className="ed-code-wrap">
                              {selectedFile ? (
                                <MonacoEditor height="100%" language={monacoLanguage} value={content} onChange={handleEditorChange} theme="vs-dark"
                                  options={monacoPreviewOptions} />
                              ) : (
                                <div className="ed-ide-empty">Select a file to preview</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {panel === 'deploy' && (
                    <>
                      <div className="ed-intel-grid">
                        <div className="ed-intel-card">
                          <span className="ed-intel-label">Deploys</span>
                          <strong>{deployments.length}</strong>
                          <small>Current deployment records</small>
                        </div>
                        <div className="ed-intel-card">
                          <span className="ed-intel-label">Environment</span>
                          <strong>{subscription?.tier === 'enterprise' ? 'Enterprise' : subscription?.tier === 'professional' ? 'Pro' : 'Free'}</strong>
                          <small>{blockCount ? `${blockCount} language(s) locked` : 'Full toolchain enabled'}</small>
                        </div>
                        <div className="ed-intel-card">
                          <span className="ed-intel-label">Workspace</span>
                          <strong>{selectedProject ? selectedProject.name : 'Default'}</strong>
                          <small>{workspaceId ? 'Linked and ready to ship' : 'Add a workspace to deploy'}</small>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-workspace btn-primary" onClick={handleDeploy}>
                          <Rocket className="w-4 h-4" /> New Deployment
                        </button>
                        <button type="button" className="btn-workspace btn-secondary" onClick={loadDeployments}>
                          <RefreshCw className="w-3.5 h-3.5" /> Refresh
                        </button>
                        <span className="text-xs" style={{ color: '#6e6e6e' }}>One-click static deploy → .buildrshq.dev</span>
                      </div>

                      {showSubdomainInput && (
                        <form onSubmit={confirmDeploy} className="ed-stat" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <label className="ws-label" style={{ color: '#8c8c8c' }}>Choose a subdomain</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="text" value={deploySubdomain} onChange={(e) => setDeploySubdomain(e.target.value.replace(/[^a-z0-9-]/g, '-').toLowerCase())}
                              placeholder="my-app" className="ws-input"
                              style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', background: '#1e1e1e', borderColor: '#3c3c3c' }}
                              autoFocus required minLength={2} />
                            <span className="text-sm whitespace-nowrap" style={{ color: '#6e6e6e' }}>.buildrshq.dev</span>
                            <button type="submit" disabled={deploying || deploySubdomain.length < 2} className="btn-workspace btn-primary">
                              {deploying ? 'Deploying...' : 'Deploy'}
                            </button>
                            <button type="button" onClick={() => setShowSubdomainInput(false)} className="btn-workspace btn-secondary">
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </form>
                      )}

                      {deployments.length === 0 ? (
                        <div className="ed-stat">No deployments yet — deploy your first project.</div>
                      ) : (
                        deployments.map((d, i) => (
                          <div key={i} className="ed-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <div style={{ minWidth: 0 }}>
                              <div className="text-sm" style={{ color: d.deployedUrl ? '#2fd6e6' : '#d4d4d4' }}>
                                {d.deployedUrl ? (
                                  <a href={d.deployedUrl} target="_blank" rel="noreferrer" style={{ color: '#2fd6e6' }}>{d.deployedUrl}</a>
                                ) : d.subdomain ? (
                                  <span>{d.subdomain}.buildrshq.dev</span>
                                ) : (
                                  <span>{d._id || `Deploy #${i + 1}`}</span>
                                )}
                              </div>
                              <div className="text-xs" style={{ color: '#6e6e6e' }}>
                                {d.status} {(d.projectId?.name ? `• ${d.projectId.name}` : '')} • {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                              <span className="pill pill-mono" style={
                                d.status === 'success' ? { background: 'rgba(52,211,153,0.12)', color: '#7bd197' } :
                                d.status === 'failed' ? { background: 'rgba(248,113,113,0.12)', color: '#f87171' } :
                                d.status === 'building' || d.status === 'deploying' ? { background: 'rgba(229,184,74,0.12)', color: '#e5b84a' } :
                                { background: 'rgba(255,255,255,0.06)', color: '#8c8c8c' }
                              }>{d.status}</span>
                              <button type="button" onClick={() => setLogDeployId(d._id)} className="text-xs" style={{ color: '#8c8c8c' }} title="View logs">
                                Logs
                              </button>
                              {(d.status === 'success' || d.status === 'failed') && (
                                <button type="button" onClick={() => stopDeployment(d._id, d.subdomain)} className="text-xs" style={{ color: '#f87171' }}>Stop</button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
</>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- Status bar ---- */}
          <footer className="ed-statusbar">
            <div className="ed-status-left">
              <span className="ed-status-icon" title="Branch">
                <GitBranch className="w-3 h-3" />
                <span>{gitStatus?.branch || 'main'}</span>
              </span>
              <span className="ed-status-icon" title="Git sync" onClick={() => handleGitAction('status')}>
                <RefreshCw className={`w-3 h-3 ${saving || loading ? 'animate-spin' : ''}`} />
                {modifiedCount > 0 && <span data-badge={modifiedCount}>MC</span>}
              </span>
              <span className="ed-status-icon" title="Live collaborators">
                <Users className="w-3 h-3" />
                <span>{collaborators.length}{Object.keys(remoteCursors).length > collaborators.length ? '+' : ''}</span>
              </span>
            </div>
            <div className="ed-status-right">
              {dirty && <span className="ed-status-icon" style={{ color: '#e5b84a' }} title="Unsaved changes">● Modified</span>}
              <button type="button" className="ed-status-item" onClick={() => setPaletteOpen(true)} title="Command Palette (⌘P)">
                <Search className="w-3 h-3" /> ⌘P
              </button>
              <span className="ed-status-item">Ln {cursorPos.line}, Col {cursorPos.col}</span>
              <span className="ed-status-item">{(selectedFile?.language || detectLanguage(selectedFile?.name) || 'text').toUpperCase()}</span>
              <span className="ed-status-item">UTF-8</span>
              <span className="ed-status-item">Spaces: 2</span>
              <span className={`ed-tier-badge ${subscription?.tier === 'professional' ? 'is-pro' : subscription?.tier === 'enterprise' ? '' : 'is-free'}`}>
                {subscription?.tier === 'enterprise' ? 'Enterprise' : subscription?.tier === 'professional' ? 'Pro' : 'Free'}
              </span>
            </div>
          </footer>
        </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="ws-modal w-full max-w-lg" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <FilePlus className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Create New File</h2>
              </div>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateFile} className="p-5 space-y-4">
              <div>
                <label className="ws-label">File Name</label>
                <input type="text" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="e.g. app.js" className="ws-input" autoFocus required />
              </div>
              <div>
                <label className="ws-label">Path (folder)</label>
                <input type="text" value={newFilePath} onChange={(e) => setNewFilePath(e.target.value)} placeholder="/src" className="ws-input" />
              </div>
              <div>
                <label className="ws-label">Language</label>
                <select value={newFileLang} onChange={(e) => setNewFileLang(e.target.value)} className="ws-select">
                  {(languages.length > 0 ? languages : [{ name: 'javascript' }, { name: 'python' }, { name: 'typescript' }, { name: 'html' }, { name: 'css' }, { name: 'json' }, { name: 'markdown' }, { name: 'plaintext' }]).map((lang) => (
                    <option key={lang.name} value={lang.name} disabled={lang.allowed === false}>{lang.name}{lang.allowed === false ? ' (unavailable)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ws-label">Initial Content</label>
                <textarea value={newFileContent} onChange={(e) => setNewFileContent(e.target.value)} placeholder="// Start writing code here..." className="ws-textarea w-full font-mono text-sm" style={{ minHeight: '150px', tabSize: 2 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button type="button" className="btn-workspace btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
                <button type="submit" className="btn-workspace btn-primary flex items-center gap-2" disabled={creating || !newFileName.trim()}>
                  <FilePlus className="w-4 h-4" />
                  {creating ? 'Creating...' : 'Create File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="ws-modal w-full max-w-lg" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <FolderPlus className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Create New Folder</h2>
              </div>
              <button type="button" onClick={() => setShowNewFolderModal(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateFolder} className="p-5 space-y-4">
              <div>
                <label className="ws-label">Folder Name</label>
                <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g. src" className="ws-input" autoFocus required />
              </div>
              <div>
                <label className="ws-label">Parent Path</label>
                <input type="text" value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)} placeholder="/" className="ws-input" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button type="button" className="btn-workspace btn-secondary" onClick={() => setShowNewFolderModal(false)}>Cancel</button>
                <button type="submit" className="btn-workspace btn-primary flex items-center gap-2" disabled={creating || !newFolderName.trim()}>
                  <FolderPlus className="w-4 h-4" />
                  {creating ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {repoCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="ws-modal w-full max-w-lg" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <GitBranch className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Create GitHub Repository</h2>
              </div>
              <button type="button" onClick={() => { setRepoCreateOpen(false); setRepoCreateError(null); }} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateGithubRepo} className="p-5 space-y-4">
              <div>
                <label className="ws-label">Repository Name</label>
                <input type="text" value={repoCreateName} onChange={(e) => setRepoCreateName(e.target.value)} placeholder="my-project" className="ws-input" autoFocus required />
              </div>
              <div>
                <label className="ws-label">Description</label>
                <textarea value={repoCreateDescription} onChange={(e) => setRepoCreateDescription(e.target.value)} placeholder="Project summary and purpose" className="ws-textarea w-full font-mono text-sm" rows={3} />
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: '#d4d4d4' }}>
                <input type="checkbox" checked={repoCreatePrivate} onChange={(e) => setRepoCreatePrivate(e.target.checked)} />
                Make this repository private
              </label>
              {repoCreateError && <p className="text-xs text-[#f87171]">{repoCreateError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button type="button" className="btn-workspace btn-secondary" onClick={() => { setRepoCreateOpen(false); setRepoCreateError(null); }}>Cancel</button>
                <button type="submit" className="btn-workspace btn-primary flex items-center gap-2" disabled={repoCreateBusy || !repoCreateName.trim()}>
                  <GitBranch className="w-4 h-4" />
                  {repoCreateBusy ? 'Creating...' : 'Create Repo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div className="ed-palette-backdrop" onClick={() => setPaletteOpen(false)}>
          <div className="ed-palette" onClick={(e) => e.stopPropagation()}>
            <div className="ed-palette-head">
              <Search className="w-4 h-4" />
              <input
                autoFocus
                className="ed-palette-input"
                placeholder="Type a command or file name..."
                value={paletteQuery}
                onChange={(e) => { setPaletteQuery(e.target.value); setPaletteIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex((i) => Math.min(i + 1, paletteEntries.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex((i) => Math.max(i - 1, 0)); }
                  else if (e.key === 'Enter') { e.preventDefault(); const ent = paletteEntries[paletteIndex]; if (ent) runPaletteEntry(ent); }
                  else if (e.key === 'Escape') { setPaletteOpen(false); }
                }}
              />
            </div>
            <div className="ed-palette-list">
              {paletteEntries.length === 0 ? (
                <div className="ed-palette-empty">No matching commands or files</div>
              ) : (
                paletteEntries.map((ent, i) => (
                  <button key={`${ent.kind}-${ent.label}-${i}`} type="button"
                    className={`ed-palette-item ${i === paletteIndex ? 'is-hl' : ''}`}
                    onMouseEnter={() => setPaletteIndex(i)}
                    onClick={() => runPaletteEntry(ent)}>
                    <ent.icon className="w-4 h-4" />
                    <span>{ent.label}</span>
                    <span className="ed-palette-kind">{ent.kind}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setAboutOpen(false)}>
          <div className="ws-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <Puzzle className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Buildrs HQ IDE</h2>
              </div>
              <button type="button" onClick={() => setAboutOpen(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: '#eceef1' }}>Version 1.0 · Code editor with Live Share</p>
                <p className="text-xs" style={{ color: '#9aa1ae', lineHeight: 1.6 }}>
                  Enterprise editor: version control, one-click deploys, sandboxed terminal,
                  AI assistance and real-time collaboration.
                </p>
              </div>
              <div>
                <p className="ws-label">Keyboard Shortcuts</p>
                <div className="ed-stat" style={{ lineHeight: 2 }}>
                  ⌘S Save · ⌘R Run · ⌘B Toggle Sidebar · ⌘P Command Palette<br />
                  ⌘` Terminal · ⌘W Close Tab · ⌘N New File
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <a href="/support" className="btn-workspace btn-secondary">Contact Support</a>
                <button type="button" className="btn-workspace btn-primary" onClick={() => setAboutOpen(false)}>Got it</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDiscard}
        onClose={() => setConfirmDiscard(null)}
        onConfirm={handleConfirmDiscard}
        title="Unsaved Changes"
        message="You have unsaved changes. Discard them and switch files?"
        confirmText="Discard"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={!!confirmClose}
        onClose={() => setConfirmClose(null)}
        onConfirm={handleConfirmClose}
        title="Unsaved Changes"
        message={`Close "${confirmClose?.name || 'this file'}" without saving?`}
        confirmText="Close"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete File"
        message={`Are you sure you want to delete "${confirmDelete?.name || 'this file'}"?`}
        confirmText="Delete"
        variant="danger"
      />

      {logDeployId && (
        <DeploymentLogsModal
          deploymentId={logDeployId}
          onClose={() => setLogDeployId(null)}
          onUpdate={handleDeploymentUpdate}
        />
      )}

      {diffOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-3xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <GitBranch className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Diff — {diffFile}</h2>
              </div>
              <button type="button" onClick={() => setDiffOpen(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5" style={{ overflow: 'auto', flex: 1 }}>
              {diffLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading diff...
                </div>
              ) : diffData && diffData.length > 0 ? (
                diffData.map((file, i) => (
                  <div key={i} className="mb-4">
                    <p className="ed-stat" style={{ color: '#9aa1ae', marginBottom: 6 }}>
                      {file.oldPath !== file.newPath ? `${file.oldPath} → ${file.newPath}` : file.newPath}
                    </p>
                    {file.hunks.map((hunk, j) => (
                      <div key={j} className="ws-code-block">
                        <p className="ed-stat" style={{ color: '#e5b84a', padding: '0.2rem 0.5rem' }}>
                          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.header}
                        </p>
                        {hunk.changes.map((chg, k) => (
                          <div
                            key={k}
                            className="ws-diff-line"
                            style={{
                              color: chg.type === 'add' ? '#7ee787' : chg.type === 'remove' ? '#ff7b72' : '#c9d1d9',
                              background: chg.type === 'add' ? 'rgba(46,160,67,0.15)' : chg.type === 'remove' ? 'rgba(248,81,73,0.15)' : 'transparent',
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                              fontSize: '0.72rem',
                              lineHeight: 1.5,
                              padding: '0.1rem 0.5rem',
                            }}
                          >
                            {chg.type === 'add' ? '+' : chg.type === 'remove' ? '-' : ' '}{chg.content}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No diff found for this file.</p>
              )}
            </div>
            <div className="p-4 border-t border-[rgba(255,255,255,0.09)]">
              <button type="button" className="btn-workspace btn-secondary" onClick={() => setDiffOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {prOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <GitPullRequestArrow className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Create Pull Request</h2>
              </div>
              <button type="button" onClick={() => { setPrOpen(false); setPrError(null); setPrDone(null); }} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createPR} className="p-5 space-y-4">
              {selectedRepo ? (
                <p className="text-xs text-muted">
                  Repo: <b className="text-white">{selectedRepo.fullName || `${selectedRepo.owner}/${selectedRepo.name}`}</b> ·
                  head: <b className="text-white">{gitStatus?.branch || 'main'}</b>
                </p>
              ) : (
                <p className="text-xs text-[#f87171]">Select a GitHub repository in the Explorer first.</p>
              )}
              <div>
                <label className="ws-label">Title *</label>
                <input type="text" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} className="ws-input" placeholder="Summary of changes" required disabled={!selectedRepo} />
              </div>
              <div>
                <label className="ws-label">Body</label>
                <textarea value={prBody} onChange={(e) => setPrBody(e.target.value)} className="ws-input" rows={4} placeholder="Describe the motivation and changes" disabled={!selectedRepo} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="ws-label">Base branch</label>
                  <input type="text" value={prBase} onChange={(e) => setPrBase(e.target.value)} className="ws-input" placeholder="main" disabled={!selectedRepo} />
                </div>
                <div className="flex-1">
                  <label className="ws-label">Head branch</label>
                  <input type="text" value={gitStatus?.branch || 'main'} className="ws-input" disabled />
                </div>
              </div>
              {prError && <p className="text-xs text-[#f87171]">{prError}</p>}
              {prDone && <p className="text-xs text-[#7ee787]">{prDone}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-workspace btn-secondary" onClick={() => { setPrOpen(false); setPrError(null); setPrDone(null); }}>Cancel</button>
                <button type="submit" className="btn-workspace btn-primary" disabled={prBusy || !selectedRepo}>
                  {prBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitPullRequestArrow className="w-4 h-4" />}
                  {prBusy ? 'Creating...' : 'Create Pull Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {codegenOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-2xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '86vh' }}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.09)]">
              <div className="flex items-center gap-2.5">
                <span className="card-ico">
                  <Layers className="w-4 h-4" />
                </span>
                <h2 className="ws-modal-title">Design → Code</h2>
              </div>
              <button type="button" onClick={() => setCodegenOpen(false)} className="text-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5" style={{ overflow: 'auto', flex: 1 }}>
              {codegenLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading design and generating code...
                </div>
              ) : codegenError ? (
                <p className="text-sm text-[#f87171]">{codegenError}</p>
              ) : codegenResult ? (
                <div className="space-y-4">
                  <p className="text-xs text-muted">
                    {codegenResult.title} · {codegenResult.target} · {codegenResult.files?.length || 0} file(s) · {codegenResult.tokenCount || 0} tokens found
                  </p>
                  {codegenResult.files?.length > 0 ? (
                    codegenResult.files.map((f, i) => (
                      <div key={i} className="ws-code-block">
                        <div className="ed-stat" style={{ padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span>{f.name}</span>
                          <button type="button" className="btn-workspace btn-secondary" style={{ fontSize: '0.66rem', padding: '0.15rem 0.5rem' }} onClick={() => saveCodegenFile(f)}>
                            Save to project
                          </button>
                        </div>
                        <textarea readOnly value={f.content} style={{ width: '100%', minHeight: 180, background: '#111', color: '#c9d1d9', border: 'none', outline: 'none', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.72rem', lineHeight: 1.5, padding: '0.6rem', resize: 'vertical', whiteSpace: 'pre', overflow: 'auto' }} />
                      </div>
                    ))
                  ) : (
                    <pre className="text-xs" style={{ color: '#c9d1d9', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>{codegenResult.content}</pre>
                  )}
                </div>
              ) : null}
            </div>
            <div className="p-4 border-t border-[rgba(255,255,255,0.09)] flex items-center justify-between gap-3">
              {codegenResult && !codegenLoading && (
                <button type="button" className="btn-workspace btn-primary" onClick={generateFromDesign}>
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </button>
              )}
              <button type="button" className="btn-workspace btn-secondary" onClick={() => setCodegenOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}