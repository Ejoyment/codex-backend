import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';
import {
  Save, Plus, ChevronDown, FileCode, Trash2, Terminal,
  Bot, Layers, Rocket, Box, Users, GitBranch, Eye, Split, Maximize2, X,
  FolderOpen, Search, Settings, ChevronRight, File, FileText, Code2,
  Folder, FolderPlus, AlertCircle, CheckCircle, XCircle, RefreshCw,
  Home, ExternalLink, FilePlus, List, Play, Square, Loader2
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

function buildFileTree(files) {
  const root = { name: 'root', type: 'folder', children: {} };
  files.forEach(f => {
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
  if (node.type === 'file' && !node.children) {
    const isSelected = node._id === selectedId;
    return (
      <button
        type="button"
        className={`ed-tree-row ${isSelected ? 'is-selected' : ''}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => onSelect(node)}
      >
        <span className="ed-file-dot" style={{ background: getFileIcon(node.name) }} />
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
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          onClick={() => onToggle(node.path || node.name)}
        >
          <ChevronRight className="w-3 h-3 ed-tree-chev" />
          <Folder className="w-3.5 h-3.5 ed-folder-ico" />
          <span className="ed-tree-name">{node.name}</span>
        </button>
        {isOpen && node.children && (
          <div>
            {Object.values(node.children).sort((a, b) => {
              if ((a.type === 'folder' || a.children) !== (b.type === 'folder' || b.children)) return a.children ? -1 : 1;
              return (a.name || '').localeCompare(b.name || '');
            }).map((child) => (
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

export default function Editor() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
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
  const [activeTab, setActiveTab] = useState('editor');
  const [activeSidebar, setActiveSidebar] = useState('explorer');
  const [showTerminal, setShowTerminal] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [figmaFiles, setFigmaFiles] = useState([]);
  const [selectedFigmaFile, setSelectedFigmaFile] = useState(null);
  const socketRef = useRef(null);
  const [gitStatus, setGitStatus] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [sandboxUrl, setSandboxUrl] = useState(null);
  const [showSubdomainInput, setShowSubdomainInput] = useState(false);
  const [deploySubdomain, setDeploySubdomain] = useState('');
  const [deploying, setDeploying] = useState(false);
  const toast = useToastStore();
  const [confirmDiscard, setConfirmDiscard] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const dropdownRef = useRef(null);
  const terminalRef = useRef(null);
  const originalContentRef = useRef('');
  const aiSessionRef = useRef(null);
  const { selectedCompany } = useCurrentCompany();
  const workspaceId = selectedCompany?._id;

  // Project and GitHub repo state
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [githubRepos, setGithubRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [fileFilter, setFileFilter] = useState('');

  // Derived
  const tree = useMemo(() => buildFileTree(files), [files]);

  useEffect(() => {
    loadFiles();
    loadLanguages();
    loadCollaborators();
    loadDeployments();
    loadProjects();
    loadGithubRepos();
    loadFigmaFiles();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadGitStatus();
    }
  }, [workspaceId]);

  // Load project/repo files when selection changes
  useEffect(() => {
    if (selectedProject) {
      loadProjectFiles(selectedProject._id || selectedProject.id);
    } else if (selectedRepo) {
      loadGithubRepoFiles(selectedRepo);
    } else {
      loadFiles();
    }
  }, [selectedProject, selectedRepo]);

  // Real-time collaboration: connect socket + join file room + cursor presence
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('collab:user-joined', ({ user }) => {
      setCollaborators(prev => {
        const exists = prev.some(c => c.userId === user?.userId || c.id === user?.id);
        if (exists) return prev;
        return [...prev, user || {}];
      });
      setStatus({ type: 'success', msg: 'Collaborator joined' });
      setTimeout(() => setStatus(null), 2000);
    });

    socket.on('collab:user-left', ({ userId }) => {
      setCollaborators(prev => prev.filter(c => c.userId !== userId));
      setRemoteCursors(prev => { const n = { ...prev }; delete n[userId]; return n; });
    });

    socket.on('collab:cursor-update', ({ userId, userName, cursor }) => {
      setRemoteCursors(prev => ({ ...prev, [userId]: { userName, cursor, ts: Date.now() } }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Join the current file's room + broadcast own cursor
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
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Terminal xterm init
  useEffect(() => {
    if (showTerminal && terminalRef.current && !terminalRef.current.hasChildNodes()) {
      import('xterm').then(({ Terminal: XTerm }) => {
        const term = new XTerm({ theme: { background: '#0f172a' }, fontSize: 13 });
        term.open(terminalRef.current);
        term.writeln('Welcome to BuildrsHQ Terminal');
        term.writeln('Type `help` for available commands');
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
        if (terminalRef.current) terminalRef.current.innerHTML = '<div class="p-4 text-gray-400">Terminal loading failed. Please refresh.</div>';
      });
    }
  }, [showTerminal]);

async function handleTerminalCommand(cmd, term) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    // Built-in local shortcuts (no server call needed)
    if (trimmed === 'help') {
      term.writeln('Available: ls, pwd, git status, clear, help, plus many read-only commands via the server.');
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
    // Send unknown commands to the server
    try {
      term.writeln(`[running] ${trimmed}`);
      const data = await apiFetch('/api/terminal/execute', {
        method: 'POST',
        body: JSON.stringify({ command: trimmed, fileId: selectedFile?._id }),
      });
      const output = data.output || '';
      output.split('\n').forEach((l) => term.writeln(l));
    } catch (err) {
      term.writeln(`Error: ${err.message}`);
    }
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

  async function loadFigmaFiles() {
    try {
      const data = await apiFetch('/api/figma/files').catch(() => null);
      if (data && data.files) setFigmaFiles(data.files);
    } catch {}
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
    const data = await apiFetch('/api/ai-pair/session', {
      method: 'POST',
      body: JSON.stringify({ sessionName: `Editor session ${new Date().toLocaleString()}` }),
    });
    if (!data.success) throw new Error(data.message || 'Could not start an AI session');
    aiSessionRef.current = data.session;
    return data.session;
  }

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
      const data = await apiFetch('/api/ai-pair/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: session._id,
          message: input,
          companyId,
          codeContext: selectedFile ? { currentFile: { name: selectedFile.name, content: content.slice(0, 2000) } } : undefined,
        }),
      });
      const reply = data.message?.content || data.message || 'No response';
      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setAiMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  }

  function selectFile(file) {
    if (dirty) {
      setConfirmDiscard(file);
      return;
    }
    setSelectedFile(file);
    setContent(file.content || '');
    originalContentRef.current = file.content || '';
    setDirty(false);
    setShowProjectSelector(false);
    setStatus(null);
    apiFetch(`/api/collaboration/file/${file._id}/join`, { method: 'POST' }).catch(() => {});
  }

  const handleConfirmDiscard = () => {
    const file = confirmDiscard;
    setConfirmDiscard(null);
    if (!file) return;
    setSelectedFile(file);
    setContent(file.content || '');
    originalContentRef.current = file.content || '';
    setDirty(false);
    setShowProjectSelector(false);
    setStatus(null);
    apiFetch(`/api/collaboration/file/${file._id}/join`, { method: 'POST' }).catch(() => {});
  };

  const monacoLanguage = useMemo(() => getMonacoLanguage(selectedFile?.language), [selectedFile?.language]);

  const handleEditorChange = useCallback((value) => {
    const val = value ?? '';
    setContent(val);
    setDirty(val !== originalContentRef.current);
    // Real-time collaboration: broadcast changes
    if (selectedFile?._id) {
      // Debounced in real implementation
    }
  }, [selectedFile?._id]);

  async function handleSave() {
    if (!selectedFile) return;
    try {
      setSaving(true);
      const data = await apiFetch(`/api/code-editor/files/${selectedFile._id}`, {
        method: 'PUT',
        body: JSON.stringify({ content, name: selectedFile.name }),
      });
      originalContentRef.current = content;
      setDirty(false);
      setFiles((prev) => prev.map((f) => (f._id === selectedFile._id ? { ...f, ...data.file } : f)));
      setStatus({ type: 'success', msg: 'File saved' });
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  // Monaco editor mount: broadcast cursor + render remote collaborators
  function handleEditorMount(editor, monaco) {
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

    // Re-render remote cursor decorations whenever remoteCursors changes
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
      // Persist the file and reload from the server so it never disappears
      setShowNewModal(false);
      setNewFileName('');
      setNewFileLang('javascript');
      setNewFileContent('');
      setStatus({ type: 'success', msg: 'File created' });
      setTimeout(() => setStatus(null), 2000);
      await reloadFiles();
      if (created) openFile(created);
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
      // Expand the newly created folder in the tree
      const fp = (folderPath === '/' ? '' : folderPath) + '/' + newFolderName.trim();
      setExpandedFolders(prev => ({ ...prev, [fp]: true }));
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

  async function handleDelete(file) {
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
      toast.success('File deleted');
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    }
  };

  async function handleGitAction(action) {
    if (!workspaceId) {
      setStatus({ type: 'error', msg: 'You need to be in a workspace to use version control.' });
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

  async function handleDeploy() {
    if (!selectedFile) {
      setStatus({ type: 'error', msg: 'Select a file first (deploys its project).' });
      return;
    }
    // Show subdomain input
    setShowSubdomainInput(true);
    setDeploySubdomain(selectedFile.name?.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-') || '');
  }

  async function confirmDeploy(e) {
    e.preventDefault();
    const subdomain = deploySubdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!subdomain || subdomain.length < 2) {
      setStatus({ type: 'error', msg: 'Subdomain must be at least 2 characters.' });
      return;
    }
    const projectId = selectedProject?._id || selectedProject?.id || selectedFile?.project;
    if (!projectId) {
      setStatus({ type: 'error', msg: 'Select a project in the Files panel before deploying.' });
      return;
    }
    try {
      setDeploying(true);
      setStatus({ type: 'info', msg: 'Deploying... (this may take a minute)' });
      const data = await apiFetch('/api/deployments', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          subdomain,
          companyId: selectedProject?.workspaceId || workspaceId,
        }),
      });
      if (data.deployment) {
        setDeployments((prev) => [data.deployment, ...prev]);
        setStatus({ type: 'success', msg: `Deploying to ${subdomain}.buildrshq.dev...` });
        setShowSubdomainInput(false);
        setDeploySubdomain('');
        // Refresh list after a few seconds
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
    if (!confirm(`Stop deployment "${subdomain}.buildrshq.dev" and remove the container?`)) return;
    try {
      await apiFetch(`/api/deployments/${deploymentId}`, { method: 'DELETE' });
      setDeployments((prev) => prev.map(d =>
        d._id === deploymentId ? { ...d, status: 'stopped', deployedUrl: null } : d
      ));
      setStatus({ type: 'success', msg: 'Deployment stopped.' });
    } catch (err) {
      const msg = err?.data?.message || err?.data?.error || err?.message || 'Failed to stop';
      setStatus({ type: 'error', msg });
    }
  }

  async function handleSandboxStart() {
    if (!selectedFile) {
      setStatus({ type: 'error', msg: 'Select a file to preview first.' });
      return;
    }
    try {
      setStatus({ type: 'info', msg: 'Starting sandbox...' });
      const data = await apiFetch('/api/sandbox/start', {
        method: 'POST',
        body: JSON.stringify({ fileId: selectedFile._id }),
      });
      if (data.sandboxUrl) {
        setSandboxUrl(data.sandboxUrl);
        setStatus({ type: 'success', msg: 'Sandbox ready!' });
      }
    } catch (err) {
      setStatus({ type: 'error', msg: `Sandbox error: ${err.message}` });
    }
  }

  const TABS = [
    { id: 'editor', label: 'Editor', icon: FileCode },
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'split', label: 'Split', icon: Split },
    { id: 'ai', label: 'AI Helper', icon: Bot },
    { id: 'collab', label: 'Collaborators', icon: Users },
    { id: 'git', label: 'Version Control', icon: GitBranch },
    { id: 'deploy', label: 'Deployments', icon: Rocket },
    { id: 'sandbox', label: 'Sandbox', icon: Box },
  ];

  return (
    <AuthGuard>
      <Head>
        <title>Code Editor - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="ed-page">
        <Sidebar user={user} subscription={subscription} />

        <main className="ed-main-lg">
          {/* Editor title bar */}
          <header className="ed-topbar">
            <div className="ed-topbar-left">
              <span className="ed-topbar-crumb">BuildrsHQ</span>
              <span className="ed-topbar-sep">/</span>
              <span className="ed-topbar-repo">{selectedProject?.name || selectedRepo?.fullName || 'editor'}</span>
            </div>
            <div className="ed-topbar-center">
              {selectedFile ? selectedFile.name : 'No file open'}
            </div>
            <div className="ed-topbar-right">
              {dirty && (
                <span className="ed-unsaved">
                  <span className="dot" />
                  Unsaved
                </span>
              )}
              {selectedFile && (
                <button type="button" className="btn-workspace btn-primary" onClick={handleSave} disabled={saving || !dirty}>
                  <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save'}
                </button>
              )}
              <button type="button" className="ed-top-btn" onClick={() => setShowNewModal(true)} title="New File"><FilePlus className="w-3.5 h-3.5" /></button>
              <button type="button" className="ed-top-btn" onClick={() => setShowNewFolderModal(true)} title="New Folder"><FolderPlus className="w-3.5 h-3.5" /></button>
              <button type="button" className="ed-top-btn" onClick={() => setShowAiHelper(!showAiHelper)} title="Toggle AI Helper"><Bot className="w-3.5 h-3.5" /></button>
              <button type="button" className="ed-top-btn" onClick={() => setShowTerminal(!showTerminal)} title="Toggle Terminal"><Terminal className="w-3.5 h-3.5" /></button>
            </div>
          </header>

          {/* Feature tab bar */}
          <div className="ed-tabs">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`ed-tab ${activeTab === id ? 'is-active' : ''}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Main editor workspace: activity bar + explorer + editor */}
          <div className="ed-body">
            {/* Activity bar */}
            <div className="ed-activity">
              <button type="button" className={`ed-activity-btn ${activeSidebar === 'explorer' ? 'is-active' : ''}`} onClick={() => setActiveSidebar('explorer')} title="Explorer">
                <FolderOpen className="w-5 h-5" />
              </button>
              <button type="button" className={`ed-activity-btn ${activeSidebar === 'git' ? 'is-active' : ''}`} onClick={() => setActiveSidebar('git')} title="Source Control">
                <GitBranch className="w-5 h-5" />
              </button>
              <button type="button" className={`ed-activity-btn ${activeSidebar === 'ai' ? 'is-active' : ''}`} onClick={() => setActiveSidebar('ai')} title="AI Assistant">
                <Bot className="w-5 h-5" />
              </button>
              <div className="ed-activity-grow" />
              <button type="button" className="ed-activity-btn" title="Settings">
                <Settings className="w-5 h-5" />
              </button>
            </div>

            {/* Explorer sidebar */}
            <div className="ed-side">
              {/* Explorer header */}
              <div className="ed-side-head">
                <span className="ed-side-title">Explorer</span>
                <div className="ed-side-actions">
                  <button type="button" className="ed-side-btn" onClick={() => setShowNewModal(true)} title="New File"><FilePlus className="w-3.5 h-3.5" /></button>
                  <button type="button" className="ed-side-btn" onClick={() => setShowNewFolderModal(true)} title="New Folder"><FolderPlus className="w-3.5 h-3.5" /></button>
                  <button type="button" className="ed-side-btn" onClick={reloadFiles} title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Project selector */}
              <div className="ed-project-wrap">
                <button type="button" className="ed-project-btn" onClick={() => setShowProjectSelector(!showProjectSelector)}>
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span className="ed-project-label">{selectedProject ? selectedProject.name : selectedRepo ? (selectedRepo.fullName || selectedRepo.name) : 'Workspace'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showProjectSelector ? 'rotate-180' : ''}`} style={{ color: 'var(--ws-text-faint)' }} />
                </button>
                {showProjectSelector && (
                  <div className="ed-drop">
                    <button type="button" className="ed-drop-item" onClick={() => { setSelectedProject(null); setSelectedRepo(null); setShowProjectSelector(false); }}>
                      <FolderOpen className="w-3.5 h-3.5" /> Workspace Files
                    </button>
                    {projects.length > 0 && <div className="ed-drop-section">Projects</div>}
                    {projects.map(p => (
                      <button key={p._id || p.id} type="button" className="ed-drop-item" onClick={() => { setSelectedProject(p); setSelectedRepo(null); setShowProjectSelector(false); }}>
                        <Folder className="w-3.5 h-3.5" /> {p.name}
                      </button>
                    ))}
                    {githubRepos.length > 0 && <div className="ed-drop-section">GitHub Repos</div>}
                    {githubRepos.map(r => (
                      <button key={r.id || r.fullName} type="button" className="ed-drop-item" onClick={() => { setSelectedRepo(r); setSelectedProject(null); setShowProjectSelector(false); }}>
                        <GitBranch className="w-3.5 h-3.5" /> {r.fullName || r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* File filter */}
              <div className="ed-filter-wrap">
                <input type="text" className="ed-filter"
                  placeholder="Filter files..." value={fileFilter} onChange={e => setFileFilter(e.target.value)} />
              </div>

              {/* File tree */}
              <div className="ed-tree">
                {loading ? (
                  <div className="dash-empty">
                    <div className="dash-empty-ico">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                    <p className="dash-empty-title">Loading files...</p>
                  </div>
                ) : files.length === 0 ? (
                  <div className="ed-empty">
                    <div className="dash-empty-ico">
                      <FileCode className="w-5 h-5" />
                    </div>
                    <p className="dash-empty-title">No files yet</p>
                    <button type="button" className="btn-workspace btn-primary" onClick={() => setShowNewModal(true)}>Create File</button>
                  </div>
                ) : (
                  <FileTreeNode node={tree} depth={-1} selectedId={selectedFile?._id} onSelect={selectFile} expanded={expandedFolders} onToggle={(path) => setExpandedFolders(prev => ({ ...prev, [path]: prev[path] === false ? true : false }))} />
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="ed-main">
              {status && (
                <div className={`ed-alert ${status.type === 'success' ? 'ed-alert-success' : 'ed-alert-error'}`}>
                  {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {status.msg}
                </div>
              )}

              {activeTab === 'editor' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><FileCode className="w-4 h-4" />{selectedFile ? selectedFile.name : 'Editor'}</h2>
                    {selectedFile && <button type="button" className="btn-workspace btn-primary" onClick={handleSave} disabled={saving || !dirty}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save'}</button>}
                  </div>
                  <div className="ed-pane-body">
                    {!selectedFile ? (
                      <div className="ed-ide-empty">
                        <div className="dash-empty-ico">
                          <FileCode className="w-6 h-6" />
                        </div>
                        <p className="dash-empty-title">Select a file to start editing</p>
                      </div>
                    ) : (
                      <div className="ed-code-wrap">
                        <MonacoEditor height="100%" language={monacoLanguage} value={content} onChange={handleEditorChange} onMount={handleEditorMount} theme="vs-dark" options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, automaticLayout: true, bracketPairColorization: { enabled: true } }} loading={<div className="flex items-center justify-center h-full text-gray-400">Loading editor...</div>} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'terminal' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><Terminal className="w-4 h-4" /> Terminal</h2>
                  </div>
                  <div className="ed-pane-body">
                    <div ref={terminalRef} className="flex-1 min-h-[0px] bg-[#060608] rounded-[10px] p-2 font-mono text-sm overflow-auto border border-[rgba(255,255,255,0.05)]" />
                  </div>
                </div>
              )}

              {activeTab === 'preview' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><Eye className="w-4 h-4" /> Preview</h2>
                  </div>
                  <div className="ed-pane-body">
                    <div className="ed-panel flex-1 min-h-[380px] flex items-center justify-center">
                      <p className="text-sm" style={{ color: 'var(--ws-text-faint)' }}>Live preview will appear here. Select a file and toggle Design-Code Split.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button type="button" onClick={() => setActiveTab('split')} className="btn-workspace btn-secondary"><Split className="w-4 h-4" /> Split View</button>
                      <button type="button" onClick={() => window.open(sandboxUrl || '#', '_blank')} className="btn-workspace btn-secondary"><Maximize2 className="w-4 h-4" /> Pop Out</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'split' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><Layers className="w-4 h-4" /> Design-Code Split View</h2>
                  </div>
                  <div className="ed-pane-body" style={{ gap: 0, paddingBottom: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', minHeight: '0', flex: 1 }}>
                      <div style={{ borderRight: '1px solid var(--ws-border)', padding: '0.5rem' }}>
                        <div className="ed-side-title" style={{ margin: '0.2rem 0 0.6rem', color: 'var(--ws-text-faint)' }}>Figma Design</div>
                        {figmaFiles.length === 0 ? (
                          <div className="ed-panel" style={{ height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', minHeight: '420px' }}>
                            <Layers className="w-8 h-8" style={{ color: 'var(--ws-text-faint)' }} />
                            <p className="text-sm" style={{ color: 'var(--ws-text-faint)' }}>No Figma files connected</p>
                            <a href="/integrations" className="btn-workspace btn-secondary">Connect Figma</a>
                          </div>
                        ) : (
                          <div className="ed-panel" style={{ height: '100%', overflowY: 'auto', minHeight: '420px', padding: '0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {figmaFiles.map((f) => (
                                <button key={f.key || f.id} type="button"
                                  onClick={() => setSelectedFigmaFile(f)}
                                  className={`ed-drop-item ${selectedFigmaFile?.key === f.key || selectedFigmaFile?.id === f.id ? 'is-active' : ''}`}
                                  style={selectedFigmaFile?.key === f.key || selectedFigmaFile?.id === f.id ? { background: 'rgba(47,214,230,0.08)', color: 'var(--ws-text)' } : undefined}>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="font-medium truncate" style={{ fontSize: '0.78rem' }}>{f.name || f.key}</div>
                                    <div className="ed-side-title" style={{ color: 'var(--ws-text-faint)' }}>{f.last_modified ? new Date(f.last_modified).toLocaleDateString() : ''}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '0.5rem' }}>
                        <div className="ed-side-title" style={{ margin: '0.2rem 0 0.6rem', color: 'var(--ws-text-faint)' }}>Code</div>
                        <div className="ed-code-wrap">
                          <MonacoEditor height="100%" language={monacoLanguage} value={content} onChange={handleEditorChange} theme="vs-dark" options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ai' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><Bot className="w-4 h-4" /> AI Helper</h2>
                  </div>
                  <div className="ed-pane-body">
                    <div className="ed-chat" style={{ flex: 1, maxHeight: 'none' }}>
                      {aiMessages.length === 0 ? <p className="ed-chat-gap">Ask AI about your code, get completions, or request refactors.</p> : aiMessages.map((m, i) => (
                        <div key={i} className={`ed-chat-bubble ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
                          {m.content}
                        </div>
                      ))}
                      {aiLoading && <div className="ed-chat-gap" style={{ color: '#2fd6e6' }}>Thinking...</div>}
                    </div>
                    <form onSubmit={handleAiHelperSend} className="ed-composer" style={{ padding: 0, paddingTop: '0.6rem', borderTop: 'none' }}>
                      <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask AI to explain, refactor, or generate code..." />
                      <button type="submit" disabled={aiLoading || !aiInput.trim()} className="btn-workspace btn-primary" style={{ minHeight: 0, padding: '0.5rem 0.85rem' }}><Bot className="w-4 h-4" /></button>
                    </form>
                  </div>
                </div>
              )}

              {activeTab === 'collab' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><Users className="w-4 h-4" /> Collaboration</h2>
                  </div>
                  <div className="ed-pane-body" style={{ overflowY: 'auto' }}>
                    <div className="ed-panel">
                      <p className="text-xs mb-2" style={{ color: 'var(--ws-text-muted)' }}>Invite others to edit this file in real time.</p>
                      <div className="ed-invite-row">
                        <input readOnly value={selectedFile ? `${window.location.origin}/editor?file=${selectedFile._id}` : `${window.location.origin}/editor`} onFocus={(e) => e.target.select()} />
                        <button type="button" className="btn-workspace btn-primary" onClick={() => { navigator.clipboard?.writeText(selectedFile ? `${window.location.origin}/editor?file=${selectedFile._id}` : `${window.location.origin}/editor`); setStatus({ type: 'success', msg: 'Invite link copied' }); setTimeout(() => setStatus(null), 2000); }}>Copy Link</button>
                      </div>
                    </div>
                    <p className="text-sm mb-2" style={{ color: 'var(--ws-text-muted)' }}>Active collaborators ({collaborators.length}):</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                      {collaborators.length === 0 ? <p className="text-sm" style={{ color: 'var(--ws-text-faint)' }}>No active collaborators yet</p> : collaborators.map((c, i) => (
                        <div key={i} className="ed-member">
                          <div className="ed-member-av" style={{ background: 'rgba(47,214,230,0.15)', color: '#2fd6e6' }}>{c.name?.[0] || 'U'}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="text-sm font-medium" style={{ color: 'var(--ws-text)' }}>{c.name || 'Anonymous'}</div>
                            <div className="text-xs" style={{ color: 'var(--ws-text-faint)' }}>{c.email || 'Connected'}</div>
                          </div>
                          <span className="ed-live-dot" style={{ marginLeft: 'auto' }} />
                        </div>
                      ))}
                      {Object.values(remoteCursors).filter((rc) => rc.userName !== (user?.fullName || user?.name)).map((rc, i) => (
                        <div key={`cursor-${i}`} className="ed-member" style={{ borderColor: 'rgba(167,139,250,0.3)' }}>
                          <div className="ed-member-av" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>{(rc.userName || 'U')[0]}</div>
                          <div className="text-xs" style={{ color: 'var(--ws-text-muted)' }}>{rc.userName} is editing at line {rc.cursor?.line}, col {rc.cursor?.column}</div>
                          <span className="ed-live-dot" style={{ marginLeft: 'auto', background: '#a78bfa' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'git' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><GitBranch className="w-4 h-4" /> Version Control</h2>
                  </div>
                  <div className="ed-pane-body">
                    <div className="ed-status-strip" style={{ display: 'block' }}>
                      <div className="branch">Branch: {gitStatus?.branch || 'main'}</div>
                      <div style={{ color: 'var(--ws-text-faint)' }}>{gitStatus ? `${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind` : 'No git info'}</div>
                      {gitStatus?.modified?.length > 0 && <div style={{ color: '#e5b84a' }}>{gitStatus.modified.length} modified files</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button type="button" onClick={() => handleGitAction('pull')} className="btn-workspace btn-secondary flex-1">Pull</button>
                      <button type="button" onClick={() => handleGitAction('commit')} className="btn-workspace btn-secondary flex-1">Commit</button>
                      <button type="button" onClick={() => handleGitAction('push')} className="btn-workspace btn-primary flex-1">Push</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'deploy' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><Rocket className="w-4 h-4" /> Deployments</h2>
                  </div>
                  <div className="ed-pane-body" style={{ overflowY: 'auto' }}>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button type="button" onClick={handleDeploy} className="btn-workspace btn-primary">Deploy Current Project</button>
                      <button type="button" onClick={loadDeployments} className="btn-workspace btn-secondary">Refresh</button>
                    </div>

                    {showSubdomainInput && (
                      <form onSubmit={confirmDeploy} className="ed-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <label className="ws-label" style={{ margin: 0 }}>Choose a subdomain</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={deploySubdomain}
                            onChange={(e) => setDeploySubdomain(e.target.value.replace(/[^a-z0-9-]/g, '-').toLowerCase())}
                            placeholder="my-app"
                            className="ws-input"
                            style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
                            autoFocus
                            required
                            minLength={2}
                          />
                          <span className="text-sm whitespace-nowrap" style={{ color: 'var(--ws-text-faint)' }}>.buildrshq.dev</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="submit" disabled={deploying || deploySubdomain.length < 2} className="btn-workspace btn-primary">
                            {deploying ? 'Deploying...' : 'Deploy'}
                          </button>
                          <button type="button" onClick={() => setShowSubdomainInput(false)} className="btn-workspace btn-secondary">Cancel</button>
                        </div>
                      </form>
                    )}

                    {deployments.length === 0 ? <p className="text-sm" style={{ color: 'var(--ws-text-faint)' }}>No deployments yet</p> : deployments.map((d, i) => (
                      <div key={i} className="ed-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="text-sm font-medium" style={{ color: 'var(--ws-text)' }}>
                              {d.deployedUrl ? (
                                <a href={d.deployedUrl} target="_blank" rel="noreferrer" style={{ color: '#2fd6e6', textDecoration: 'none' }}>{d.deployedUrl}</a>
                              ) : d.subdomain ? (
                                <span className="ed-topbar-repo">{d.subdomain}.buildrshq.dev</span>
                              ) : (
                                <span>{d._id || `Deploy #${i + 1}`}</span>
                              )}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--ws-text-faint)' }}>
                              {d.status} {(d.projectId?.name ? `• ${d.projectId.name}` : '')} • {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                            <span className="pill pill-mono" style={
                              d.status === 'success' ? { background: 'rgba(52,211,153,0.12)', color: '#34d399' } :
                              d.status === 'failed' ? { background: 'rgba(248,113,113,0.12)', color: '#f87171' } :
                              d.status === 'building' || d.status === 'deploying' ? { background: 'rgba(229,184,74,0.12)', color: '#e5b84a' } :
                              { background: 'rgba(255,255,255,0.05)', color: '#9aa1ae' }
                            }>{d.status}</span>
                            {(d.status === 'success' || d.status === 'failed') && (
                              <button type="button" onClick={() => stopDeployment(d._id, d.subdomain)} className="text-xs" style={{ color: '#f87171' }}>Stop</button>
                            )}
                          </div>
                        </div>
                        {d.status === 'failed' && d.errorMessage && (
                          <div className="ed-alert ed-alert-error" style={{ fontSize: '0.72rem', padding: '0.5rem 0.7rem' }}>
                            Error: {d.errorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'sandbox' && (
                <div className="ed-pane">
                  <div className="ed-pane-head">
                    <h2 className="ed-pane-title"><Box className="w-4 h-4" /> Sandbox</h2>
                  </div>
                  <div className="ed-pane-body">
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button type="button" onClick={handleSandboxStart} className="btn-workspace btn-primary">Start Sandbox</button>
                      {sandboxUrl && <a href={sandboxUrl} target="_blank" rel="noreferrer" className="btn-workspace btn-secondary">Open in new tab</a>}
                    </div>
                    {sandboxUrl ? <iframe src={sandboxUrl} className="w-full bg-white rounded-[10px] border border-[rgba(255,255,255,0.09)]" style={{ flex: 1, minHeight: '440px' }} title="Sandbox" /> : <div className="ed-panel flex-1 min-h-[440px] flex items-center justify-center" style={{ color: 'var(--ws-text-faint)' }}>Sandbox not started</div>}
                  </div>
                </div>
              )}

              {tier && languages.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: 'var(--ws-text-faint)' }}>
                  <span>Tier: <span style={{ color: '#2fd6e6' }}>{tier}</span></span>
                  <span>·</span>
                  <span>{languages.filter((l) => l.allowed).length} languages available</span>
                  <span>·</span>
                  <span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
                </div>
              )}
            </div>

            {/* Right AI Helper Drawer */}
            {showAiHelper && (
              <div className="ed-drawer">
                <div className="ed-drawer-head">
                  <h3 className="ed-drawer-title"><Bot className="w-4 h-4" /> AI Helper</h3>
                  <button type="button" onClick={() => setShowAiHelper(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="ed-chat">
                  {aiMessages.length === 0 ? <p className="ed-chat-gap">Ask anything about your code</p> : aiMessages.map((m, i) => (
                    <div key={i} className={`ed-chat-bubble ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>{m.content}</div>
                  ))}
                  {aiLoading && <div className="ed-chat-gap" style={{ color: '#2fd6e6' }}>Thinking...</div>}
                </div>
                <form onSubmit={handleAiHelperSend} className="ed-composer">
                  <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask AI..." />
                  <button type="submit" className="btn-workspace btn-primary" style={{ minHeight: 0, padding: '0.5rem 0.85rem' }}><Bot className="w-4 h-4" /></button>
                </form>
              </div>
            )}
          </div>

          {/* Bottom Terminal Drawer */}
          {showTerminal && (
            <div className="ed-term">
              <div className="ed-term-head">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Terminal className="w-4 h-4" /> Terminal</span>
                <button type="button" onClick={() => setShowTerminal(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div ref={terminalRef} className="h-64 overflow-hidden" />
            </div>
          )}

          {/* Status Bar */}
          <div className="ed-statusbar">
            <div className="ed-status-left">
              <GitBranch className="w-3 h-3" />
              <span>{gitStatus?.branch || 'main'}</span>
              {gitStatus?.modified?.length > 0 && <span className="ed-status-err">{gitStatus.modified.length}</span>}
            </div>
            <div className="ed-status-right">
              {status && (
                <span className="ed-status-item">
                  {status.type === 'success' ? <CheckCircle className="w-3 h-3 ed-status-ok" /> : <XCircle className="w-3 h-3 ed-status-err" />}
                  <span className={status.type === 'success' ? 'ed-status-ok' : 'ed-status-err'}>{status.msg}</span>
                </span>
              )}
              <span className="ed-status-item">{selectedFile ? (selectedFile.language || detectLanguage(selectedFile.name) || 'plaintext').toUpperCase() : ''}</span>
              <span className="ed-status-item">Ln {selectedFile ? 1 : '-'}, Col {selectedFile ? 1 : '-'}</span>
              <span className="ed-status-item">UTF-8</span>
              <span className="ed-status-item">Spaces: 4</span>
              <span className={`ed-tier-pill ${subscription?.tier === 'enterprise' ? '' : subscription?.tier === 'professional' ? 'is-pro' : 'is-free'}`}>
                {subscription?.tier === 'enterprise' ? 'Enterprise' : subscription?.tier === 'professional' ? 'Pro' : 'Free'}
              </span>
            </div>
          </div>
        </main>
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-lg">
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
                  <Plus className="w-4 h-4" />
                  {creating ? 'Creating...' : 'Create File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ws-modal w-full max-w-lg">
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
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete File"
        message={`Are you sure you want to delete "${confirmDelete?.name || 'this file'}"?`}
        confirmText="Delete"
        variant="danger"
      />
    </AuthGuard>
  );
}


