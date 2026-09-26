import { useState, useEffect } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import {
  FileCode,
  ChevronRight,
  ChevronDown,
  Code2,
  Loader2,
  FolderTree,
  Search,
} from 'lucide-react';

const LANG_COLORS = {
  javascript: '#f7df1e',
  typescript: '#3178c6',
  python: '#3776ab',
  java: '#ed8b00',
  go: '#00add8',
  rust: '#dea584',
  cpp: '#00599c',
  c: '#555555',
  ruby: '#cc342d',
  php: '#777bb4',
  html: '#e34c26',
  css: '#563d7c',
  json: '#292929',
  yaml: '#cb171e',
  markdown: '#083fa1',
  shell: '#89e051',
  sql: '#e38c00',
  text: '#6e7681',
};

function detectLanguage(filename) {
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  const map = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    cpp: 'cpp',
    cc: 'cpp',
    c: 'c',
    h: 'c',
    rb: 'ruby',
    php: 'php',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'css',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'shell',
    bash: 'shell',
    sql: 'sql',
  };
  return map[ext] || 'text';
}

function FileTree({ files, selectedFile, onSelect }) {
  const [openDirs, setOpenDirs] = useState({});

  const grouped = files.reduce((acc, file) => {
    const lang = file.language || detectLanguage(file.name);
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(file);
    return acc;
  }, {});

  const sortedLangs = Object.keys(grouped).sort();

  if (files.length === 0) {
    return (
      <div className="src-empty py-10">
        <div className="src-empty-ico">
          <FolderTree className="w-6 h-6" />
        </div>
        <p className="dash-empty-title">No source files found</p>
      </div>
    );
  }

  return (
    <div>
      {sortedLangs.map((lang) => (
        <div key={lang} className="src-lang-group">
          <button
            type="button"
            onClick={() =>
              setOpenDirs((prev) => ({ ...prev, [lang]: !prev[lang] }))
            }
            className="src-lang-head"
          >
            {openDirs[lang] === false ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            <span
              className="src-lang-dot"
              style={{ background: LANG_COLORS[lang] || '#6e7681' }}
            />
            <span>{lang}</span>
            <span className="src-lang-count">{grouped[lang].length}</span>
          </button>
          {openDirs[lang] !== false &&
            grouped[lang]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((file) => (
                <button
                  key={file._id}
                  type="button"
                  onClick={() => onSelect(file)}
                  className={`src-file ${selectedFile?._id === file._id ? 'is-active' : ''}`}
                >
                  <FileCode
                    className="w-4 h-4 flex-shrink-0"
                    style={{
                      color: LANG_COLORS[lang] || '#6e7681',
                    }}
                  />
                  <span>{file.name}</span>
                </button>
              ))}
        </div>
      ))}
    </div>
  );
}

export default function SourceCode() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [files, setFiles] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [filesRes, langsRes] = await Promise.allSettled([
          apiFetch('/api/code-editor/files'),
          apiFetch('/api/code-editor/languages'),
        ]);
        if (cancelled) return;
        if (filesRes.status === 'fulfilled' && filesRes.value.success) {
          setFiles(filesRes.value.files || []);
        }
        if (langsRes.status === 'fulfilled' && langsRes.value.success) {
          setLanguages(langsRes.value.languages || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load source files');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = searchQuery.trim()
    ? files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : files;

  const allowedLangs = languages
    .filter((l) => l.allowed)
    .map((l) => l.name.toLowerCase());

  const displayFiles =
    allowedLangs.length > 0
      ? filtered.filter((f) => {
          const lang = (f.language || detectLanguage(f.name)).toLowerCase();
          return allowedLangs.includes(lang);
        })
      : filtered;

  return (
    <AuthGuard>
      <Head>
        <title>Source Code - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Source Code
              </p>
              <h1 className="dash-title">Source Code</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>Repository explorer</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!loading && (
                <span className="dash-pill hidden md:inline-flex">
                  <span className="dot" />
                  {displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''}
                </span>
              )}
              <div className="src-search">
                <Search className="w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </header>

          <div className="workspace-content">
            <div className="src-content">
              <div className="src-shell">
                {/* Left panel — file tree */}
                <aside className="src-pane">
                  <div className="src-pane-head">
                    <FolderTree className="w-4 h-4" style={{ color: '#2fd6e6' }} />
                    <span className="src-pane-title">Files</span>
                    {!loading && <span className="src-count">{displayFiles.length}</span>}
                  </div>
                  <div className="src-tree">
                    {loading ? (
                      <div className="dash-empty">
                        <div className="dash-empty-ico">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                        <p className="dash-empty-title">Loading files...</p>
                      </div>
                    ) : error ? (
                      <div className="dash-empty">
                        <p className="dash-empty-title">Error loading files</p>
                        <p className="dash-empty-sub">{error}</p>
                      </div>
                    ) : (
                      <FileTree
                        files={displayFiles}
                        selectedFile={selectedFile}
                        onSelect={setSelectedFile}
                      />
                    )}
                  </div>
                </aside>

                {/* Right panel — code viewer */}
                <div className="src-viewer">
                  {selectedFile ? (
                    <>
                      <div className="src-viewer-head">
                        <FileCode
                          className="w-4 h-4 flex-shrink-0"
                          style={{
                            color:
                              LANG_COLORS[
                                selectedFile.language ||
                                  detectLanguage(selectedFile.name)
                              ] || '#6e7681',
                          }}
                        />
                        <span className="src-viewer-name">
                          {selectedFile.name}
                        </span>
                        <span
                          className="src-lang-badge"
                          style={{
                            background:
                              (LANG_COLORS[
                                selectedFile.language ||
                                  detectLanguage(selectedFile.name)
                              ] || '#6e7681') + '22',
                            color:
                              LANG_COLORS[
                                selectedFile.language ||
                                  detectLanguage(selectedFile.name)
                              ] || '#6e7681',
                          }}
                        >
                          {(selectedFile.language ||
                            detectLanguage(selectedFile.name)
                          ).toUpperCase()}
                        </span>
                        <span className="src-updated">
                          {selectedFile.updatedAt
                            ? new Date(
                                selectedFile.updatedAt
                              ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : ''}
                        </span>
                      </div>
                      <div className="src-canvas">
                        <pre className="src-code">
                          {selectedFile.content || '(empty file)'}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="src-empty">
                      <div className="src-empty-ico">
                        <Code2 className="w-7 h-7" />
                      </div>
                      <p className="dash-empty-title">Select a file to view its source</p>
                      <p className="dash-empty-sub">
                        Click any file in the tree on the left
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
