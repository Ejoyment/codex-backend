import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, X } from 'lucide-react';
import { figmaApi } from '../../lib/api';

export const EMPTY_FIGMA_LINK = { fileKey: '', fileName: '', nodeId: '', nodeName: '' };

// Choose a Figma file from the user's library and one of its frames.
// `value` / `onChange` use { fileKey, fileName, nodeId, nodeName }.
export default function FigmaFramePicker({ value = EMPTY_FIGMA_LINK, onChange, disabled = false, className = '' }) {
  const [files, setFiles] = useState(null);
  const [connected, setConnected] = useState(true);
  const [pages, setPages] = useState([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    figmaApi.listFiles()
      .then((result) => {
        if (!active) return;
        setConnected(result.connected !== false);
        setFiles(result.files || []);
      })
      .catch(() => active && setFiles([]));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!value.fileKey) {
      setPages([]);
      return undefined;
    }
    let active = true;
    setFramesLoading(true);
    setError('');
    figmaApi.getFrames(value.fileKey, { thumbnails: false })
      .then((result) => active && setPages(result.pages || []))
      .catch((loadError) => active && setError(loadError.message || 'Could not load frames'))
      .finally(() => active && setFramesLoading(false));
    return () => { active = false; };
  }, [value.fileKey]);

  const selectFile = (fileKey) => {
    const file = (files || []).find((candidate) => candidate.key === fileKey);
    onChange(fileKey ? { fileKey, fileName: file?.name || '', nodeId: '', nodeName: '' } : EMPTY_FIGMA_LINK);
  };

  const selectFrame = (nodeId) => {
    const frame = pages.flatMap((page) => page.frames).find((candidate) => candidate.id === nodeId);
    onChange({ ...value, nodeId, nodeName: frame?.name || '' });
  };

  if (!connected) {
    return (
      <div className={`tsk-figma-picker ${className}`}>
        <small>Figma isn&apos;t connected. <Link href="/figma">Connect Figma</Link> to link a design.</small>
      </div>
    );
  }

  // A task saved before files were tracked may only know its file key.
  const fileOptions = [...(files || [])];
  if (value.fileKey && !fileOptions.some((file) => file.key === value.fileKey)) {
    fileOptions.unshift({ key: value.fileKey, name: value.fileName || value.fileKey });
  }
  const knownFrame = pages.some((page) => page.frames.some((frame) => frame.id === value.nodeId));

  return (
    <div className={`tsk-figma-picker ${className}`}>
      <select
        className="tsk-figma-input"
        value={value.fileKey || ''}
        onChange={(event) => selectFile(event.target.value)}
        disabled={disabled || files === null}
        aria-label="Figma file"
      >
        <option value="">{files === null ? 'Loading Figma files…' : fileOptions.length ? 'No Figma design' : 'No Figma files yet'}</option>
        {fileOptions.map((file) => <option key={file.key} value={file.key}>{file.name || file.key}</option>)}
      </select>

      {value.fileKey ? (
        <div className="tsk-figma-picker-row">
          <select
            className="tsk-figma-input"
            value={value.nodeId || ''}
            onChange={(event) => selectFrame(event.target.value)}
            disabled={disabled || framesLoading}
            aria-label="Figma frame"
          >
            <option value="">{framesLoading ? 'Loading frames…' : 'Whole file (no specific frame)'}</option>
            {value.nodeId && !knownFrame && !framesLoading ? (
              <option value={value.nodeId}>{value.nodeName || value.nodeId}</option>
            ) : null}
            {pages.filter((page) => page.frames.length).map((page) => (
              <optgroup key={page.id} label={page.name}>
                {page.frames.map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}
              </optgroup>
            ))}
          </select>
          {framesLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
          <button type="button" className="tsk-figma-clear" onClick={() => onChange(EMPTY_FIGMA_LINK)} disabled={disabled} aria-label="Remove Figma design">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : files && !files.length ? (
        <small>Send designs from Figma with the Buildrs plugin on the <Link href="/figma">Figma page</Link>.</small>
      ) : null}
      {error ? <small className="tsk-figma-error">{error}</small> : null}
    </div>
  );
}
