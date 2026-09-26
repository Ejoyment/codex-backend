import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';
import {
  Save, ChevronDown, ChevronRight, FileCode, Terminal, Bot, Layers, Rocket, Box,
  Users, GitBranch, Eye, X, FolderOpen, Search, Settings, Folder, Trash2,
  FolderPlus, AlertCircle, CheckCircle, XCircle, RefreshCw, Puzzle, HelpCircle,
  FilePlus, Play, Loader2, LayoutDashboard, GitPullRequestArrow,
} from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import useToastStore from '../store/toastStore';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useCurrentCompany } from '../hooks/useCurrentCompany';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

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

function buildFileTree(files) {
  const root = { name: 'root', type: 'folder', children: {} };
  files.forEach((f) => {
    const parts = (f.path || '/').split('/').filter(Boolean);
    let cur = root; let rp = '';
    for (let i = 0; i < parts.length; i++) {
      rp = rp ? rp + '/' + parts[i] : parts[i];
      if (i === parts.length - 1) {
        cur.children[parts[i]] = { ...f, type: 'file' };
      } else {
        if (!cur.children[parts[i]]) cur.children[parts[i]] = { name: parts[i], type: 'folder', children: {}, path: rp };
        cur = cur.children[parts[i]];
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
              <FileTreeNode key={child.path || child.name || child._id} node={child} depth={depth + 1}
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
  const [showSubdomainInput, setShowSubdomainInput] = useState(false);
  const [deploySubdomain, setDeploySubdomain] = useState('');
  const [deploying, setDeploying] = useState(false);
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
  }), []);

  const monacoPreviewOptions = useMemo(() => ({
    fontSize: 12,
    minimap: { enabled: false },
    automaticLayout: true,
  }), []);

  useEffect(() => {
    loadFiles();
    loadLanguages();
    loadCollaborators();
    loadDeployments();
    loadProjects();
    loadGithubRepos();
    loadFigmaFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedRepo && !workspaceId) {
      setGitStatus({ success: true, branch: selectedRepo.default_branch || 'main', ahead: 0, behind: 0, modified: [] });
      return;
    }

    if (workspaceId) {
      loadGitStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedRepo]);

  useEffect(() => {
    if (selectedProject) {
      loadProjectFiles(selectedProject._id || selectedProject.id);
    } else if (selectedRepo) {
      loadGithubRepoFiles(selectedRepo);
    } else {
      loadFiles();
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
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terminal xterm init
  useEffect(() => {
    if (panel !== 'terminal' || !terminalRef.current || terminalRef.current.hasChildNodes()) return;
    import('xterm').then(({ Terminal: XTerm }) => {
      const term = new XTerm({
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
      term.open(terminalRef.current);
      term.writeln('\x1b[36mBuildrsHQ Terminal\x1b[0m — type `help` for commands');
      let line = '';
      term.onKey(({ key, domEvent }) => {
        if (domEvent.keyCode === 13) {
          term.writeln('');
          handleTerminalCommand(line, term);
          line = '';
        } else if (domEvent.keyCode === 8) {
          if (line.length > 0) {
            term.write('\b \b');
            line = line.slice(0, -1);
          }
        } else if (key.length === 1) {
          line += key;
          term.write(key);
        }
      });
    }).catch(() => {
      if (terminalRef.current) terminalRef.current.innerHTML = '<div style="padding:1rem;color:#8c8c8c;font-size:0.76rem">Terminal failed to load. Refresh to retry.</div>';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  async function handleTerminalCommand(cmd, term) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (trimmed === 'help') {
      term.writeln('Available: ls, pwd, git status, clear, help, plus server commands.');
      return;
    }
    if (trimmed === 'clear') {
      term.clear();
      return;
    }
    if (trimmed === 'ls') {
      term.writeln((files.length ? files.map((f) => f.name).join('  ') : '(no files)'));
      return;
    }
    if (trimmed === 'pwd') {
      term.writeln('/home/buildrs');
      return;
    }
    if (trimmed === 'git status') {
      if (gitStatus) {
        term.writeln(`On branch ${gitStatus.branch || 'main'}`);
        const mods = gitStatus.modified || [];
        term.writeln(mods.length ? `${mods.length} file(s) modified` : 'nothing to commit, working tree clean');
      } else {
        term.writeln('Not a git repository (or git not set up for this workspace).');
      }
      return;
    }
    term.writeln(`Unknown command: ${trimmed}`);
    term.writeln('Available commands: ls, pwd, git status, clear, help');
  }

  async function loadFiles() {
    try {
      setLoading(true);
      const data = await apiFetch('/api/code-editor/files');
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
    const contentFromGithub = sourceFile?.source === 'github' && saved === undefined ? await fetchGithubFileContent(sourceFile) : null;
    const val = saved !== undefined ? saved : (contentFromGithub ?? sourceFile?.content ?? '');
    setSelectedFile(sourceFile || file);
    setContent(val);
    originalContentRef.current = val;
    setDirty(!!openDirtyRef.current[fileKey]);
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
    if (getFileKey(selectedFile) === fileKey && (dirty || openDirtyRef.current[fileKey])) {
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
    delete openContentsRef.current[fileKey];
    delete openDirtyRef.current[fileKey];
    if (getFileKey(selectedFile) === fileKey) {
      const neighbour = next[i] || next[i - 1];
      if (neighbour) {
        const neighbourKey = getFileKey(neighbour);
        const saved = openContentsRef.current[neighbourKey];
        const val = saved !== undefined ? saved : neighbour.content || '';
        setSelectedFile(neighbour);
        setContent(val);
        originalContentRef.current = val;
        setDirty(!!openDirtyRef.current[neighbourKey]);
      } else {
        setSelectedFile(null);
        setContent('');
        originalContentRef.current = '';
        setDirty(false);
      }
    }
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
  }, [getFileKey, selectedFile]);

  async function handleSave() {
    const file = selectedFile;
    if (!file) return;
    try {
      setSaving(true);
      const fileKey = getFileKey(file);
      if (file.source === 'github' && selectedRepo) {
        const owner = selectedRepo.owner?.login || selectedRepo.owner || selectedRepo.ownerName;
        const repo = selectedRepo.name;
        const path = String(file.path || file.name).replace(/^\/+/, '');
        const data = await apiFetch(`/api/github/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
          method: 'PUT',
          body: JSON.stringify({
            content,
            message: `Update ${file.name} from Buildrs HQ editor`,
            sha: file.sha,
            branch: selectedRepo.default_branch || 'main',
          }),
        });
        if (data?.success) {
          if (file.sha !== data?.commit?.sha) file.sha = data?.commit?.sha;
          originalContentRef.current = content;
          openContentsRef.current[fileKey] = content;
          openDirtyRef.current[fileKey] = false;
          setDirty(false);
          setStatus({ type: 'success', msg: 'GitHub file saved' });
          setTimeout(() => setStatus(null), 2000);
          return;
        }
        throw new Error(data?.message || 'GitHub save failed');
      }
      const data = await apiFetch(`/api/code-editor/files/${file._id}`, {
        method: 'PUT',
        body: JSON.stringify({ content, name: file.name }),
      });
      originalContentRef.current = content;
      openContentsRef.current[fileKey] = content;
      openDirtyRef.current[fileKey] = false;
      setDirty(false);
      setFiles((prev) => prev.map((f) => (getFileKey(f) === fileKey ? { ...f, ...data.file } : f)));
      setStatus({ type: 'success', msg: 'File saved' });
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
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
      await loadFiles();
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
      const pageValue = openContentsRef.current[getFileKey(file)] ?? file.content ?? '';
      const contentValue = typeof pageValue === 'string' ? pageValue : '';
      const pathValue = (file.path || '/').replace(/\\/g, '/').replace(/\/+$|^\/+$/, '/');
      return {
        name: file.name,
        path: pathValue === '/' ? '/' : pathValue,
        content: contentValue,
        language: file.language || 'plaintext',
      };
    });
  }, [files, getFileKey, selectedFile, selectedProject, selectedRepo]);

  async function handleGitAction(action) {
    if (selectedRepo && !workspaceId) {
      try {
        if (action === 'status') {
          setGitStatus({ success: true, branch: selectedRepo.default_branch || 'main', ahead: 0, behind: 0, modified: [] });
          setStatus({ type: 'success', msg: `GitHub repo ${selectedRepo.fullName || selectedRepo.name} selected` });
          return;
        }

        if (action === 'pull') {
          await loadGithubRepoFiles(selectedRepo);
          setStatus({ type: 'success', msg: 'GitHub repo refreshed' });
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
      if (selectedFile?._id === file._id) {
        setSelectedFile(null);
        setContent('');
        originalContentRef.current = '';
        setDirty(false);
      }
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
                      <span style={{ color: '#6e6e6e' }}> · {gitStatus ? `${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind` : 'no git info'}</span>
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
                          <div key={i} className="ed-scm-file">
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
                    { id: 'preview', label: 'Preview', icon: Eye },
                    { id: 'deploy', label: 'Deployments', icon: Rocket },
                  ].map((t) => (
                    <button key={t.id} type="button" className={`ed-panel-tab ${panel === t.id ? 'is-active' : ''}`} onClick={() => setPanel(t.id)}>
                      <t.icon className="w-3.5 h-3.5" /> {t.label}
                      {t.id === 'problems' && blockCount > 0 && <span style={{ color: '#e5b84a' }}> {blockCount}</span>}
                    </button>
                  ))}
                  <div className="ed-panel-actions">
                    <button type="button" className="ed-panel-close" onClick={() => setPanel(null)} title="Close panel"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="ed-panel-body">
                  {panel === 'terminal' && (
                    <div className="ed-term-shell">
                      <div className="ed-term-toolbar">
                        <div className="ed-term-meta">
                          <span className="ed-term-capsule is-live">LIVE</span>
                          <span className="ed-term-label">Workspace Shell</span>
                        </div>
                        <div className="ed-term-actions">
                          <span className="ed-term-pill">Bash</span>
                          <span className="ed-term-pill">BuildrsHQ</span>
                        </div>
                      </div>
                      <div ref={terminalRef} className="ed-term-root" />
                    </div>
                  )}

                  {panel === 'problems' && (
                    <>
                      <div className="ed-stat">
                        <CheckCircle className="w-3.5 h-3.5 ed-status-ok" style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
                        0 errors · 0 warnings from compiler
                      </div>
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
                      {!blockCount && !modifiedCount && (
                        <div className="ed-stat">All systems nominal. No problems to report.</div>
                      )}
                    </>
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
                  ⌘S Save · ⌘B Toggle Sidebar · ⌘P Command Palette<br />
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