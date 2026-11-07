import { useEffect, useState } from 'react';
import { Check, Copy, Download, ExternalLink, KeyRound, Loader2, Puzzle, Trash2 } from 'lucide-react';
import { figmaApi } from '../../lib/api';

const PLUGIN_ZIP = '/downloads/buildrs-figma-plugin.zip';
// Figma Community listing, e.g. https://www.figma.com/community/plugin/<id>/send-to-buildrs
const COMMUNITY_URL = process.env.NEXT_PUBLIC_FIGMA_PLUGIN_URL || '';

export default function FigmaPluginCard() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    figmaApi.getPluginStatus()
      .then((result) => setStatus(result))
      .catch(() => setStatus({ paired: false }));
  }, []);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await figmaApi.createPluginToken();
      setToken(result.token);
      setStatus((prev) => ({ ...(prev || {}), paired: true, createdAt: new Date().toISOString() }));
    } catch (generateError) {
      setError(generateError.message || 'Could not create a plugin token');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError('');
    try {
      await figmaApi.revokePluginToken();
      setToken('');
      setStatus((prev) => ({ ...(prev || {}), paired: false }));
    } catch (revokeError) {
      setError(revokeError.message || 'Could not revoke the plugin token');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy failed. Select the token and copy it manually.');
    }
  };

  return (
    <section className="figma-plugin-card" aria-labelledby="figma-plugin-title">
      <div className="figma-plugin-head">
        <span className="figma-file-icon"><Puzzle /></span>
        <div>
          <h3 id="figma-plugin-title">Figma plugin</h3>
          <p>Run <b>Send to Buildrs</b> inside Figma. The open file and the frames you select show up here automatically.</p>
        </div>
      </div>

      <ol className="figma-plugin-steps">
        {COMMUNITY_URL ? (
          <li>
            <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" className="figma-plugin-link"><ExternalLink /> Install from Figma Community</a>
            {' '}and open it in any file from <b>Plugins → Send to Buildrs</b>.
          </li>
        ) : (
          <li>
            <a href={PLUGIN_ZIP} download className="figma-plugin-link"><Download /> Download the plugin</a>
            , unzip it, then in Figma desktop choose <b>Plugins → Development → Import plugin from manifest</b>.
          </li>
        )}
        <li>Generate a token below and paste it into the plugin once.</li>
        <li>Select frames in Figma and click <b>Send to Buildrs</b>.</li>
      </ol>

      {token ? (
        <div className="figma-plugin-token">
          <code>{token}</code>
          <button type="button" onClick={copy} aria-label="Copy plugin token">
            {copied ? <Check /> : <Copy />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <small>This token is shown once. Generating a new one disconnects the old one.</small>
        </div>
      ) : null}

      <div className="figma-plugin-actions">
        <button type="button" onClick={generate} disabled={busy || status === null}>
          {busy ? <Loader2 className="figma-spin" /> : <KeyRound />}
          <span>{status?.paired ? 'Generate new token' : 'Generate token'}</span>
        </button>
        {status?.paired ? (
          <button type="button" className="is-secondary" onClick={revoke} disabled={busy}>
            <Trash2 />
            <span>Disconnect plugin</span>
          </button>
        ) : null}
      </div>
      {status?.lastPushAt ? (
        <p className="figma-plugin-meta">Last sent from Figma {new Date(status.lastPushAt).toLocaleString()}</p>
      ) : null}
      {error ? <p className="figma-files-error" role="alert">{error}</p> : null}
    </section>
  );
}
