import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Code2, ExternalLink, ListPlus, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { figmaApi } from '../../lib/api';

export function figmaFrameUrl(fileKey, nodeId) {
  const base = `https://www.figma.com/design/${encodeURIComponent(fileKey)}`;
  return nodeId ? `${base}?node-id=${encodeURIComponent(String(nodeId).replace(':', '-'))}` : base;
}

export default function FigmaFrameBrowser({ fileKey, highlightNodeId, onBack, onConvert, onCreateTask }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageId, setPageId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    figmaApi.getFrames(fileKey)
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.message || 'Could not load this file');
        setData(result);
        const targetIds = new Set([highlightNodeId, ...(result.selection || []).map((node) => node.id)].filter(Boolean));
        const pageWithTarget = result.pages.find((page) => page.frames.some((frame) => targetIds.has(frame.id)))
          || result.pages.find((page) => (result.selection || []).some((node) => node.pageId === page.id));
        setPageId((pageWithTarget || result.pages.find((page) => page.frames.length) || result.pages[0])?.id || null);
      })
      .catch((loadError) => active && setError(loadError.message || 'Could not load this file'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [fileKey, highlightNodeId, reloadKey]);

  const sentIds = useMemo(
    () => new Set([highlightNodeId, ...((data?.selection) || []).map((node) => node.id)].filter(Boolean)),
    [data, highlightNodeId]
  );
  const page = data?.pages.find((candidate) => candidate.id === pageId) || null;
  const frames = page
    ? [...page.frames].sort((a, b) => Number(sentIds.has(b.id)) - Number(sentIds.has(a.id)))
    : [];

  return (
    <div className="figma-browser">
      <div className="figma-browser-head">
        <button type="button" className="figma-icon-button" onClick={onBack} aria-label="Back to files">
          <ArrowLeft />
        </button>
        <div className="figma-browser-title">
          <p className="figma-eyebrow">Design file</p>
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

      {error ? <p className="figma-files-error" role="alert">{error}</p> : null}

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
                <article key={frame.id} className={`figma-frame-card ${sentIds.has(frame.id) ? 'is-sent' : ''}`}>
                  <div className="figma-frame-thumb">
                    {frame.thumbnailUrl ? (
                      // Figma CDN renders are short-lived signed URLs; next/image can't cache them.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={frame.thumbnailUrl} alt={frame.name} loading="lazy" />
                    ) : (
                      <span>{frame.width && frame.height ? `${frame.width} × ${frame.height}` : frame.type.toLowerCase()}</span>
                    )}
                    {sentIds.has(frame.id) ? <em><Sparkles /> Sent from Figma</em> : null}
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
                    <button type="button" onClick={() => onCreateTask(frame, data.file)}>
                      <ListPlus /><span>Create task</span>
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
