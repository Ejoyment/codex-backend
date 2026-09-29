import { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { useCurrentCompany } from '../hooks/useCurrentCompany';
import { apiFetch } from '../lib/api';
import {
  FileCode,
  ChevronRight,
  ChevronDown,
  Code2,
  Loader2,
  FolderTree,
  Search,
  Folder,
  FolderOpen,
  Github,
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
  kotlin: '#a97bff',
  scala: '#c22d40',
  haskell: '#5e5086',
  julia: '#a05fdd',
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
    kt: 'kotlin',
    kts: 'kotlin',
    scala: 'scala',
    hs: 'haskell',
    jl: 'julia',
  };
  return map[ext] || 'text';
}

// Canonical language for coloring/badging: trust the stored value only when
// it's a known color key (repo blobs store raw extensions like 'js').
function fileLang(file) {
  const raw = String(file?.language || '').toLowerCase();
  return LANG_COLORS[raw] ? raw : detectLanguage(file?.name);
}

// Two file shapes: GitHub tree entries store the FULL path ('/src/app.js'),
// workspace CodeFiles store the DIRECTORY ('/src') plus name ('app.js').
function fullFilePath(f) {
  const name = f.name || '';
  const base = String(f.path || '/').replace(/\/+$/, '');
  if (!name) return base || '/';
  if (!base) return `/${name}`;
  if (base === name || base.endsWith(`/${name}`)) return `/${base}`.replace(/^\/+/, '/');
  return `${base}/${name}`;
}

// Flat file list → folder tree ({type:'folder'|'file', children}) using the
// full path, so folders from any source render as a real explorer.
function buildTree(files) {
  const root = { type: 'folder', name: '', path: '/', children: new Map() };
  files.forEach((f) => {
    const full = fullFilePath(f);
    const parts = full.split('/').filter(Boolean);
    if (!parts.length) return;
    // Folder markers: GitHub tree folder entries and .gitkeep placeholders
    // create the folder itself, never a file node.
    const marker = f.type === 'folder' || (f.name || '') === '.gitkeep';
    const dirParts = marker ? parts : parts.slice(0, -1);
    const leaf = marker ? null : parts[parts.length - 1];
    let cur = root;
    let rp = '';
    for (let i = 0; i < dirParts.length; i++) {
      rp = rp ? `${rp}/${dirParts[i]}` : dirParts[i];
      if (!cur.children.has(dirParts[i]) || cur.children.get(dirParts[i]).type !== 'folder') {
        cur.children.set(dirParts[i], { type: 'folder', name: dirParts[i], path: rp, children: new Map() });
      }
      cur = cur.children.get(dirParts[i]);
    }
    if (leaf && (!cur.children.has(leaf) || cur.children.get(leaf).type !== 'folder')) {
      cur.children.set(leaf, { type: 'file', name: leaf, file: f, full });
    }
  });
  return root;
}

function sortNodes(nodes) {
  return nodes.sort((a, b) => {
    if ((a.type === 'folder') !== (b.type === 'folder')) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Selection is keyed per group so the same path in a workspace and in a repo
// never highlight/replace each other ('ws:/a.js' vs 'gh:owner/repo:/a.js').
function makeSelectKey(groupKey, full) {
  return groupKey === 'workspace' || groupKey === 'other'
    ? `${groupKey}:${full}`
    : `gh:${groupKey}:${full}`;
}

// Recursive folder/file rows inside one group.
function GroupNodes({ groupKey, node, depth, openDirs, setOpenDirs, forceOpen, selectedKey, onSelect }) {
  const children = sortNodes([...node.children.values()]);
  return children.map((child) => {
    if (child.type === 'folder') {
      const dk = `${groupKey}:${child.path}`;
      const open = forceOpen || (dk in openDirs ? openDirs[dk] : true);
      return (
        <div key={dk}>
          <button
            type="button"
            className="src-dir"
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onClick={() => setOpenDirs((prev) => ({ ...prev, [dk]: !open }))}
          >
            {open ? (
              <ChevronRight className="w-3 h-3 src-dir-chev is-open" />
            ) : (
              <ChevronRight className="w-3 h-3 src-dir-chev" />
            )}
            {open ? (
              <FolderOpen className="w-3.5 h-3.5" style={{ color: '#9aa7b8' }} />
            ) : (
              <Folder className="w-3.5 h-3.5" style={{ color: '#9aa7b8' }} />
            )}
            <span>{child.name}</span>
          </button>
          {open && (
            <GroupNodes
              groupKey={groupKey}
              node={child}
              depth={depth + 1}
              openDirs={openDirs}
              setOpenDirs={setOpenDirs}
              forceOpen={forceOpen}
              selectedKey={selectedKey}
              onSelect={onSelect}
            />
          )}
        </div>
      );
    }
    const lang = fileLang(child.file);
    const key = makeSelectKey(groupKey, child.full);
    return (
      <button
        key={child.full}
        type="button"
        onClick={() => onSelect(child.file, groupKey)}
        className={`src-file ${selectedKey === key ? 'is-active' : ''}`}
        style={{ paddingLeft: `${24 + depth * 12}px` }}
      >
        <FileCode className="w-4 h-4 flex-shrink-0" style={{ color: LANG_COLORS[lang] || '#6e7681' }} />
        <span>{child.name}</span>
      </button>
    );
  });
}

// One collapsible top-level section: Workspace / a GitHub repo / Other files.
function GroupSection({ icon, label, count, open, loading, error, children }) {
  return (
    <div className="src-lang-group">
      <button type="button" onClick={() => open.onToggle()} className="src-lang-head">
        {open.isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {icon}
        <span>{label}</span>
        {loading ? (
          <Loader2 className="w-3 h-3 src-lang-count animate-spin" />
        ) : count !== null && count !== undefined ? (
          <span className="src-lang-count">{count}</span>
        ) : null}
      </button>
      {open.isOpen && (
        <>
          {error && <p className="src-group-note is-error">{error}</p>}
          {!error && children}
        </>
      )}
    </div>
  );
}

export default function SourceCode() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { selectedCompany } = useCurrentCompany();

  const [files, setFiles] = useState([]);
  const [repos, setRepos] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clock, setClock] = useState('');
  // Section open/closed: 'workspace'/'other' default open, repos closed
  // until clicked (their file list is fetched lazily on first open).
  const [openGroups, setOpenGroups] = useState({ workspace: true, other: true });
  // Folder open/closed inside groups, keyed `${group}:${dirPath}`.
  const [openDirs, setOpenDirs] = useState({});
  // repo fullName → { status: 'loading'|'ready'|'error', files, error }
  const [repoTrees, setRepoTrees] = useState({});
  // Content fetch state for lazy (GitHub) files: keyed by selectKey.
  const [loadingKey, setLoadingKey] = useState(null);
  const [contentError, setContentError] = useState(null);
  const repoContentRef = useRef({});

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
        const [filesRes, langsRes, reposRes] = await Promise.allSettled([
          apiFetch('/api/code-editor/files'),
          apiFetch('/api/code-editor/languages'),
          apiFetch('/api/github/repos?per_page=30'),
        ]);
        if (cancelled) return;
        if (filesRes.status === 'fulfilled' && filesRes.value.success) {
          setFiles(filesRes.value.files || []);
        }
        if (langsRes.status === 'fulfilled' && langsRes.value.success) {
          setLanguages(langsRes.value.languages || []);
        }
        if (reposRes.status === 'fulfilled' && reposRes.value?.success) {
          setRepos(reposRes.value.repositories || []);
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

  const q = searchQuery.trim().toLowerCase();
  const allowedLangs = useMemo(
    () => languages.filter((l) => l.allowed).map((l) => l.name.toLowerCase()),
    [languages],
  );

  const matchesQuery = (f) => {
    if (!q) return true;
    return f.name?.toLowerCase().includes(q) || fullFilePath(f).toLowerCase().includes(q);
  };
  const langAllowed = (f) => allowedLangs.length === 0 || allowedLangs.includes(fileLang(f));
  const visible = (list) => list.filter((f) => langAllowed(f) && matchesQuery(f));

  // Workspace = the current workspace's files; the rest (other workspaces /
  // stray files) is shown after the repo dropdowns.
  const workspaceAll = useMemo(() => {
    if (!selectedCompany) return files;
    const sid = String(selectedCompany._id);
    return files.filter((f) => String(f.company || '') === sid);
  }, [files, selectedCompany]);
  const restAll = useMemo(() => {
    if (!selectedCompany) return [];
    const sid = String(selectedCompany._id);
    return files.filter((f) => String(f.company || '') !== sid);
  }, [files, selectedCompany]);

  const workspaceFiles = visible(workspaceAll);
  const restFiles = visible(restAll);

  const repoVisibleCount = (fullName) => {
    const st = repoTrees[fullName];
    if (!st || st.status !== 'ready') return null;
    return visible(st.files).length;
  };
  const totalVisible =
    workspaceFiles.length
    + restFiles.length
    + repos.reduce((n, r) => n + (repoVisibleCount(r.fullName) || 0), 0);

  const forceOpen = !!q;

  const toggleGroup = (key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Lazily fetch a repo's recursive tree the first time it is expanded.
  const toggleRepo = async (repo) => {
    const key = repo.fullName;
    const willOpen = !openGroups[key];
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
    if (!willOpen || repoTrees[key]) return;
    setRepoTrees((prev) => ({ ...prev, [key]: { status: 'loading', files: [] } }));
    try {
      const data = await apiFetch(`/api/github/repos/${repo.owner}/${repo.name}/git/tree?recursive=1`);
      const all = [...(data?.files || []), ...(data?.folders || [])];
      setRepoTrees((prev) => ({ ...prev, [key]: { status: 'ready', files: all } }));
    } catch (err) {
      setRepoTrees((prev) => ({
        ...prev,
        [key]: { status: 'error', files: [], error: err.message || 'Failed to load repo files' },
      }));
    }
  };

  const selectFile = async (file, groupKey) => {
    const full = fullFilePath(file);
    if (groupKey === 'workspace' || groupKey === 'other') {
      setContentError(null);
      setSelectedFile({ ...file, selectKey: makeSelectKey(groupKey, full), group: groupKey });
      return;
    }
    const repo = repos.find((r) => r.fullName === groupKey);
    const selectKey = makeSelectKey(groupKey, full);
    const cached = repoContentRef.current[selectKey];
    setContentError(null);
    setSelectedFile({ ...file, selectKey, group: groupKey, content: cached });
    if (cached !== undefined) return;
    setLoadingKey(selectKey);
    try {
      const pathNoSlash = full.replace(/^\/+/, '');
      const ref = repo?.defaultBranch ? `?ref=${encodeURIComponent(repo.defaultBranch)}` : '';
      const data = await apiFetch(
        `/api/github/repos/${repo.owner}/${repo.name}/contents/${encodeURIComponent(pathNoSlash)}${ref}`,
      );
      const content = data?.file?.content;
      if (typeof content !== 'string') throw new Error('File content unavailable');
      repoContentRef.current[selectKey] = content;
      setSelectedFile((prev) => (prev && prev.selectKey === selectKey ? { ...prev, content } : prev));
    } catch (err) {
      setContentError(err.message || 'Failed to load file content');
      setSelectedFile((prev) => (prev && prev.selectKey === selectKey ? { ...prev, content: '' } : prev));
    } finally {
      setLoadingKey(null);
    }
  };

  const selectedLang = selectedFile ? fileLang(selectedFile) : 'text';
  const isRepoSelection = selectedFile
    && selectedFile.group !== 'workspace'
    && selectedFile.group !== 'other';
  const contentLoading = selectedFile && loadingKey === selectedFile.selectKey;

  const workspaceTree = useMemo(() => buildTree(workspaceFiles), [workspaceFiles]);
  const restTree = useMemo(() => buildTree(restFiles), [restFiles]);
  const nothingAtAll =
    !loading && files.length === 0 && repos.length === 0;

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
                  {totalVisible} file{totalVisible !== 1 ? 's' : ''}
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
                    {!loading && <span className="src-count">{totalVisible}</span>}
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
                    ) : nothingAtAll ? (
                      <div className="src-empty py-10">
                        <div className="src-empty-ico">
                          <FolderTree className="w-6 h-6" />
                        </div>
                        <p className="dash-empty-title">No source files found</p>
                      </div>
                    ) : (
                      <>
                        {/* 1 — current workspace */}
                        {workspaceFiles.length > 0 && (
                          <GroupSection
                            groupKey="workspace"
                            icon={
                              openGroups.workspace || forceOpen ? (
                                <FolderOpen className="w-3.5 h-3.5" style={{ color: '#2fd6e6' }} />
                              ) : (
                                <Folder className="w-3.5 h-3.5" style={{ color: '#2fd6e6' }} />
                              )
                            }
                            label="Workspace"
                            count={workspaceFiles.length}
                            open={{
                              isOpen: forceOpen || !!openGroups.workspace,
                              onToggle: () => toggleGroup('workspace'),
                            }}
                          >
                            <GroupNodes
                              groupKey="workspace"
                              node={workspaceTree}
                              depth={0}
                              openDirs={openDirs}
                              setOpenDirs={setOpenDirs}
                              forceOpen={forceOpen}
                              selectedKey={selectedFile?.selectKey}
                              onSelect={selectFile}
                            />
                          </GroupSection>
                        )}

                        {/* 2 — one dropdown per GitHub repo (lazy-loaded) */}
                        {repos.map((repo) => {
                          const key = repo.fullName;
                          const st = repoTrees[key];
                          const isOpen = forceOpen && st?.status === 'ready' ? true : !!openGroups[key];
                          const count = st?.status === 'ready' ? repoVisibleCount(key) : null;
                          return (
                            <GroupSection
                              key={key}
                              groupKey={key}
                              icon={<Github className="w-3.5 h-3.5" style={{ color: '#8b949e' }} />}
                              label={repo.fullName}
                              count={count}
                              loading={st?.status === 'loading'}
                              error={st?.status === 'error' ? st.error : null}
                              open={{ isOpen, onToggle: () => toggleRepo(repo) }}
                            >
                              {st?.status === 'ready' && (
                                <GroupNodes
                                  groupKey={key}
                                  node={buildTree(visible(st.files))}
                                  depth={0}
                                  openDirs={openDirs}
                                  setOpenDirs={setOpenDirs}
                                  forceOpen={forceOpen}
                                  selectedKey={selectedFile?.selectKey}
                                  onSelect={selectFile}
                                />
                              )}
                              {st?.status === 'loading' && (
                                <p className="src-group-note">Loading repository files…</p>
                              )}
                            </GroupSection>
                          );
                        })}

                        {/* 3 — the rest (other workspaces / stray files) */}
                        {restFiles.length > 0 && (
                          <GroupSection
                            groupKey="other"
                            icon={<FileCode className="w-3.5 h-3.5" style={{ color: '#e5b84a' }} />}
                            label="Other files"
                            count={restFiles.length}
                            open={{
                              isOpen: forceOpen || !!openGroups.other,
                              onToggle: () => toggleGroup('other'),
                            }}
                          >
                            <GroupNodes
                              groupKey="other"
                              node={restTree}
                              depth={0}
                              openDirs={openDirs}
                              setOpenDirs={setOpenDirs}
                              forceOpen={forceOpen}
                              selectedKey={selectedFile?.selectKey}
                              onSelect={selectFile}
                            />
                          </GroupSection>
                        )}

                        {workspaceFiles.length === 0
                          && restFiles.length === 0
                          && repos.length === 0 && (
                          <div className="src-empty py-10">
                            <div className="src-empty-ico">
                              <FolderTree className="w-6 h-6" />
                            </div>
                            <p className="dash-empty-title">No source files found</p>
                          </div>
                        )}
                      </>
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
                          style={{ color: LANG_COLORS[selectedLang] || '#6e7681' }}
                        />
                        <span className="src-viewer-name">
                          {selectedFile.name}
                        </span>
                        <span
                          className="src-lang-badge"
                          style={{
                            background: (LANG_COLORS[selectedLang] || '#6e7681') + '22',
                            color: LANG_COLORS[selectedLang] || '#6e7681',
                          }}
                        >
                          {selectedLang.toUpperCase()}
                        </span>
                        {isRepoSelection && (
                          <span className="src-updated">
                            <Github className="w-3 h-3" style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                            {selectedFile.group}
                          </span>
                        )}
                        {selectedFile.updatedAt ? (
                          <span className="src-updated">
                            {new Date(selectedFile.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        ) : null}
                      </div>
                      <div className="src-canvas">
                        {contentLoading ? (
                          <div className="src-empty">
                            <div className="src-empty-ico">
                              <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                            <p className="dash-empty-title">Loading file...</p>
                          </div>
                        ) : contentError ? (
                          <div className="src-empty">
                            <div className="src-empty-ico">
                              <Code2 className="w-7 h-7" />
                            </div>
                            <p className="dash-empty-title">Could not load file</p>
                            <p className="dash-empty-sub">{contentError}</p>
                          </div>
                        ) : (
                          <pre className="src-code">
                            {selectedFile.content || '(empty file)'}
                          </pre>
                        )}
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
