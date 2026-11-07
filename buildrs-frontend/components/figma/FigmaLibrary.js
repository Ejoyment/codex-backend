import { useMemo, useState } from 'react';
import { ChevronRight, Figma as FigmaIcon, Folder, Loader2, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';

function matches(file, query) {
  return !query || String(file.name || '').toLowerCase().includes(query);
}

function filterFolder(folder, query) {
  const files = folder.files.filter((file) => matches(file, query));
  const folders = folder.folders.map((child) => filterFolder(child, query)).filter(Boolean);
  if (query && !files.length && !folders.length && !String(folder.name).toLowerCase().includes(query)) return null;
  return { ...folder, files, folders };
}

function countFiles(folders) {
  return folders.reduce((sum, folder) => sum + folder.files.length + countFiles(folder.folders), 0);
}

function FileCard({ file, onOpen }) {
  return (
    <button type="button" className="figma-lib-file" onClick={() => onOpen(file.key)} title={file.name}>
      <span className="figma-lib-thumb">
        {file.thumbnail_url ? (
          // Figma thumbnails are short-lived signed URLs; next/image can't cache them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.thumbnail_url} alt="" loading="lazy" />
        ) : <FigmaIcon />}
      </span>
      <span className="figma-lib-file-name">{file.name || 'Untitled file'}</span>
      {file.last_modified ? <small>Edited {new Date(file.last_modified).toLocaleDateString()}</small> : null}
    </button>
  );
}

function FolderNode({ folder, onOpen, depth, forceOpen }) {
  const total = folder.files.length + countFiles(folder.folders);
  return (
    <details className="figma-lib-folder" open={forceOpen || depth === 0}>
      <summary>
        <ChevronRight className="figma-lib-chevron" />
        <Folder className="figma-lib-folder-icon" />
        <span>{folder.name}</span>
        <small>{total} file{total === 1 ? '' : 's'}</small>
      </summary>
      <div className="figma-lib-folder-body">
        {folder.error ? <p className="figma-files-error">{folder.error}</p> : null}
        {folder.files.length ? (
          <div className="figma-lib-grid">
            {folder.files.map((file) => <FileCard key={file.key} file={file} onOpen={onOpen} />)}
          </div>
        ) : null}
        {folder.folders.map((child) => (
          <FolderNode key={child.id} folder={child} onOpen={onOpen} depth={depth + 1} forceOpen={forceOpen} />
        ))}
        {!folder.files.length && !folder.folders.length && !folder.error ? <p className="figma-lib-empty">Empty folder</p> : null}
      </div>
    </details>
  );
}

export default function FigmaLibrary({ library, loading, onRefresh, onOpenFile, onAddSource, onRemoveSource, onReconnect }) {
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const sources = useMemo(() => (library?.sources || []).map((source) => {
    const root = { id: source.id, name: source.name, files: source.files || [], folders: source.folders || [] };
    const filtered = filterFolder(root, normalizedQuery) || { ...root, files: [], folders: [] };
    return { ...source, files: filtered.files, folders: filtered.folders };
  }), [library, normalizedQuery]);

  const submit = async (event) => {
    event.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      await onAddSource(url.trim());
      setUrl('');
    } catch (error) {
      setAddError(error.message || 'Could not add that team');
    } finally {
      setAdding(false);
    }
  };

  const hasSources = (library?.sources || []).length > 0;

  return (
    <section className="figma-lib" aria-labelledby="figma-lib-title">
      {library?.needsReconnect ? (
        <div className="figma-lib-banner" role="status">
          <span>Reconnect Figma once to let Buildrs read your team folders and designs.</span>
          <button type="button" onClick={onReconnect}>Reconnect Figma</button>
        </div>
      ) : null}

      <div className="figma-lib-head">
        <h3 id="figma-lib-title">Your Figma designs</h3>
        {hasSources ? (
          <label className="figma-lib-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" aria-label="Search Figma files" />
          </label>
        ) : null}
        <button type="button" className="figma-refresh" onClick={onRefresh} disabled={loading} aria-label="Sync from Figma">
          {loading ? <Loader2 className="figma-spin" /> : <RefreshCw />}
          <span>Sync</span>
        </button>
      </div>

      <form className="figma-import" onSubmit={submit}>
        <label htmlFor="figma-team-url">{hasSources ? 'Add another team or folder' : 'Bring in a Figma team'}</label>
        <div className="figma-import-row">
          <input
            id="figma-team-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://www.figma.com/files/team/1234567890/Your-Team"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={adding}
          />
          <button type="submit" disabled={adding || !url.trim()}>
            {adding ? <Loader2 className="figma-spin" /> : <Plus />}
            <span>{adding ? 'Loading…' : 'Add team'}</span>
          </button>
        </div>
        <span className="figma-import-hint">
          In Figma, click your team (or a folder) in the left sidebar and copy the link from the address bar. Every folder and design in it appears here and stays in sync.
        </span>
      </form>
      {addError ? <p className="figma-files-error" role="alert">{addError}</p> : null}

      {loading && !library ? (
        <div className="figma-panel-loading"><Loader2 className="figma-spin" /><span>Loading your Figma folders…</span></div>
      ) : sources.map((source) => {
        const total = (source.files || []).length + countFiles(source.folders || []);
        return (
          <article key={`${source.type}:${source.id}`} className="figma-lib-source">
            <header>
              <span className="figma-file-icon">{source.type === 'team' ? <Users /> : <Folder />}</span>
              <div>
                <strong>{source.name}</strong>
                <small>{source.type === 'team' ? 'Team' : 'Folder'} · {total} file{total === 1 ? '' : 's'}{source.truncated ? ' · showing the first folders' : ''}</small>
              </div>
              <button
                type="button"
                className="figma-file-remove"
                onClick={() => onRemoveSource(source.type, source.id)}
                aria-label={`Remove ${source.name} from Buildrs`}
              >
                <Trash2 />
              </button>
            </header>
            {source.error ? (
              <p className="figma-files-error" role="alert">
                {source.error}
                {source.errorCode === 'FIGMA_SCOPE' ? <> <button type="button" className="figma-lib-inline" onClick={onReconnect}>Reconnect Figma</button></> : null}
              </p>
            ) : null}
            {source.files?.length ? (
              <div className="figma-lib-grid">
                {source.files.map((file) => <FileCard key={file.key} file={file} onOpen={onOpenFile} />)}
              </div>
            ) : null}
            {(source.folders || []).map((folder) => (
              <FolderNode key={folder.id} folder={folder} onOpen={onOpenFile} depth={0} forceOpen={Boolean(normalizedQuery)} />
            ))}
            {!source.error && !total ? <p className="figma-lib-empty">{normalizedQuery ? 'No matching files.' : 'No files in this team yet.'}</p> : null}
          </article>
        );
      })}
    </section>
  );
}
