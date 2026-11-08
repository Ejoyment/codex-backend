import { useMemo, useState } from 'react';
import { Figma as FigmaIcon, Loader2, RefreshCw, Search } from 'lucide-react';

function FileCard({ file, onOpen }) {
  return (
    <button
      type="button"
      className="flib-card"
      onClick={() => onOpen(file.key)}
      title={file.name}
    >
      <div className="flib-card-thumb">
        {file.thumbnail_url
          ? <img src={file.thumbnail_url} alt="" loading="lazy" />
          : <FigmaIcon className="flib-card-placeholder" />}
      </div>
      <div className="flib-card-body">
        <span className="flib-card-name">{file.name || 'Untitled file'}</span>
        {file.last_modified
          ? <span className="flib-card-meta">Edited {new Date(file.last_modified).toLocaleDateString()}</span>
          : null}
      </div>
    </button>
  );
}

export default function FigmaLibrary({
  files = [],
  loading = false,
  account = '',
  onRefresh,
  onOpenFile,
  onAddSource,
  onRemoveSource,
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const visible = useMemo(
    () => files.filter((f) => !q || (f.name || '').toLowerCase().includes(q)),
    [files, q],
  );

  return (
    <section className="flib">
      <div className="flib-topbar">
        <div className="flib-topbar-left">
          <span className="flib-status-dot" />
          <span className="flib-account">{account || 'Figma connected'}</span>
        </div>

        <div className="flib-topbar-right">
          {files.length > 0 && (
            <label className="flib-search">
              <Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search designs…"
                aria-label="Search Figma files"
              />
            </label>
          )}
          <button
            type="button"
            className="flib-refresh"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
          >
            {loading ? <Loader2 className="figma-spin" /> : <RefreshCw />}
            Refresh
          </button>
        </div>
      </div>

      <div className="flib-heading">
        <h2>Your Figma designs</h2>
        <p>Click any design to browse its frames, convert to code, or assign to an agent.</p>
      </div>

      {loading && files.length === 0 ? (
        <div className="figma-panel-loading">
          <Loader2 className="figma-spin" />
          <span>Loading your designs…</span>
        </div>
      ) : files.length > 0 ? (
        visible.length > 0 ? (
          <div className="flib-grid">
            {visible.map((file) => (
              <FileCard key={file.key} file={file} onOpen={onOpenFile} />
            ))}
          </div>
        ) : (
          <p className="flib-no-results">No designs match &ldquo;{query}&rdquo;.</p>
        )
      ) : (
        <div className="flib-install">
          <div className="flib-install-body">
            <strong>No designs added yet</strong>
            <p>Paste a Figma team or folder link to bring in your designs. Every file in it will appear here.</p>
            {onAddSource ? (
              <form className="flib-install-form" onSubmit={(e) => { e.preventDefault(); }}>
                <input
                  type="text"
                  placeholder="https://www.figma.com/files/team/123456789/Your-Team"
                  aria-label="Figma team or folder link"
                />
                <button type="submit">Add team</button>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
