import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Figma as FigmaIcon, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import BrandIcon from '../components/BrandIcon';
import Sidebar from '../components/Sidebar';
import FigmaFrameBrowser from '../components/figma/FigmaFrameBrowser';
import FigmaCodePanel from '../components/figma/FigmaCodePanel';
import FigmaPluginCard from '../components/figma/FigmaPluginCard';
import FigmaLibrary from '../components/figma/FigmaLibrary';
import useAuthStore from '../store/authStore';
import { apiFetch, figmaApi } from '../lib/api';

const STEPS = [
  { number: '01', title: 'Send designs', description: 'Use the Buildrs Figma plugin or a file link.' },
  { number: '02', title: 'Pick frames', description: 'Browse pages and choose the exact frame to build.' },
  { number: '03', title: 'Code it exactly', description: 'Convert to code or hand it to an AI task.' },
];

export default function FigmaPage() {
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState('');
  const [files, setFiles] = useState([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [filesError, setFilesError] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [library, setLibrary] = useState(null);
  const router = useRouter();
  const [openFileKey, setOpenFileKey] = useState(null);
  const [highlightNodeId, setHighlightNodeId] = useState(null);
  const [codeFrame, setCodeFrame] = useState(null);

  // Deep link from the Figma plugin: /figma?file=<key>&node=<id>
  useEffect(() => {
    if (!router.isReady) return;
    const file = typeof router.query.file === 'string' ? router.query.file : null;
    const node = typeof router.query.node === 'string' ? router.query.node : null;
    if (file) {
      setOpenFileKey(file);
      setHighlightNodeId(node);
    }
    if (router.query.error === 'connect') {
      setError('Figma connection failed. Make sure the Buildrs Figma app allows every requested permission, then try again.');
    }
  }, [router.isReady, router.query.file, router.query.node, router.query.error]);

  const openFile = (fileKey, nodeId = null) => {
    setOpenFileKey(fileKey);
    setHighlightNodeId(nodeId);
    router.replace({ pathname: '/figma', query: nodeId ? { file: fileKey, node: nodeId } : { file: fileKey } }, undefined, { shallow: true });
  };

  const closeFile = () => {
    setOpenFileKey(null);
    setHighlightNodeId(null);
    router.replace('/figma', undefined, { shallow: true });
    loadFiles();
  };

  const createTaskFromFrame = (frame, file) => {
    router.push({
      pathname: '/tasks',
      query: {
        newTask: '1',
        figmaFileKey: file.key,
        figmaFileName: file.name || '',
        figmaNodeId: frame.id,
        figmaNodeName: frame.name || '',
      },
    });
  };

  const removeFile = async (event, fileKey) => {
    event.stopPropagation();
    try {
      const result = await figmaApi.removeFile(fileKey);
      setFiles(result.files || []);
    } catch (removeError) {
      setFilesError(removeError.message || 'Could not remove that file');
    }
  };

  // Library = linked teams/folders (full folder trees) + individually added files.
  const loadFiles = async ({ refresh = false } = {}) => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const result = await figmaApi.getLibrary({ refresh });
      if (!result.success) throw new Error(result.message || 'Could not load your Figma designs');
      setLibrary(result);
      setFiles(result.linkedFiles || []);
    } catch (loadError) {
      console.error('Failed to load Figma library:', loadError);
      setFilesError(loadError.message || 'Could not load your Figma designs');
    } finally {
      setFilesLoading(false);
    }
  };

  const addLibrarySource = async (url) => {
    const result = await figmaApi.addLibrarySource(url);
    if (!result.success) throw new Error(result.message || 'Could not add that team');
    await loadFiles();
  };

  const removeLibrarySource = async (type, id) => {
    try {
      await figmaApi.removeLibrarySource(type, id);
      setLibrary((current) => current && {
        ...current,
        sources: current.sources.filter((source) => !(source.type === type && source.id === id)),
      });
    } catch (removeError) {
      setFilesError(removeError.message || 'Could not remove that team');
    }
  };

  const importFile = async (event) => {
    event.preventDefault();
    const url = fileUrl.trim();
    if (!url) return;

    setImporting(true);
    setImportError('');
    try {
      const result = await figmaApi.addFile(url);
      if (!result.success) throw new Error(result.message || 'Could not add that Figma file');
      setFiles(result.files || (result.file ? [result.file] : []));
      setFilesError('');
      setFileUrl('');
    } catch (importFailure) {
      console.error('Failed to add Figma file:', importFailure);
      setImportError(importFailure.message || 'Could not add that Figma file');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      setStatusLoading(true);
      setError('');
      try {
        const result = await figmaApi.getStatus();
        if (!result.success) throw new Error(result.message || 'Could not check your Figma connection');
        if (!active) return;
        setConnected(Boolean(result.connected));
        setAccount(result.account || '');
        if (result.connected) {
          setFilesLoading(true);
          try {
            const libraryResult = await figmaApi.getLibrary();
            if (!libraryResult.success) throw new Error(libraryResult.message || 'Could not load your Figma designs');
            if (active) {
              setLibrary(libraryResult);
              setFiles(libraryResult.linkedFiles || []);
            }
          } catch (loadError) {
            console.error('Failed to load Figma library:', loadError);
            if (active) setFilesError(loadError.message || 'Could not load your Figma designs');
          } finally {
            if (active) setFilesLoading(false);
          }
        }
      } catch (statusError) {
        console.error('Failed to check Figma connection:', statusError);
        if (active) setError(statusError.message || 'Could not check your Figma connection');
      } finally {
        if (active) setStatusLoading(false);
      }
    };

    loadStatus();
    return () => { active = false; };
  }, []);

  const connectFigma = async () => {
    setConnecting(true);
    setError('');
    try {
      const result = await apiFetch('/api/integrations/figma/auth');
      if (!result.success) throw new Error(result.message || 'Could not start Figma connection');
      const authUrl = result.authUrl || result.url;
      if (!authUrl) throw new Error('Figma did not provide an authorization link');
      window.location.href = authUrl;
    } catch (connectError) {
      console.error('Failed to start Figma connection:', connectError);
      setError(connectError.message || 'Could not start Figma connection');
      setConnecting(false);
    }
  };

  const content = (
    <div className="workspace-container">
      <Sidebar user={user} subscription={subscription} />
      <main className="workspace-main figma-page">
        <div className="figma-page-heading">
          <div>
            <p className="figma-eyebrow">Build / Figma</p>
            <h1>Figma Integration</h1>
            <p className="figma-subtitle">Browse your Figma files and bring designs into the workflow</p>
          </div>
          {connected ? (
            <span className="figma-connected-pill"><span /> Connected</span>
          ) : (
            <button type="button" className="figma-connect-top" onClick={connectFigma} disabled={connecting || statusLoading}>
              {connecting ? <Loader2 className="figma-spin" /> : null}
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>

        {error && (
          <div className="figma-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <section className={`figma-panel ${connected ? 'is-connected' : ''}`} aria-live="polite">
          {statusLoading ? (
            <div className="figma-panel-loading"><Loader2 className="figma-spin" /><span>Checking Figma connection...</span></div>
          ) : connecting ? (
            <div className="figma-connecting-state">
              <div className="figma-brand-mark">
                <BrandIcon platform="figma" />
                <span />
              </div>
              <p className="figma-eyebrow">Connecting securely</p>
              <h2>Connecting to Figma...</h2>
              <p className="figma-connecting-description">Authorizing your Figma account and loading available projects.</p>
              <div className="figma-progress-track" role="progressbar" aria-label="Connecting to Figma" aria-valuetext="Connecting securely">
                <span />
              </div>
            </div>
          ) : connected && openFileKey ? (
            <FigmaFrameBrowser
              fileKey={openFileKey}
              highlightNodeId={highlightNodeId}
              onBack={closeFile}
              onConvert={(frame) => setCodeFrame(frame)}
              onCreateTask={createTaskFromFrame}
            />
          ) : connected ? (
            <div className="figma-files-view">
              <div className="figma-files-heading">
                <div className="figma-brand-mark is-connected"><BrandIcon platform="figma" /></div>
                <div>
                  <p className="figma-eyebrow">Figma connected</p>
                  <h2>{account ? `Connected as ${account}` : 'Your Figma designs'}</h2>
                  <p>Open any design to pick a frame, convert it to code, or hand it to an AI task.</p>
                </div>
              </div>
              {filesError && <p className="figma-files-error" role="alert">{filesError}</p>}

              <FigmaLibrary
                library={library}
                loading={filesLoading}
                onRefresh={() => loadFiles({ refresh: true })}
                onOpenFile={(fileKey) => openFile(fileKey)}
                onAddSource={addLibrarySource}
                onRemoveSource={removeLibrarySource}
                onReconnect={connectFigma}
              />

              {files.length ? (
                <section className="figma-lib-source" aria-labelledby="figma-added-title">
                  <header>
                    <span className="figma-file-icon"><FigmaIcon /></span>
                    <div>
                      <strong id="figma-added-title">Recently opened &amp; added files</strong>
                      <small>{files.length} file{files.length === 1 ? '' : 's'}</small>
                    </div>
                  </header>
                  <div className="figma-file-grid">
                    {files.map((file) => (
                      <div
                        key={file.key}
                        role="button"
                        tabIndex={0}
                        className="figma-file-card"
                        onClick={() => openFile(file.key, file.selection?.[0]?.id || null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openFile(file.key, file.selection?.[0]?.id || null);
                          }
                        }}
                      >
                        {file.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="figma-file-thumb" src={file.thumbnail_url} alt="" loading="lazy" />
                        ) : (
                          <span className="figma-file-icon"><FigmaIcon /></span>
                        )}
                        <span className="figma-file-name">
                          {file.name || 'Untitled file'}
                          {file.source === 'plugin' ? (
                            <small className="figma-file-badge"><Sparkles /> {file.selection?.length ? `${file.selection.length} frame${file.selection.length === 1 ? '' : 's'} sent` : 'From plugin'}</small>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="figma-file-remove"
                          onClick={(event) => removeFile(event, file.key)}
                          aria-label={`Remove ${file.name || 'file'} from Buildrs`}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <details className="figma-more">
                <summary>More ways to add designs</summary>
                <form className="figma-import" onSubmit={importFile}>
                  <label htmlFor="figma-file-url">Add a single file (e.g. from Drafts) by link</label>
                  <div className="figma-import-row">
                    <input
                      id="figma-file-url"
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      placeholder="https://www.figma.com/design/…"
                      value={fileUrl}
                      onChange={(event) => setFileUrl(event.target.value)}
                      disabled={importing}
                    />
                    <button type="submit" disabled={importing || !fileUrl.trim()}>
                      {importing ? <Loader2 className="figma-spin" /> : <Plus />}
                      <span>{importing ? 'Adding...' : 'Add file'}</span>
                    </button>
                  </div>
                  <span className="figma-import-hint">Figma doesn&apos;t let apps list personal Drafts, so add those files by link.</span>
                </form>
                {importError && <p className="figma-files-error" role="alert">{importError}</p>}
                <FigmaPluginCard />
              </details>
            </div>
          ) : (
            <div className="figma-empty-state">
              <div className="figma-brand-mark">
                <BrandIcon platform="figma" />
                <span />
              </div>
              <p className="figma-eyebrow">Figma is not connected</p>
              <h2>Connect Figma to BuildrsHQ</h2>
              <p className="figma-description">
                Connect your Figma account to browse design files, import selected frames, and<br className="figma-desktop-break" />
                prepare them for task creation and AI-assisted implementation.
              </p>
              <div className="figma-steps">
                {STEPS.map((step) => (
                  <article className="figma-step" key={step.number}>
                    <span className="figma-step-number">{step.number}</span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </article>
                ))}
              </div>
              <button type="button" className="figma-connect-main" onClick={connectFigma} disabled={connecting}>
                {connecting ? <Loader2 className="figma-spin" /> : <BrandIcon platform="figma" />}
                {connecting ? 'Connecting...' : 'Connect to Figma'}
              </button>
              <span className="figma-permission-note">You’ll be asked to let Buildrs read your Figma files and folders.</span>
            </div>
          )}
        </section>
        {codeFrame && openFileKey ? (
          <FigmaCodePanel fileKey={openFileKey} frame={codeFrame} onClose={() => setCodeFrame(null)} />
        ) : null}
      </main>
    </div>
  );

  return (
    <AuthGuard>
      <Head>
        <title>Figma - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>
      {content}
    </AuthGuard>
  );
}
