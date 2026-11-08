import { useMemo, useState } from 'react';
import { Figma as FigmaIcon, Loader2, RefreshCw, Search } from 'lucide-react';

const FIGMA_FILE_URL_RE = /^https?:\/\/(?:www\.)?figma\.com\/(?:file|design|board|proto|slides)\/([A-Za-z0-9]+)/i;
const FIGMA_FILE_KEY_RE = /^[A-Za-z0-9]{10,}$/;

function parseFileKey(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const match = raw.match(FIGMA_FILE_URL_RE);
    if (match) return match[1];
    if (/figma\.com/i.test(raw)) return null;
    return FIGMA_FILE_KEY_RE.test(raw) ? raw : null;
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

export default function FigmaLibrary({ files = [], loading = false, account = '', hasPat = false, onRefresh, onOpenFile }) {
  const [query, setQuery] = useState('');
  const [fileKeyInput, setFileKeyInput] = useState('');
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
        <div className="flib-empty">
          <div className="flib-install-icon">
            <FigmaIcon />
          </div>
          <div className="flib-empty-body">
            <strong>No designs found</strong>
            {hasPat ? (
              <>
                <p>
                  Your Figma account is connected but no designs have been discovered yet. Figma's API
                  doesn't let us list your files with a Personal Access Token, so you can open a file by
                  pasting its link below, or sync via the Chrome extension.
                </p>
                <div className="flib-paste-row">
                  <input
                    type="text"
                    placeholder="https://www.figma.com/design/FILE_KEY/… or just FILE_KEY"
                    value={fileKeyInput}
                    onChange={(e) => setFileKeyInput(e.target.value)}
                    className="flib-paste-input"
                  />
                  <button
                    type="button"
                    className="flib-paste-btn"
                    onClick={() => {
                      const key = parseFileKey(fileKeyInput);
                      if (key) {
                        onOpenFile(key);
                      }
                    }}
                    disabled={!fileKeyInput.trim()}
                  >
                    Open
                  </button>
                </div>
                <p className="flib-paste-hint">
                  File key is the string after <code>/design/</code> in your Figma file URL. Or install the
                  <b>Buildrs Figma Helper</b> Chrome extension to sync your recent files automatically.
                </p>
                <button type="button" onClick={onRefresh} className="flib-refresh-link">
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </>
            ) : (
              <>
                <p>
                  Install the <b>Buildrs Figma Helper</b> Chrome extension. It reads your Figma recent files
                  via your signed-in figma.com tab and syncs here — no links to paste, no OAuth scopes.
                </p>
                <ol className="flib-install-steps">
                  <li>Install the Buildrs Figma Helper from the Chrome Web Store (or load the figma-helper folder unpacked).</li>
                  <li>Open Buildrs, sign in, then visit this Figma page once to link your account.</li>
                  <li>Keep a signed-in <code>figma.com</code> tab open.</li>
                  <li>Click the Buildrs Figma Helper icon &rarr; <em>Sync now</em>. Your designs appear here.</li>
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
