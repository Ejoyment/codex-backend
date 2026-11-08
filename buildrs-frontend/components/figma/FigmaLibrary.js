import { useMemo, useState } from 'react';
import { CheckCircle2, Figma as FigmaIcon, Loader2, RefreshCw, Search } from 'lucide-react';

function formatSyncedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return date.toLocaleDateString();
}

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
          // Figma thumbnails are short-lived signed URLs; next/image can't cache them.
          // eslint-disable-next-line @next/next/no-img-element
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
  helperSyncedAt = null,
  account = '',
  onRefresh,
  onOpenFile,
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const visible = useMemo(
    () => files.filter((f) => !q || (f.name || '').toLowerCase().includes(q)),
    [files, q],
  );

  const syncedLabel = formatSyncedAt(helperSyncedAt);

  return (
    <section className="flib">
      {/* ── Top bar ── */}
      <div className="flib-topbar">
        <div className="flib-topbar-left">
          <span className="flib-status-dot" />
          <span className="flib-account">{account || 'Figma connected'}</span>
          {syncedLabel && (
            <span className="flib-synced">
              <CheckCircle2 />synced {syncedLabel}
            </span>
          )}
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

      {/* ── Heading ── */}
      <div className="flib-heading">
        <h2>Your Figma designs</h2>
        <p>Click any design to browse its frames, convert to code, or assign to an agent.</p>
      </div>

      {/* ── Content ── */}
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
        /* ── Install helper empty state ── */
        <div className="flib-install">
          <div className="flib-install-icon">
            <FigmaIcon />
          </div>
          <div className="flib-install-body">
            <strong>No designs synced yet</strong>
            <p>
              Install the <b>Buildrs Figma Helper</b> from the Chrome Web Store.
              It reads your Figma recent files automatically — no links to paste, no plugin to open.
            </p>
            <div className="flib-install-actions">
              <a
                className="flib-install-cta"
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noreferrer"
              >
                Get it on Chrome Web Store
              </a>
              <a
                className="flib-install-alt"
                href="/downloads/buildrs-figma-helper.zip"
                download
              >
                Download zip (manual install)
              </a>
            </div>
            <ol className="flib-install-steps">
              <li>Install the extension and sign in to Buildrs in your browser.</li>
              <li>Keep a signed-in <code>figma.com</code> tab open.</li>
              <li>Click the Buildrs helper icon → <em>Sync now</em>. Designs appear here instantly.</li>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
