import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles } from 'lucide-react';

const screens = [
  { id: 'overview', label: 'Overview', route: '/dashboard?tour=1', duration: 8000 },
  { id: 'projects', label: 'Projects', route: '/projects?tour=1', duration: 9000 },
  { id: 'tasks', label: 'Tasks', route: '/tasks?tour=1', duration: 9000 },
  { id: 'integrations', label: 'Integrations', route: '/integrations?tour=1', duration: 8000 },
  { id: 'editor', label: 'Editor', route: '/editor?tour=1', duration: 9000 },
  { id: 'figma', label: 'Figma', route: '/settings?tab=integrations&tour=1', duration: 8000 },
  { id: 'agent', label: 'AI Agent', route: '/ai-pair?tour=1', duration: 9000 },
  { id: 'specs', label: 'Specs', route: '/specs?tour=1', duration: 8000 },
  { id: 'mcp', label: 'MCP Server', route: '/mcp?tour=1', duration: 8000 },
  { id: 'debug', label: 'Debug Room', route: '/debug-room?tour=1', duration: 8000 },
  { id: 'team', label: 'Team', route: '/teams?tour=1', duration: 8000 },
  { id: 'memory', label: 'Team Memory', route: '/team-memory?tour=1', duration: 8000 },
  { id: 'git', label: 'Git & PRs', route: '/source-code?tour=1', duration: 8000 },
  { id: 'deploy', label: 'Deploy', route: '/deploy?tour=1', duration: 8000 },
  { id: 'billing', label: 'Billing & Plans', route: '/settings?tab=billing&tour=1', duration: 8000 },
  { id: 'audit', label: 'Audit Report', route: '/audit?tour=1', duration: 8000 },
  { id: 'support', label: 'Support Center', route: '/support?tour=1', duration: 8000 },
  { id: 'settings', label: 'Settings', route: '/settings?tab=profile&tour=1', duration: 8000 },
];

const labelsToScreenId = {
  Overview: 'overview',
  Projects: 'projects',
  Tasks: 'tasks',
  Editor: 'editor',
  Figma: 'figma',
  'AI Agent': 'agent',
  Specs: 'specs',
  'MCP Server': 'mcp',
  'Debug Room': 'debug',
  Team: 'team',
  'Team Memory': 'memory',
  'Git & PRs': 'git',
  Deploy: 'deploy',
  'Billing & Plans': 'billing',
  'Audit Report': 'audit',
  'Support Center': 'support',
  Settings: 'settings',
};

function screenForLocation(location) {
  if (location.pathname === '/settings') {
    const tab = new URLSearchParams(location.search).get('tab');
    return tab === 'billing' ? 'billing' : tab === 'integrations' ? 'figma' : 'settings';
  }
  const route = location.pathname.replace(/\/$/, '') || '/dashboard';
  return screens.find((screen) => screen.route.split('?')[0] === route)?.id;
}

export default function WorkflowDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const frameRef = useRef(null);
  const frameListenersCleanupRef = useRef(null);
  const elapsedRef = useRef(0);
  const activeScreen = screens[activeIndex];
  const progress = ((activeIndex + elapsed / activeScreen.duration) / screens.length) * 100;

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!isMounted || paused) return undefined;
    const intervalId = window.setInterval(() => {
      const nextElapsed = elapsedRef.current + 100;
      if (nextElapsed >= screens[activeIndex].duration) {
        elapsedRef.current = 0;
        setElapsed(0);
        setActiveIndex((index) => (index + 1) % screens.length);
        return;
      }
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
    }, 100);
    return () => window.clearInterval(intervalId);
  }, [activeIndex, isMounted, paused]);

  const visit = useCallback((index) => {
    elapsedRef.current = 0;
    setElapsed(0);
    setActiveIndex((index + screens.length) % screens.length);
  }, []);

  const handleFrameLoad = useCallback(() => {
    frameListenersCleanupRef.current?.();
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    const frameWindow = frame?.contentWindow;
    if (!frameDocument || !frameWindow) return;

    try {
      const currentScreen = screenForLocation(frameWindow.location);
      const currentIndex = screens.findIndex((screen) => screen.id === currentScreen);
      if (currentIndex >= 0 && currentIndex !== activeIndex) visit(currentIndex);
    } catch (error) {
      console.error('Could not initialize the local product tour frame:', error);
    }

    const pauseOnInteraction = () => setPaused(true);
    const resumeAfterPointerLeaves = () => {
      if (!frameDocument.activeElement || frameDocument.activeElement === frameDocument.body) {
        setPaused(false);
      }
    };
    const navigateFromSidebar = (event) => {
      const target = event.target;
      const anchor = target instanceof frameWindow.Element ? target.closest('a.sidebar-nav-item') : null;
      if (!anchor) return;
      const label = anchor.textContent.trim();
      const screenId = labelsToScreenId[label];
      if (!screenId) return;
      const targetIndex = screens.findIndex((screen) => screen.id === screenId);
      if (targetIndex < 0) return;
      event.preventDefault();
      event.stopPropagation();
      visit(targetIndex);
    };

    frameDocument.addEventListener('pointermove', pauseOnInteraction, { passive: true });
    frameDocument.addEventListener('focusin', pauseOnInteraction);
    frameDocument.addEventListener('pointerleave', resumeAfterPointerLeaves);
    frameDocument.addEventListener('click', navigateFromSidebar, true);
    frameListenersCleanupRef.current = () => {
      frameDocument.removeEventListener('pointermove', pauseOnInteraction);
      frameDocument.removeEventListener('focusin', pauseOnInteraction);
      frameDocument.removeEventListener('pointerleave', resumeAfterPointerLeaves);
      frameDocument.removeEventListener('click', navigateFromSidebar, true);
    };
  }, [activeIndex, visit]);

  useEffect(() => () => frameListenersCleanupRef.current?.(), []);

  return (
    <section
      className={`pdemo ${paused ? 'is-paused' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Interactive Buildrs product walkthrough"
    >
      <header className="pdemo-tour-toolbar">
        <div className="pdemo-tour-title">
          <span className="pdemo-tour-spark"><Sparkles size={16} /></span>
          <span>
            <strong>Product walkthrough</strong>
            <small>{activeScreen.label} · {activeIndex + 1} of {screens.length}</small>
          </span>
        </div>
        <label className="pdemo-tour-select-label">
          <span>Jump to</span>
          <select value={activeScreen.id} onChange={(event) => visit(screens.findIndex((screen) => screen.id === event.target.value))} aria-label="Jump to walkthrough screen">
            {screens.map((screen) => <option key={screen.id} value={screen.id}>{screen.label}</option>)}
          </select>
        </label>
        <div className="pdemo-tour-controls">
          <button type="button" onClick={() => visit(activeIndex - 1)} aria-label="Previous walkthrough screen"><ArrowLeft size={16} /></button>
          <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume walkthrough' : 'Pause walkthrough'}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button type="button" onClick={() => visit(activeIndex + 1)} aria-label="Next walkthrough screen"><ArrowRight size={16} /></button>
        </div>
      </header>
      <div className="pdemo-production-frame">
        {isMounted && (
          <iframe
            ref={frameRef}
            key={activeScreen.id}
            src={activeScreen.route}
            name="buildrs-product-tour"
            title={`BuildrsHQ ${activeScreen.label} production screen`}
            onLoad={handleFrameLoad}
            loading="eager"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
      <div className="pdemo-tour-progress" role="progressbar" aria-label="Walkthrough progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <footer className="pdemo-tour-footer">
        <span><Sparkles size={14} /> Interact with the real workspace screens. The walkthrough pauses while you explore.</span>
        <span>{activeIndex + 1} / {screens.length}</span>
      </footer>
    </section>
  );
}
