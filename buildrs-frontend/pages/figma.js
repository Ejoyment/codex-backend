import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Loader2 } from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import BrandIcon from '../components/BrandIcon';
import Sidebar from '../components/Sidebar';
import FigmaFrameBrowser from '../components/figma/FigmaFrameBrowser';
import FigmaCodePanel from '../components/figma/FigmaCodePanel';
import FigmaLibrary from '../components/figma/FigmaLibrary';
import useAuthStore from '../store/authStore';
import { apiFetch, figmaApi } from '../lib/api';
import { figmaHelper } from '../lib/figmaHelper';

const STEPS = [
  { number: '01', title: 'Connect Figma', description: 'Authorize Buildrs to read your designs.' },
  { number: '02', title: 'Install the Buildrs Figma Helper', description: 'Add the Chrome extension. It reads your Figma recent files via your own signed-in figma.com tab — no links to paste.' },
  { number: '03', title: 'Pick a frame', description: 'Open a design, select frames, and hand them to an AI task.' },
];

export default function FigmaPage() {
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState('');
  const [hasPat, setHasPat] = useState(false);
  const [files, setFiles] = useState([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [filesError, setFilesError] = useState('');
  const router = useRouter();
  const [openFileKey, setOpenFileKey] = useState(null);
  const [highlightNodeId, setHighlightNodeId] = useState(null);
  const [codeFrame, setCodeFrame] = useState(null);
  const [helperReady, setHelperReady] = useState(false);
  const [preparingTask, setPreparingTask] = useState(false);

  // The helper is the primary reader: it uses the user's own figma.com
  // session, so designs, frames and codegen work without OAuth scopes.
  useEffect(() => {
    let active = true;
    figmaHelper.available().then((ready) => { if (active) setHelperReady(ready); });
    return () => { active = false; };
  }, []);

  // Deep link: /figma?file=<key>&node=<id>
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

  const loadFiles = useCallback(async ({ refresh = false } = {}) => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const result = await figmaApi.getLibrary({ refresh });
      if (!result.success) throw new Error(result.message || 'Could not load your Figma designs');
      setFiles(Array.isArray(result.files) ? result.files : []);
    } catch (loadError) {
      console.error('Failed to load Figma library:', loadError);
      setFilesError(loadError.message || 'Could not load your Figma designs');
    } finally {
      setFilesLoading(false);
    }
  }, []);

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
        setHasPat(Boolean(result.hasPat));
        if (result.connected) await loadFiles();
      } catch (statusError) {
        console.error('Failed to check Figma connection:', statusError);
        if (active) setError(statusError.message || 'Could not check your Figma connection');
      } finally {
        if (active) setStatusLoading(false);
      }
    };

    loadStatus();
    return () => { active = false; };
  }, [loadFiles]);

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

  // Save the frame before leaving for the task form so the agent can implement
  // it later even though the browser (and its Figma session) is gone by then.
  const createTaskFromFrame = async (frame, file) => {
    setPreparingTask(true);
    try {
      if (await figmaHelper.available()) {
        const frameData = await figmaHelper.getNode(file.key, frame.id);
        if (frameData?.node) {
          await figmaApi.saveSnapshot({
            fileKey: file.key,
            nodeId: frame.id,
            nodeName: frameData.node.name || frame.name,
            fileName: frameData.fileName || file.name,
            node: frameData.node,
          });
        }
      }
    } catch (error) {
      console.warn('Could not save this frame for the agent:', error.message);
    } finally {
      setPreparingTask(false);
    }

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

  const refreshFiles = async () => {
    // Re-check on demand so installing/reloading the helper doesn't require a
    // full page refresh.
    const ready = helperReady || await figmaHelper.available({ force: true });
    if (ready !== helperReady) setHelperReady(ready);

    let syncError = null;
    if (ready) {
      setFilesLoading(true);
      try {
        await figmaHelper.sync();
      } catch (error) {
        syncError = error.message || 'Figma sync failed.';
        console.warn('Helper sync failed:', error.message);
      }
    }

    await loadFiles({ refresh: true });
    if (syncError) setFilesError(syncError);
  };

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
              preparingTask={preparingTask}
              onBack={closeFile}
              onConvert={(frame) => setCodeFrame(frame)}
              onCreateTask={createTaskFromFrame}
            />
          ) : connected ? (
            <div className="figma-files-view">
              {filesError && <p className="figma-files-error" role="alert">{filesError}</p>}
              <FigmaLibrary
                files={files}
                loading={filesLoading}
                account={account}
                hasPat={hasPat}
                helperReady={helperReady}
                onRefresh={refreshFiles}
                onOpenFile={(fileKey) => openFile(fileKey)}
              />
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
              <span className="figma-permission-note">You’ll be asked to let Buildrs read your Figma files.</span>
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
