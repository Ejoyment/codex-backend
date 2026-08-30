import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Save, Plus, ChevronDown, FileCode, Trash2 } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';

function getMonacoLanguage(lang) {
  if (!lang) return 'plaintext';
  const l = lang.toLowerCase();
  const map = {
    js: 'javascript',
    javascript: 'javascript',
    ts: 'typescript',
    typescript: 'typescript',
    tsx: 'typescript',
    jsx: 'javascript',
    py: 'python',
    python: 'python',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    go: 'go',
    rust: 'rust',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    sql: 'sql',
    dockerfile: 'dockerfile',
    plaintext: 'plaintext',
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
  const dropdownRef = useRef(null);
  const originalContentRef = useRef('');

  useEffect(() => {
    loadFiles();
    loadLanguages();
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
    } catch {
      // silent
    }
  }

  function selectFile(file) {
    if (dirty && !window.confirm('You have unsaved changes. Discard?')) return;
    setSelectedFile(file);
    setContent(file.content || '');
    originalContentRef.current = file.content || '';
    setDirty(false);
    setShowDropdown(false);
    setStatus(null);
  }

  const monacoLanguage = useMemo(() => getMonacoLanguage(selectedFile?.language), [selectedFile?.language]);

  const handleEditorChange = useCallback((value) => {
    const val = value ?? '';
    setContent(val);
    setDirty(val !== originalContentRef.current);
  }, []);

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
    if (!window.confirm(`Delete "${file.name}"?`)) return;
    try {
      await apiFetch(`/api/code-editor/files/${file._id}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((f) => f._id !== file._id));
      if (selectedFile?._id === file._id) {
        setSelectedFile(null);
        setContent('');
        originalContentRef.current = '';
        setDirty(false);
      }
      setStatus({ type: 'success', msg: 'File deleted' });
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || 'Delete failed' });
    }
  }

  return (
    <AuthGuard>
      <Head>
        <title>Code Editor - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold">Code Editor</h1>
              {selectedFile && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <FileCode className="w-3 h-3" />
                  {selectedFile.language || 'plain'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {dirty && (
                <span className="text-xs text-amber-400 font-medium">Unsaved changes</span>
              )}
              <button
                type="button"
                className="btn-workspace btn-primary"
                onClick={() => setShowNewModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span>New File</span>
              </button>
            </div>
          </header>

          <div className="workspace-content p-6">
            {status && (
              <div
                className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${
                  status.type === 'success'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              >
                {status.msg}
              </div>
            )}

            <div className="workspace-card">
              <div className="workspace-card-header">
                <div className="flex items-center justify-between">
                  <h2 className="workspace-card-title">Files</h2>
                  {files.length > 0 && (
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        className="btn-workspace btn-secondary flex items-center gap-2"
                        onClick={() => setShowDropdown(!showDropdown)}
                      >
                        <FileCode className="w-4 h-4" />
                        <span className="max-w-[200px] truncate">
                          {selectedFile ? selectedFile.name : 'Select a file'}
                        </span>
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      {showDropdown && (
                        <div className="absolute right-0 mt-2 w-72 bg-navy-light border border-gray-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                          {files.map((file) => (
                            <div
                              key={file._id}
                              className={`flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5 ${
                                selectedFile?._id === file._id ? 'bg-blue-500/10 text-blue-300' : 'text-gray-300'
                              }`}
                            >
                              <div
                                className="flex items-center gap-2 flex-1 min-w-0"
                                onClick={() => selectFile(file)}
                              >
                                <FileCode className="w-4 h-4 shrink-0" />
                                <span className="truncate text-sm">{file.name}</span>
                                {file.language && (
                                  <span className="text-xs text-gray-500 shrink-0">{file.language}</span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="ml-2 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(file);
                                }}
                                title="Delete file"
                              >
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

              <div className="workspace-card-body">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
                  </div>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <FileCode className="w-12 h-12 text-gray-600 mb-4" />
                    <p className="text-gray-400 mb-4">No files yet. Create one to get started.</p>
                    <button
                      type="button"
                      className="cta-button px-4 py-2 rounded-lg text-white font-medium"
                      onClick={() => setShowNewModal(true)}
                    >
                      <Plus className="w-4 h-4 inline mr-1" />
                      Create File
                    </button>
                  </div>
                ) : !selectedFile ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <FileCode className="w-12 h-12 text-gray-600 mb-4" />
                    <p className="text-gray-400">Select a file from the dropdown above to start editing.</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300">{selectedFile.name}</span>
                        <span className="text-xs text-gray-500">
                          {selectedFile.updatedAt
                            ? `Updated ${new Date(selectedFile.updatedAt).toLocaleString()}`
                            : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="cta-button px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2"
                        onClick={handleSave}
                        disabled={saving || !dirty}
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    <div className="border border-gray-700 rounded-lg overflow-hidden">
                      <MonacoEditor
                        height="500px"
                        language={monacoLanguage}
                        value={content}
                        onChange={handleEditorChange}
                        theme="vs-dark"
                        options={{
                          fontSize: 14,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                          tabSize: 2,
                          automaticLayout: true,
                          bracketPairColorization: { enabled: true },
                          suggestOnTriggerCharacters: true,
                        }}
                        loading={<div className="flex items-center justify-center h-[500px] text-gray-400">Loading editor...</div>}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {tier && languages.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                <span>Tier: {tier}</span>
                <span>·</span>
                <span>{languages.filter((l) => l.allowed).length} languages available</span>
              </div>
            )}
          </div>
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
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. app.js"
                  className="form-input w-full"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Language</label>
                <select
                  value={newFileLang}
                  onChange={(e) => setNewFileLang(e.target.value)}
                  className="form-input w-full"
                >
                  {(languages.length > 0 ? languages : [
                    { name: 'javascript' }, { name: 'python' }, { name: 'typescript' },
                    { name: 'html' }, { name: 'css' }, { name: 'json' },
                    { name: 'markdown' }, { name: 'plaintext' },
                  ]).map((lang) => (
                    <option key={lang.name} value={lang.name} disabled={lang.allowed === false}>
                      {lang.name}{lang.allowed === false ? ' (unavailable)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Initial Content</label>
                <textarea
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  placeholder="// Start writing code here..."
                  className="form-textarea w-full font-mono text-sm"
                  style={{ minHeight: '150px', tabSize: 2 }}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="btn-workspace btn-secondary px-4 py-2 rounded-lg"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cta-button px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2"
                  disabled={creating || !newFileName.trim()}
                >
                  <Plus className="w-4 h-4" />
                  {creating ? 'Creating...' : 'Create File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
