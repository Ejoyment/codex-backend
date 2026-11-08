import { useMemo, useState } from 'react';
import { Figma as FigmaIcon, Loader2, RefreshCw, Search } from 'lucide-react';

function formatSyncedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return date.toLocaleString();
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

export default function FigmaLibrary({ files = [], loading = false, helperSyncedAt = null, onRefresh, onOpenFile }) {
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const visibleFiles = useMemo(
    () => files.filter((file) => !normalizedQuery || String(file.name || '').toLowerCase().includes(normalizedQuery)),
    [files, normalizedQuery]
  );
  const hasFiles = files.length > 0;
  const syncedLabel = formatSyncedAt(helperSyncedAt);

  return (
    <section className="figma-lib" aria-labelledby="figma-lib-title">
      <div className="figma-lib-head">
        <h3 id="figma-lib-title">Your Figma designs</h3>
        {hasFiles ? (
          <label className="figma-lib-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" aria-label="Search Figma files" />
          </label>
        ) : null}
        <button type="button" className="figma-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh synced Figma files">
          {loading ? <Loader2 className="figma-spin" /> : <RefreshCw />}
          <span>Refresh</span>
        </button>
      </div>

      {hasFiles && syncedLabel ? <p className="figma-lib-synced">Synced {syncedLabel} by the Buildrs Figma helper.</p> : null}

      {loading && !hasFiles ? (
        <div className="figma-panel-loading"><Loader2 className="figma-spin" /><span>Loading your Figma designs…</span></div>
      ) : hasFiles ? (
        visibleFiles.length ? (
          <div className="figma-lib-grid">
            {visibleFiles.map((file) => <FileCard key={file.key} file={file} onOpen={onOpenFile} />)}
          </div>
        ) : (
          <p className="figma-lib-empty">No matching files.</p>
        )
      ) : (
        <div className="figma-helper-empty">
          <span className="figma-file-icon"><FigmaIcon /></span>
          <div className="figma-helper-copy">
            <strong>Bring your designs in automatically</strong>
            <p>
              Install the Buildrs Figma helper once. It reads your own Figma recent files and keeps this page in sync.
              There are no links to paste and no plugin to run inside a file.
            </p>
          </div>
          <a className="figma-primary" href="/downloads/buildrs-figma-helper.zip" download>
            Download helper
          </a>
          <ol className="figma-helper-steps">
            <li>Unzip the download and open <code>chrome://extensions</code>.</li>
            <li>Turn on <em>Developer mode</em> and choose <em>Load unpacked</em>.</li>
            <li>Select the unzipped folder, open Figma, then click the Buildrs helper icon and <em>Sync now</em>.</li>
          </ol>
        </div>
      )}
    </section>
  );
}
