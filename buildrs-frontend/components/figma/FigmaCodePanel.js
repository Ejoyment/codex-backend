import { useState } from 'react';
import { Check, Code2, Copy, Loader2, X } from 'lucide-react';
import { figmaApi } from '../../lib/api';
import { figmaHelper } from '../../lib/figmaHelper';

const TARGETS = [
  { value: 'react', label: 'React' },
  { value: 'tailwind', label: 'React + Tailwind' },
  { value: 'html', label: 'HTML + CSS' },
];

export default function FigmaCodePanel({ fileKey, frame, onClose }) {
  const [target, setTarget] = useState('react');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [activeFile, setActiveFile] = useState(0);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      // Read the frame through the helper first: it uses the user's own Figma
      // session, so codegen doesn't depend on an OAuth file scope. The backend
      // stores this node as a snapshot before generating. If the helper isn't
      // there, the backend falls back to the saved PAT/token.
      let design = null;
      try {
        if (await figmaHelper.available()) {
          const frameData = await figmaHelper.getNode(fileKey, frame.id);
          if (frameData?.node) {
            design = {
              node: frameData.node,
              nodeName: frameData.node.name || frame.name,
              fileName: frameData.fileName || null,
            };
          }
        }
      } catch (helperError) {
        console.warn('Could not read this frame with the helper:', helperError.message);
      }

      const data = await figmaApi.generateCode({
        fileKey,
        nodeId: frame.id,
        target,
        prompt,
        node: design?.node,
        nodeName: design?.nodeName,
        fileName: design?.fileName,
      });
      if (!data.success) throw new Error(data.message || 'Code generation failed');
      setResult(data);
      setActiveFile(0);
    } catch (generateError) {
      setError(generateError.message || 'Code generation failed');
    } finally {
      setLoading(false);
    }
  };

  const files = result?.files || [];
  const current = files[activeFile];

  const copy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy failed. Select the code and copy it manually.');
    }
  };

  return (
    <div className="figma-overlay" role="dialog" aria-modal="true" aria-labelledby="figma-code-title">
      <div className="figma-code-panel">
        <header>
          <div>
            <p className="figma-eyebrow">Convert to code</p>
            <h2 id="figma-code-title">{frame.name}</h2>
          </div>
          <button type="button" className="figma-icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>

        <div className="figma-code-controls">
          <label>
            <span>Output</span>
            <select value={target} onChange={(event) => setTarget(event.target.value)} disabled={loading}>
              {TARGETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="is-wide">
            <span>Extra instructions (optional)</span>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. make the hero responsive, use our Button component"
              disabled={loading}
            />
          </label>
          <button type="button" className="figma-primary" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="figma-spin" /> : <Code2 />}
            <span>{loading ? 'Generating…' : result ? 'Regenerate' : 'Generate code'}</span>
          </button>
        </div>

        {error ? <p className="figma-files-error" role="alert">{error}</p> : null}

        {loading ? (
          <div className="figma-panel-loading"><Loader2 className="figma-spin" /><span>Reading the frame and writing code…</span></div>
        ) : files.length ? (
          <div className="figma-code-output">
            <div className="figma-code-tabs" role="tablist">
              {files.map((file, index) => (
                <button
                  key={file.path || index}
                  type="button"
                  role="tab"
                  aria-selected={index === activeFile}
                  className={index === activeFile ? 'is-active' : ''}
                  onClick={() => setActiveFile(index)}
                >
                  {file.name || file.path}
                </button>
              ))}
              <button type="button" className="figma-code-copy" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre><code>{current?.content || ''}</code></pre>
          </div>
        ) : !error ? (
          <p className="figma-code-hint">Buildrs reads this frame&apos;s exact layout, colors, typography and text from Figma and generates matching code.</p>
        ) : null}
      </div>
    </div>
  );
}
