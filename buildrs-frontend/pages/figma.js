import { useEffect, useState } from 'react';
import Head from 'next/head';
import { ExternalLink, Figma as FigmaIcon, Loader2, Plus, RefreshCw } from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import BrandIcon from '../components/BrandIcon';
import Sidebar from '../components/Sidebar';
import useAuthStore from '../store/authStore';
import { apiFetch, figmaApi } from '../lib/api';

const STEPS = [
  { number: '01', title: 'Browse projects', description: 'Access connected Figma files in one place.' },
  { number: '02', title: 'Select sections', description: 'Choose the exact frame you want to build.' },
  { number: '03', title: 'Prepare for code', description: 'Create implementation-ready tasks.' },
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

  const loadFiles = async () => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const result = await figmaApi.listFiles();
      if (!result.success) throw new Error(result.message || 'Could not load Figma files');
      setFiles(result.files || []);
    } catch (loadError) {
      console.error('Failed to load Figma files:', loadError);
      setFilesError(loadError.message || 'Could not load Figma files');
    } finally {
      setFilesLoading(false);
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
            const filesResult = await figmaApi.listFiles();
            if (!filesResult.success) throw new Error(filesResult.message || 'Could not load Figma files');
            if (active) setFiles(filesResult.files || []);
          } catch (loadError) {
            console.error('Failed to load Figma files:', loadError);
            if (active) setFilesError(loadError.message || 'Could not load Figma files');
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
          ) : connected ? (
            <div className="figma-files-view">
              <div className="figma-files-heading">
                <div className="figma-brand-mark is-connected"><BrandIcon platform="figma" /></div>
                <div>
                  <p className="figma-eyebrow">Figma connected</p>
                  <h2>{account ? `Connected as ${account}` : 'Your Figma files'}</h2>
                  <p>Choose a design file to view it in Figma.</p>
                </div>
                <button type="button" className="figma-refresh" onClick={loadFiles} disabled={filesLoading} aria-label="Refresh Figma files">
                  {filesLoading ? <Loader2 className="figma-spin" /> : <RefreshCw />}
                  <span>Refresh</span>
                </button>
              </div>
              <form className="figma-import" onSubmit={importFile}>
                <label htmlFor="figma-file-url">Add a Figma file</label>
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
                <span className="figma-import-hint">
                  Open the file in Figma, copy the link from your browser, and paste it here.
                </span>
              </form>
              {importError && <p className="figma-files-error" role="alert">{importError}</p>}
              {filesError && <p className="figma-files-error" role="alert">{filesError}</p>}
              {filesLoading ? (
                <div className="figma-panel-loading"><Loader2 className="figma-spin" /><span>Loading your files...</span></div>
              ) : files.length ? (
                <div className="figma-file-grid">
                  {files.map((file) => (
                    <a
                      key={file.key}
                      className="figma-file-card"
                      href={`https://www.figma.com/file/${encodeURIComponent(file.key)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="figma-file-icon"><FigmaIcon /></span>
                      <span className="figma-file-name">{file.name || 'Untitled file'}</span>
                      <ExternalLink className="figma-file-external" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="figma-files-empty">
                  <p>No Figma files added yet.</p>
                  <span>Paste a Figma file link above to add it to your workspace.</span>
                </div>
              )}
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
              <span className="figma-permission-note">You’ll be asked to authorize access to your Figma files.</span>
            </div>
          )}
        </section>
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
