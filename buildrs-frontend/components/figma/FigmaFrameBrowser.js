import { useEffect, useState } from 'react';
import { ArrowLeft, Code2, ExternalLink, ListPlus, Loader2, RefreshCw } from 'lucide-react';
import { figmaApi } from '../../lib/api';
import { figmaHelper } from '../../lib/figmaHelper';

export function figmaFrameUrl(fileKey, nodeId) {
  const base = `https://www.figma.com/design/${encodeURIComponent(fileKey)}`;
  return nodeId ? `${base}?node-id=${encodeURIComponent(String(nodeId).replace(':', '-'))}` : base;
}

export default function FigmaFrameBrowser({ fileKey, highlightNodeId, preparingTask = false, onBack, onConvert, onCreateTask }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageId, setPageId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [source, setSource] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const applyResult = (result, loadedFrom) => {
      if (!active) return;
      setData(result);
      setSource(loadedFrom);
      const pageWithTarget = result.pages.find((page) => page.frames.some((frame) => frame.id === highlightNodeId))
        || result.pages.find((page) => page.frames.length)
        || result.pages[0];
      setPageId(pageWithTarget?.id || null);
    };

    // The helper reads Figma with the user's own signed-in tab, so it works
    // with no OAuth file scope. The backend is the fallback for people who
    // saved a Personal Access Token instead.
    const load = async () => {
      let helperError = null;
      // Force a check: a stale negative result from before the content script
      // loaded must not send this file to the backend-only path.
      if (await figmaHelper.available({ force: true })) {
        try {
          applyResult(await figmaHelper.getFile(fileKey), 'helper');
          return;
        } catch (error) {
          helperError = error;
        }
      }

      try {
        const result = await figmaApi.getFrames(fileKey);
        if (!result.success) throw new Error(result.message || 'Could not load this file');
        applyResult(result, 'api');
      } catch (backendError) {
        if (!active) return;
        const message = backendError.message || 'Could not load this file';
        setError(helperError ? `${message} ${helperError.message}` : message);
      }
    };

    load().finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [fileKey, highlightNodeId, reloadKey]);

  const page = data?.pages.find((candidate) => candidate.id === pageId) || null;
  const frames = page ? page.frames : [];

  return (
    <div className="figma-browser">
      <div className="figma-browser-head">
        <button type="button" className="figma-icon-button" onClick={onBack} aria-label="Back to files">
          <ArrowLeft />
        </button>
        <div className="figma-browser-title">
          <p className="figma-eyebrow">{source === 'helper' ? 'Design file · read from your Figma tab' : 'Design file'}</p>
          <h2>{data?.file?.name || 'Loading…'}</h2>
        </div>
        <a className="figma-refresh" href={figmaFrameUrl(fileKey)} target="_blank" rel="noreferrer">
          <ExternalLink /><span>Open in Figma</span>
        </a>
        <button type="button" className="figma-refresh" onClick={() => setReloadKey((key) => key + 1)} disabled={loading} aria-label="Reload frames">
          {loading ? <Loader2 className="figma-spin" /> : <RefreshCw />}
          <span>Reload</span>
        </button>
      </div>

      {error ? (
        <div className="figma-frame-error" role="alert">
          <p>{error}</p>
          {(error.toLowerCase().includes('expired') || error.toLowerCase().includes('denied') || error.toLowerCase().includes('reconnect')) && (
            <a href="/integrations" className="figma-frame-error-link">Go to integrations →</a>
          )}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="figma-panel-loading"><Loader2 className="figma-spin" /><span>Loading pages and frames…</span></div>
      ) : data ? (
        <>
          <div className="figma-page-tabs" role="tablist" aria-label="Pages">
            {data.pages.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={candidate.id === pageId}
                className={candidate.id === pageId ? 'is-active' : ''}
                onClick={() => setPageId(candidate.id)}
              >
                {candidate.name}
                <span>{candidate.frames.length}</span>
              </button>
            ))}
          </div>

          {frames.length ? (
            <div className="figma-frame-grid">
              {frames.map((frame) => (
                <article key={frame.id} className={`figma-frame-card ${frame.id === highlightNodeId ? 'is-highlighted' : ''}`}>
                  <div className="figma-frame-thumb">
                    {frame.thumbnailUrl ? (
                      // Figma CDN renders are short-lived signed URLs; next/image can't cache them.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={frame.thumbnailUrl} alt={frame.name} loading="lazy" />
                    ) : (
                      <span>{frame.width && frame.height ? `${frame.width} × ${frame.height}` : frame.type.toLowerCase()}</span>
                    )}
                  </div>
                  <div className="figma-frame-body">
                    <strong title={frame.name}>{frame.name}</strong>
                    <small>
                      {frame.type.toLowerCase()}
                      {frame.width && frame.height ? ` · ${frame.width}×${frame.height}` : ''}
                      {' · '}
                      <code>{frame.id}</code>
                    </small>
                  </div>
                  <div className="figma-frame-actions">
                    <button type="button" onClick={() => onConvert(frame, data.file)}>
                      <Code2 /><span>Convert to code</span>
                    </button>
                    <button type="button" onClick={() => onCreateTask(frame, data.file)} disabled={preparingTask}>
                      {preparingTask ? <Loader2 className="figma-spin" /> : <ListPlus />}
                      <span>{preparingTask ? 'Preparing…' : 'Create task'}</span>
                    </button>
                    <a href={figmaFrameUrl(fileKey, frame.id)} target="_blank" rel="noreferrer" aria-label={`Open ${frame.name} in Figma`}>
                      <ExternalLink />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="figma-files-empty">
              <p>No frames on this page.</p>
              <span>Frames, components and sections at the top level of a page show up here.</span>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
