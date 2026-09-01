import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Save, Plus, ChevronDown, FileCode, Trash2, Terminal, Bot, Layers, Rocket, Box, Users, GitBranch, Eye, Split, Maximize2, X } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import useToastStore from '../store/toastStore';
import { ConfirmDialog } from '../components/ConfirmDialog';

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

export default function Editor() {
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
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('editor'); // editor, terminal, preview, ai, deploy, sandbox, collab, git
  const [showTerminal, setShowTerminal] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [gitStatus, setGitStatus] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [sandboxUrl, setSandboxUrl] = useState(null);
  const toast = useToastStore();
  const [confirmDiscard, setConfirmDiscard] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const dropdownRef = useRef(null);
  const terminalRef = useRef(null);
  const originalContentRef = useRef('');

  useEffect(() => {
    loadFiles();
    loadLanguages();
    loadCollaborators();
    loadGitStatus();
    loadDeployments();
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
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
    if (trimmed === 'help') {
      term.writeln('Available: ls, pwd, git status, clear, help');
      return;
    }
    if (trimmed === 'clear') {
      term.clear();
      return;
    }
    try {
      const res = await apiFetch('/api/terminal/execute', {
        method: 'POST',
        body: JSON.stringify({ command: trimmed, fileId: selectedFile?._id }),
      });
      term.writeln(res.output || 'Done');
    } catch (e) {
      term.writeln(`Error: ${e.message}`);
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
    try {
      const data = await apiFetch('/api/git/status').catch(() => null);
      if (data) setGitStatus(data);
    } catch {}
  }

  async function loadDeployments() {
    try {
      const data = await apiFetch('/api/deployments').catch(() => ({ deployments: [] }));
      setDeployments(data.deployments || []);
    } catch {}
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
      const data = await apiFetch('/api/ai-pair/message', {
        method: 'POST',
        body: JSON.stringify({ message: input, fileContext: selectedFile ? { name: selectedFile.name, content: content.slice(0, 2000) } : null }),
      });
      const aiMsg = { role: 'assistant', content: data.response?.message || data.message || 'No response' };
      setAiMessages((prev) => [...prev, aiMsg]);
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
    setShowDropdown(false);
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
    setShowDropdown(false);
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

  async function handleCreateFile(e) {
    e.preventDefault();
    if (!newFileName.trim()) return;
    try {
      setCreating(true);
      const data = await apiFetch('/api/code-editor/files', {
        method: 'POST',
        body: JSON.stringify({ name: newFileName, language: newFileLang, content: newFileContent }),
      });
      setFiles((prev) => [...prev, data.file]);
      setSelectedFile(data.file);
      setContent(data.file.content || '');
      originalContentRef.current = data.file.content || '';
      setDirty(false);
      setShowNewModal(false);
      setNewFileName('');
      setNewFileLang('javascript');
      setNewFileContent('');
      setStatus({ type: 'success', msg: 'File created' });
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || 'Create failed' });
    } finally {
      setCreating(false);
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
    try {
      const data = await apiFetch(`/api/git/${action}`, { method: 'POST', body: JSON.stringify({ fileId: selectedFile?._id }) });
      setGitStatus(data);
      setStatus({ type: 'success', msg: `Git ${action} done` });
    } catch (e) {
      setStatus({ type: 'error', msg: `Git ${action} failed: ${e.message}` });
    }
  }

  async function handleDeploy() {
    try {
      const data = await apiFetch('/api/deployments', { method: 'POST', body: JSON.stringify({ fileId: selectedFile?._id }) });
      setDeployments((prev) => [data.deployment, ...prev]);
      setStatus({ type: 'success', msg: 'Deployment started' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
  }

  async function handleSandboxStart() {
    try {
      const data = await apiFetch('/api/sandbox/start', { method: 'POST', body: JSON.stringify({ fileId: selectedFile?._id }) });
      setSandboxUrl(data.url || data.sandboxUrl);
      setActiveTab('sandbox');
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
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

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64 flex flex-col">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Code Editor</h1>
              {selectedFile && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <FileCode className="w-3 h-3" />
                  {selectedFile.language || 'plain'}
                </span>
              )}
              {collaborators.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-green-400">
                  <Users className="w-3 h-3" /> {collaborators.length} collaborating
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-xs text-amber-400 font-medium">Unsaved</span>}
              <button type="button" className={`btn-workspace ${showTerminal ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowTerminal(!showTerminal)} title="Toggle Terminal">
                <Terminal className="w-4 h-4" />
              </button>
              <button type="button" className={`btn-workspace ${showAiHelper ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowAiHelper(!showAiHelper)} title="AI Helper">
                <Bot className="w-4 h-4" />
              </button>
              <button type="button" className="btn-workspace btn-primary" onClick={() => setShowNewModal(true)}>
                <Plus className="w-4 h-4" />
                <span>New File</span>
              </button>
            </div>
          </header>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-700 bg-navy-light overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition ${
                  activeTab === id ? 'bg-blue-500 text-white' : 'bg-navy text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="workspace-content p-6 flex-1 flex gap-6">
            {/* File Manager Sidebar */}
            <div className="w-72 shrink-0">
              <div className="workspace-card">
                <div className="workspace-card-header">
                  <div className="flex items-center justify-between">
                    <h2 className="workspace-card-title">Files</h2>
                    {files.length > 0 && (
                      <div className="relative" ref={dropdownRef}>
                        <button type="button" className="btn-workspace btn-secondary flex items-center gap-2" onClick={() => setShowDropdown(!showDropdown)}>
                          <FileCode className="w-4 h-4" />
                          <span className="max-w-[150px] truncate">{selectedFile ? selectedFile.name : 'Select'}</span>
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        {showDropdown && (
                          <div className="absolute right-0 mt-2 w-72 bg-navy-light border border-gray-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                            {files.map((file) => (
                              <div key={file._id} className={`flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5 ${selectedFile?._id === file._id ? 'bg-blue-500/10 text-blue-300' : 'text-gray-300'}`}>
                                <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => selectFile(file)}>
                                  <FileCode className="w-4 h-4 shrink-0" />
                                  <span className="truncate text-sm">{file.name}</span>
                                </div>
                                <button type="button" className="ml-2 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 shrink-0" onClick={(e) => { e.stopPropagation(); handleDelete(file); }}>
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-3 space-y-1 max-h-[60vh] overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400" /></div>
                  ) : files.length === 0 ? (
                    <div className="text-center py-10">
                      <FileCode className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 mb-3">No files yet</p>
                      <button type="button" className="cta-button px-3 py-1.5 rounded-lg text-sm" onClick={() => setShowNewModal(true)}>Create File</button>
                    </div>
                  ) : (
                    files.map((file) => (
                      <button key={file._id} type="button" onClick={() => selectFile(file)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${selectedFile?._id === file._id ? 'bg-blue-500/20 text-blue-300' : 'hover:bg-white/5 text-gray-300'}`}>
                        <FileCode className="w-4 h-4 shrink-0" />
                        <span className="truncate">{file.name}</span>
                        {file.language && <span className="ml-auto text-xs text-gray-500">{file.language}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Git / Version Control Mini */}
              <div className="workspace-card mt-4">
                <div className="workspace-card-header"><h3 className="workspace-card-title flex items-center gap-2"><GitBranch className="w-4 h-4" /> Version Control</h3></div>
                <div className="p-3 space-y-2">
                  <div className="text-xs text-gray-400">{gitStatus ? `${gitStatus.branch || 'main'} • ${gitStatus.modified?.length || 0} changes` : 'Git not initialized'}</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleGitAction('status')} className="btn-workspace btn-secondary flex-1 text-xs">Status</button>
                    <button type="button" onClick={() => handleGitAction('commit')} className="btn-workspace btn-secondary flex-1 text-xs">Commit</button>
                    <button type="button" onClick={() => handleGitAction('push')} className="btn-workspace btn-primary flex-1 text-xs">Push</button>
                  </div>
                </div>
              </div>

              {/* Collaborators */}
              <div className="workspace-card mt-4">
                <div className="workspace-card-header"><h3 className="workspace-card-title flex items-center gap-2"><Users className="w-4 h-4" /> Collaborators</h3></div>
                <div className="p-3">
                  {collaborators.length === 0 ? <p className="text-xs text-gray-500">No one else here</p> : collaborators.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-300"><div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs">{c.name?.[0] || 'U'}</div><span>{c.name || c.email || 'Anonymous'}</span></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 flex flex-col">
              {status && (
                <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                  {status.msg}
                </div>
              )}

              {activeTab === 'editor' && (
                <div className="workspace-card flex-1 flex flex-col">
                  <div className="workspace-card-header">
                    <div className="flex items-center justify-between">
                      <h2 className="workspace-card-title">{selectedFile ? selectedFile.name : 'Editor'}</h2>
                      {selectedFile && <button type="button" className="cta-button px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2" onClick={handleSave} disabled={saving || !dirty}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save'}</button>}
                    </div>
                  </div>
                  <div className="workspace-card-body flex-1 flex flex-col">
                    {!selectedFile ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <FileCode className="w-12 h-12 text-gray-600 mb-4" />
                        <p className="text-gray-400">Select a file to start editing.</p>
                      </div>
                    ) : (
                      <div className="border border-gray-700 rounded-lg overflow-hidden flex-1">
                        <MonacoEditor height="500px" language={monacoLanguage} value={content} onChange={handleEditorChange} theme="vs-dark" options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, automaticLayout: true, bracketPairColorization: { enabled: true } }} loading={<div className="flex items-center justify-center h-[500px] text-gray-400">Loading editor...</div>} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'terminal' && (
                <div className="workspace-card flex-1 flex flex-col">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><Terminal className="w-4 h-4" /> Terminal</h2></div>
                  <div className="workspace-card-body p-0">
                    <div ref={terminalRef} className="bg-navy-dark rounded-b-lg min-h-[400px] p-2 font-mono text-sm" />
                  </div>
                </div>
              )}

              {activeTab === 'preview' && (
                <div className="workspace-card flex-1">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><Eye className="w-4 h-4" /> Preview</h2></div>
                  <div className="workspace-card-body">
                    <div className="bg-navy-dark rounded-lg p-4 min-h-[400px] flex items-center justify-center">
                      <p className="text-gray-500">Live preview will appear here. Select a file and toggle Design-Code Split.</p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => setActiveTab('split')} className="btn-workspace btn-secondary"><Split className="w-4 h-4" /> Split View</button>
                      <button type="button" onClick={() => window.open(sandboxUrl || '#', '_blank')} className="btn-workspace btn-secondary"><Maximize2 className="w-4 h-4" /> Pop Out</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'split' && (
                <div className="workspace-card flex-1">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><Layers className="w-4 h-4" /> Design-Code Split View</h2></div>
                  <div className="workspace-card-body p-0">
                    <div className="grid grid-cols-2 gap-0 min-h-[500px]">
                      <div className="border-r border-gray-700 p-2">
                        <div className="text-xs text-gray-500 mb-2">Design</div>
                        <div className="bg-navy-dark rounded p-4 h-[460px] flex items-center justify-center"><span className="text-gray-500">Figma / Design preview</span></div>
                      </div>
                      <div className="p-2">
                        <div className="text-xs text-gray-500 mb-2">Code</div>
                        <div className="border border-gray-700 rounded overflow-hidden">
                          <MonacoEditor height="460px" language={monacoLanguage} value={content} onChange={handleEditorChange} theme="vs-dark" options={{ fontSize: 13, minimap: { enabled: false } }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ai' && (
                <div className="workspace-card flex-1 flex flex-col">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><Bot className="w-4 h-4" /> AI Helper</h2></div>
                  <div className="workspace-card-body flex-1 flex flex-col">
                    <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-[400px]">
                      {aiMessages.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">Ask AI about your code, get completions, or request refactors.</p> : aiMessages.map((m, i) => (
                        <div key={i} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-500/10 ml-8' : 'bg-gray-700/50 mr-8'}`}>
                          <div className="text-xs text-gray-400 mb-1">{m.role === 'user' ? 'You' : 'AI'}</div>
                          <div className="text-sm text-gray-200 whitespace-pre-wrap">{m.content}</div>
                        </div>
                      ))}
                      {aiLoading && <div className="text-sm text-gray-400">Thinking...</div>}
                    </div>
                    <form onSubmit={handleAiHelperSend} className="flex gap-2">
                      <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask AI to explain, refactor, or generate code..." className="flex-1 px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-accent" />
                      <button type="submit" disabled={aiLoading || !aiInput.trim()} className="cta-button px-4 py-2 rounded-lg disabled:opacity-50"><Bot className="w-4 h-4" /></button>
                    </form>
                  </div>
                </div>
              )}

              {activeTab === 'collab' && (
                <div className="workspace-card flex-1">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><Users className="w-4 h-4" /> Collaboration</h2></div>
                  <div className="workspace-card-body">
                    <p className="text-sm text-gray-400 mb-4">Real-time Yjs collaboration. Share the file link to invite others.</p>
                    <div className="space-y-2">
                      {collaborators.length === 0 ? <p className="text-sm text-gray-500">No active collaborators</p> : collaborators.map((c, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-navy rounded-lg border border-gray-700">
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm">{c.name?.[0] || 'U'}</div>
                          <div><div className="text-sm font-medium">{c.name || 'Anonymous'}</div><div className="text-xs text-gray-500">{c.email || 'cursor at line ' + (c.cursor || 1)}</div></div>
                          <span className="ml-auto w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'git' && (
                <div className="workspace-card flex-1">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><GitBranch className="w-4 h-4" /> Version Control</h2></div>
                  <div className="workspace-card-body space-y-4">
                    <div className="bg-navy rounded-lg p-4 border border-gray-700 font-mono text-sm">
                      <div className="text-gray-400">Branch: {gitStatus?.branch || 'main'}</div>
                      <div className="text-gray-500">{gitStatus ? `${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind` : 'No git info'}</div>
                      {gitStatus?.modified?.length > 0 && <div className="mt-2 text-amber-400">{gitStatus.modified.length} modified files</div>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleGitAction('pull')} className="btn-workspace btn-secondary flex-1">Pull</button>
                      <button type="button" onClick={() => handleGitAction('commit')} className="btn-workspace btn-secondary flex-1">Commit</button>
                      <button type="button" onClick={() => handleGitAction('push')} className="cta-button flex-1">Push</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'deploy' && (
                <div className="workspace-card flex-1">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><Rocket className="w-4 h-4" /> Deployments</h2></div>
                  <div className="workspace-card-body">
                    <div className="flex gap-2 mb-4">
                      <button type="button" onClick={handleDeploy} className="cta-button px-4 py-2 rounded-lg">Deploy Current File</button>
                      <button type="button" onClick={loadDeployments} className="btn-workspace btn-secondary">Refresh</button>
                    </div>
                    {deployments.length === 0 ? <p className="text-sm text-gray-500">No deployments yet</p> : deployments.map((d, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-navy rounded-lg border border-gray-700 mb-2">
                        <div><div className="text-sm font-medium">{d.id || d._id || `Deploy #${i + 1}`}</div><div className="text-xs text-gray-500">{d.status || 'pending'} • {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}</div></div>
                        <span className={`text-xs px-2 py-1 rounded-full ${d.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>{d.status || 'pending'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'sandbox' && (
                <div className="workspace-card flex-1">
                  <div className="workspace-card-header"><h2 className="workspace-card-title flex items-center gap-2"><Box className="w-4 h-4" /> Sandbox</h2></div>
                  <div className="workspace-card-body">
                    <div className="flex gap-2 mb-4">
                      <button type="button" onClick={handleSandboxStart} className="cta-button px-4 py-2 rounded-lg">Start Sandbox</button>
                      {sandboxUrl && <a href={sandboxUrl} target="_blank" rel="noreferrer" className="btn-workspace btn-secondary">Open in new tab</a>}
                    </div>
                    {sandboxUrl ? <iframe src={sandboxUrl} className="w-full h-[500px] bg-white rounded-lg border border-gray-700" title="Sandbox" /> : <div className="bg-navy-dark rounded-lg h-[500px] flex items-center justify-center text-gray-500">Sandbox not started</div>}
                  </div>
                </div>
              )}

              {tier && languages.length > 0 && (
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                  <span>Tier: {tier}</span>
                  <span>·</span>
                  <span>{languages.filter((l) => l.allowed).length} languages available</span>
                </div>
              )}
            </div>

            {/* Right AI Helper Drawer */}
            {showAiHelper && (
              <div className="w-80 shrink-0">
                <div className="workspace-card h-full flex flex-col">
                  <div className="workspace-card-header flex items-center justify-between">
                    <h3 className="workspace-card-title flex items-center gap-2"><Bot className="w-4 h-4" /> AI Helper</h3>
                    <button type="button" onClick={() => setShowAiHelper(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[60vh]">
                    {aiMessages.length === 0 ? <p className="text-xs text-gray-500 text-center py-4">Ask anything about your code</p> : aiMessages.map((m, i) => (
                      <div key={i} className={`p-2 rounded-lg text-sm ${m.role === 'user' ? 'bg-blue-500/10' : 'bg-white/5'}`}>{m.content}</div>
                    ))}
                  </div>
                  <form onSubmit={handleAiHelperSend} className="p-3 border-t border-gray-700 flex gap-2">
                    <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask AI..." className="flex-1 px-3 py-2 bg-navy border border-gray-600 rounded-lg text-sm text-white" />
                    <button type="submit" className="cta-button p-2 rounded-lg"><Bot className="w-4 h-4" /></button>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Terminal Drawer */}
          {showTerminal && (
            <div className="border-t border-gray-700 bg-navy-dark">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                <span className="text-sm font-medium flex items-center gap-2"><Terminal className="w-4 h-4" /> Terminal</span>
                <button type="button" onClick={() => setShowTerminal(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div ref={terminalRef} className="h-64 overflow-hidden" />
            </div>
          )}
        </main>
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-navy-light border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-lg font-bold">Create New File</h2>
            </div>
            <form onSubmit={handleCreateFile} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">File Name</label>
                <input type="text" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="e.g. app.js" className="form-input w-full" autoFocus required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Language</label>
                <select value={newFileLang} onChange={(e) => setNewFileLang(e.target.value)} className="form-input w-full">
                  {(languages.length > 0 ? languages : [{ name: 'javascript' }, { name: 'python' }, { name: 'typescript' }, { name: 'html' }, { name: 'css' }, { name: 'json' }, { name: 'markdown' }, { name: 'plaintext' }]).map((lang) => (
                    <option key={lang.name} value={lang.name} disabled={lang.allowed === false}>{lang.name}{lang.allowed === false ? ' (unavailable)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Initial Content</label>
                <textarea value={newFileContent} onChange={(e) => setNewFileContent(e.target.value)} placeholder="// Start writing code here..." className="form-textarea w-full font-mono text-sm" style={{ minHeight: '150px', tabSize: 2 }} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-workspace btn-secondary px-4 py-2 rounded-lg" onClick={() => setShowNewModal(false)}>Cancel</button>
                <button type="submit" className="cta-button px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2" disabled={creating || !newFileName.trim()}>
                  <Plus className="w-4 h-4" />
                  {creating ? 'Creating...' : 'Create File'}
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


