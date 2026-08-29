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
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <FolderTree className="w-12 h-12 text-gray-600 mb-4" />
        <p className="text-gray-400 text-sm">No source files found</p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {sortedLangs.map((lang) => (
        <div key={lang} className="mb-2">
          <button
            type="button"
            onClick={() =>
              setOpenDirs((prev) => ({ ...prev, [lang]: !prev[lang] }))
            }
            className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded text-xs font-semibold uppercase tracking-wider text-gray-400 hover:bg-white/5 transition-colors"
          >
            {openDirs[lang] === false ? (
              <ChevronRight className="w-3 h-3 text-gray-500" />
            ) : (
              <ChevronDown className="w-3 h-3 text-gray-500" />
            )}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: LANG_COLORS[lang] || '#6e7681' }}
            />
            <span>{lang}</span>
            <span className="text-gray-600 font-normal">
              ({grouped[lang].length})
            </span>
          </button>
          {openDirs[lang] !== false &&
            grouped[lang]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((file) => (
                <button
                  key={file._id}
                  type="button"
                  onClick={() => onSelect(file)}
                  className={`flex items-center gap-2 w-full text-left py-1.5 px-2 rounded text-sm transition-colors ${
                    selectedFile?._id === file._id
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                  style={{ paddingLeft: '24px' }}
                >
                  <FileCode
                    className="w-4 h-4 flex-shrink-0"
                    style={{
                      color: LANG_COLORS[lang] || '#6e7681',
                    }}
                  />
                  <span className="truncate">{file.name}</span>
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

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main ml-64 flex-1 min-h-screen flex flex-col">
          <header className="workspace-header">
            <div className="flex items-center gap-3">
              <Code2 className="w-5 h-5 text-blue-400" />
              <h1 className="text-xl font-bold">Source Code</h1>
              {!loading && (
                <span className="text-sm text-gray-500">
                  {displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 bg-navy-light border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-accent w-56"
              />
            </div>
          </header>

          <div className="workspace-content flex-1 flex overflow-hidden">
            <div className="flex w-full h-full gap-0">
              {/* Left panel — file tree */}
              <div className="w-72 flex-shrink-0 border-r border-gray-700 flex flex-col bg-navy-light/30 rounded-l-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-300">
                    Files
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin mb-2" />
                      <span className="text-sm">Loading files...</span>
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <p className="text-red-400 text-sm mb-1">Error loading files</p>
                      <p className="text-gray-500 text-xs">{error}</p>
                    </div>
                  ) : (
                    <FileTree
                      files={displayFiles}
                      selectedFile={selectedFile}
                      onSelect={setSelectedFile}
                    />
                  )}
                </div>
              </div>

              {/* Right panel — code viewer */}
              <div className="flex-1 flex flex-col bg-navy-light/10 rounded-r-lg overflow-hidden">
                {selectedFile ? (
                  <>
                    <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
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
                      <span className="text-sm font-medium text-white truncate">
                        {selectedFile.name}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold"
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
                      <span className="ml-auto text-xs text-gray-500">
                        {selectedFile.updatedAt
                          ? new Date(
                              selectedFile.updatedAt
                            ).toLocaleDateString()
                          : ''}
                      </span>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <pre className="p-4 text-sm text-gray-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
                        {selectedFile.content || '(empty file)'}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                    <Code2 className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-sm">Select a file to view its source</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Click any file in the tree on the left
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
