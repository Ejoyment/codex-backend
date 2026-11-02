import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, Bell, Bot, Box, Brain,
  Check, CheckCircle2, CheckSquare, ChevronDown, Clock3, Code2,
  CreditCard, Database, Edit3, FileCode2, FileText, FolderKanban, GitBranch,
  GitCommitHorizontal, GitPullRequest, LayoutDashboard, LifeBuoy, Link2,
  ListTodo, Loader2, Menu, MessageSquare, MoreHorizontal, Plug2, Play, Plus,
  Radio, Rocket, Search, Server, Settings, Settings2, ShieldCheck, Sparkles,
  Users, WandSparkles,
} from 'lucide-react';
import CreateProjectWizard from './CreateProjectWizard';
import CreateTaskWizard from './CreateTaskWizard';

const screens = [
  { id: 'overview', label: 'Overview', group: 'WORK', icon: LayoutDashboard, title: 'Workspace overview', duration: 6500 },
  { id: 'projects', label: 'Projects', group: 'WORK', icon: FolderKanban, title: 'Projects', duration: 8000 },
  { id: 'tasks', label: 'Tasks', group: 'WORK', icon: CheckSquare, title: 'Tasks', duration: 8000 },
  { id: 'integrations', label: 'Integrations', group: 'CONNECT', icon: Link2, title: 'Integrations', duration: 8000 },
  { id: 'editor', label: 'Editor', group: 'BUILD', icon: Edit3, title: 'Code editor', duration: 6500 },
  { id: 'figma', label: 'Figma', group: 'BUILD', icon: FileCode2, title: 'Figma context', duration: 6200 },
  { id: 'agent', label: 'AI Agent', group: 'BUILD', icon: Sparkles, title: 'Agent execution', duration: 11200 },
  { id: 'specs', label: 'Specs', group: 'BUILD', icon: FileText, title: 'Specs', duration: 6200 },
  { id: 'mcp', label: 'MCP Server', group: 'BUILD', icon: Server, title: 'MCP Server', duration: 6200 },
  { id: 'debug', label: 'Debug Room', group: 'COLLABORATE', icon: Radio, title: 'Debug Room', duration: 6200 },
  { id: 'team', label: 'Team', group: 'COLLABORATE', icon: Users, title: 'Team', duration: 6200 },
  { id: 'memory', label: 'Team Memory', group: 'COLLABORATE', icon: Brain, title: 'Team Memory', duration: 6200 },
  { id: 'git', label: 'Git & PRs', group: 'SHIP', icon: Database, title: 'Git & pull requests', duration: 6200 },
  { id: 'deploy', label: 'Deploy', group: 'SHIP', icon: Rocket, title: 'Deployments', duration: 6500 },
  { id: 'billing', label: 'Billing & Plans', group: 'MANAGE', icon: Plug2, title: 'Billing & plans', duration: 6200 },
  { id: 'audit', label: 'Audit Report', group: 'MANAGE', icon: ShieldCheck, title: 'Audit report', duration: 6200 },
  { id: 'support', label: 'Support Admin', group: 'MANAGE', icon: LifeBuoy, title: 'Support admin', duration: 6200 },
  { id: 'settings', label: 'Settings', group: 'MANAGE', icon: Settings, title: 'Workspace settings', duration: 6200 },
];

const workspaceNavigation = [
  { label: 'WORK', items: [{ id: 'overview', icon: LayoutDashboard }, { id: 'projects', icon: FolderKanban }, { id: 'tasks', icon: CheckSquare }] },
  { label: 'BUILD', items: [{ id: 'editor', icon: Edit3 }, { id: 'figma', icon: FileCode2 }, { id: 'agent', icon: Sparkles }, { id: 'specs', icon: FileText }, { id: 'mcp', icon: Server }] },
  { label: 'COLLABORATE', items: [{ id: 'debug', icon: Radio }, { id: 'team', icon: Users }, { id: 'memory', icon: Brain }] },
  { label: 'SHIP', items: [{ id: 'git', icon: Database }, { id: 'deploy', icon: Rocket }] },
  { label: 'MANAGE', items: [{ id: 'billing', icon: Plug2 }, { id: 'audit', icon: ShieldCheck }, { id: 'support', icon: LifeBuoy }, { id: 'settings', icon: Settings }] },
];

const sampleCode = [
  'export function ProjectCard({ project }) {',
  '  const progress = project.completed / project.total;',
  '',
  '  return (',
  '    <article className="project-card">',
  '      <ProjectStatus status={project.status} />',
  '      <Progress value={progress * 100} />',
  '    </article>',
  '  );',
  '}',
];

const codeDiff = [
  { kind: 'context', text: ' export function ProjectCard({ project }) {' },
  { kind: 'remove', text: '-  const progress = project.completed / project.total;' },
  { kind: 'add', text: '+  const progress = project.total ? project.completed / project.total : 0;' },
  { kind: 'context', text: ' ' },
  { kind: 'context', text: '   return (' },
  { kind: 'context', text: '     <article className="project-card">' },
  { kind: 'add', text: '+      <ProjectStatus status={project.status} />' },
  { kind: 'context', text: '       <Progress value={progress * 100} />' },
  { kind: 'context', text: '     </article>' },
  { kind: 'context', text: '   );' },
  { kind: 'context', text: ' }' },
];

function SmallButton({ children, primary = false, onClick, buttonRef, className = '' }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`pdemo-button ${primary ? 'is-primary' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ScreenHeading({ eyebrow, title, detail, action }) {
  return (
    <div className="pdemo-heading">
      <div>
        <div className="pdemo-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export default function WorkflowDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [projectCreated, setProjectCreated] = useState(false);
  const [createdProject, setCreatedProject] = useState(null);
  const [taskCreated, setTaskCreated] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);
  const [taskDone, setTaskDone] = useState(false);
  const [githubConnectionOverride, setGithubConnectionOverride] = useState(null);
  const [specCreated, setSpecCreated] = useState(false);
  const [agentApproved, setAgentApproved] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 70, y: 80 });
  const [toast, setToast] = useState('');
  const [modalType, setModalType] = useState(null);
  const [projectWizardStep, setProjectWizardStep] = useState(1);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef(null);
  const actionRef = useRef(null);
  const navRefs = useRef({});
  const elapsedRef = useRef(0);
  const activeScreen = screens[activeIndex];
  const stage = activeScreen.id === 'agent'
    ? agentApproved ? 'Applied' : elapsed < 2700 ? 'Starting sandbox' : elapsed < 6000 ? 'Generating diff' : 'Review gate'
    : activeScreen.group;
  const diffCount = Math.min(codeDiff.length, Math.max(0, Math.floor((elapsed - 1900) / 280)));
  const reviewReady = activeScreen.id === 'agent' && elapsed > 6000;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const interval = window.setInterval(() => {
      const next = elapsedRef.current + 100;
      if (next >= activeScreen.duration) {
        elapsedRef.current = 0;
        setElapsed(0);
        if (activeIndex === screens.length - 1) {
          setProjectCreated(false);
          setCreatedProject(null);
          setTaskCreated(false);
          setCreatedTask(null);
          setTaskDone(false);
          setGithubConnectionOverride(null);
          setSpecCreated(false);
          setAgentApproved(false);
          setDeployed(false);
        }
        setActiveIndex((index) => (index + 1) % screens.length);
        return;
      }
      elapsedRef.current = next;
      setElapsed(next);
    }, 100);
    return () => window.clearInterval(interval);
  }, [activeIndex, activeScreen.duration, paused]);

  useEffect(() => {
    const targetRef = modalType
      ? actionRef
      : activeScreen.id === 'overview'
        ? { current: navRefs.current.projects }
        : actionRef;
    if (!targetRef.current || !rootRef.current) return undefined;
    const moveCursor = () => {
      const bounds = rootRef.current.getBoundingClientRect();
      const target = targetRef.current?.getBoundingClientRect();
      if (!target || !bounds.width || !bounds.height) return;
      setCursorPosition({
        x: target.left + Math.min(target.width * 0.65, 92),
        y: target.top + Math.min(target.height * 0.65, 28),
      });
    };
    const frame = window.requestAnimationFrame(moveCursor);
    window.addEventListener('resize', moveCursor);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', moveCursor);
    };
  }, [activeIndex, modalType, paused, projectWizardStep, reviewReady]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!modalType) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setModalType(null);
        setPaused(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalType]);

  const visit = (index) => {
    if (modalType) return;
    elapsedRef.current = 0;
    setActiveIndex(index);
    setElapsed(0);
  };
  const notice = (message) => setToast(message);
  const openModal = (type) => {
    setModalType(type);
    setPaused(true);
    setProjectWizardStep(1);
    setToast('');
  };
  const closeModal = () => {
    setModalType(null);
    setPaused(false);
  };
  const handleProjectCreated = (project) => {
    setCreatedProject(project);
    setProjectCreated(true);
    setModalType(null);
    setPaused(true);
    notice('Project created in your demo workspace');
  };
  const handleTaskCreated = (task) => {
    setCreatedTask(task);
    setTaskCreated(true);
    setModalType(null);
    setPaused(true);
    notice('Task created in your demo workspace');
  };
  const isProjectCreated = projectCreated;
  const isTaskCreated = taskCreated;
  const isGithubConnected = githubConnectionOverride ?? false;
  const isSpecCreated = specCreated;
  const isAgentApproved = agentApproved;
  const isDeployed = deployed;
  const guideMessage = modalType === 'project'
    ? projectWizardStep === 5 ? 'Next: Open the project to add it to this workspace.' : projectWizardStep === 4 ? 'Next: Review your setup, then create the project.' : `Step ${projectWizardStep} of 4: Complete this section, then select Next.`
    : modalType === 'task'
      ? 'Next: Add a task title and context, then select Create task.'
      : activeScreen.id === 'overview'
        ? 'Start here: select Projects in the sidebar.'
        : activeScreen.id === 'projects'
          ? 'Next: select New project to create a workspace project.'
          : activeScreen.id === 'tasks'
            ? 'Next: select New task to add work to the board.'
            : activeScreen.id === 'integrations'
              ? 'Next: connect GitHub, Slack, or Figma.'
              : activeScreen.id === 'agent' && reviewReady
                ? 'Next: review the generated diff, then approve and merge.'
                : 'Explore the screen, or use the sidebar to choose a feature.';

  const renderScreen = () => {
    switch (activeScreen.id) {
      case 'overview':
        return (
          <>
            <ScreenHeading eyebrow="MONDAY, OCTOBER 21" title="Good morning, Alex" detail="Here’s what’s happening across your workspace." action={<SmallButton onClick={() => visit(1)} buttonRef={actionRef}><ArrowUpRight size={13} /> View projects</SmallButton>} />
            <div className="pdemo-stat-grid">
              <Stat label="Active projects" value="08" icon={<Box />} tone="cyan" trend="+2 this week" />
              <Stat label="Open tasks" value="24" icon={<ListTodo />} tone="purple" trend="6 in progress" />
              <Stat label="Agent runs" value="12" icon={<Bot />} tone="green" trend="3 awaiting review" />
              <Stat label="Deployments" value="04" icon={<Rocket />} tone="amber" trend="All systems healthy" />
            </div>
            <div className="pdemo-two-col">
              <Panel title="Recent activity" extra="View all">
                <ActivityRow icon={<GitCommitHorizontal />} title="Agent pushed a fix" meta="buildrs-web · 4 min ago" tone="green" />
                <ActivityRow icon={<ListTodo />} title="Improve project overview" meta="In review · Alex Morgan" tone="purple" />
                <ActivityRow icon={<Rocket />} title="Production deploy succeeded" meta="api-service · 1 hour ago" tone="cyan" />
              </Panel>
              <Panel title="Your projects" extra="8 total">
                <ProjectRow name="buildrs-web" meta="Next.js · Updated 4m ago" progress="72%" />
                <ProjectRow name="api-service" meta="Node.js · Updated yesterday" progress="48%" />
                <ProjectRow name="design-system" meta="React · Updated Monday" progress="91%" />
              </Panel>
            </div>
          </>
        );
      case 'projects':
        return (
          <>
            <ScreenHeading eyebrow="WORKSPACE / PROJECTS" title="Projects" detail="Your team’s projects, repositories, and build progress." action={<SmallButton primary buttonRef={actionRef} onClick={() => openModal('project')}><Plus size={14} /> New project</SmallButton>} />
            {isProjectCreated && <div className="pdemo-created-banner"><CheckCircle2 size={15} /> New project created <span>·</span> <b>{createdProject?.name || 'Customer Portal'}</b><span className="pdemo-spacer" /><span className="pdemo-status status-cyan">Ready</span></div>}
            <div className="pdemo-card-grid">
              <ProjectCard name={isProjectCreated ? createdProject?.name || 'Customer Portal' : 'buildrs-web'} repo={isProjectCreated ? createdProject?.githubRepoName || 'Template · main' : 'buildrshq/buildrs-web'} stack={isProjectCreated ? (createdProject?.technologies || []).slice(0, 2).join(' · ') : 'Next.js · React'} percent={isProjectCreated ? '0%' : '72%'} icon="B" />
              <ProjectCard name="api-service" repo="buildrshq/api-service" stack="Node.js · Express" percent="48%" icon="A" />
              <ProjectCard name="design-system" repo="buildrshq/design-system" stack="React · Storybook" percent="91%" icon="D" />
            </div>
            <div className="pdemo-inline-note"><GitBranch size={13} /> Projects connect repositories, specs, tasks, and agent work in one place. <button type="button" className="link-accent" onClick={() => visit(screens.findIndex((screen) => screen.id === 'integrations'))}>Manage integrations</button></div>
          </>
        );
      case 'tasks':
        return (
          <>
            <ScreenHeading eyebrow="WORK / TASKS" title="Task board" detail="Plan work, assign owners, and delegate implementation to an agent." action={<SmallButton primary buttonRef={actionRef} onClick={() => openModal('task')}><Plus size={14} /> New task</SmallButton>} />
            <div className="pdemo-task-toolbar"><span className="pdemo-filter is-selected">All tasks <b>24</b></span><span className="pdemo-filter">My tasks <b>6</b></span><span className="pdemo-toolbar-spacer" /><span className="pdemo-muted"><Bot size={12} /> 3 agent runs</span></div>
            <div className="pdemo-kanban">
              <TaskLane title="TO DO" count={taskCreated ? '5' : '4'} accent="gray">
                {isTaskCreated && <TaskCard title={createdTask?.title || 'Set up customer portal'} tag="NEW" accent="cyan" />}
                <TaskCard title="Add invite team flow" tag="HIGH" accent="amber" />
              </TaskLane>
              <TaskLane title="IN PROGRESS" count="3" accent="cyan">
                <TaskCard title="Improve project overview" tag="AGENT" accent="purple" owner="AM" />
                <TaskCard title="Add workspace search" tag="MED" accent="cyan" />
              </TaskLane>
              <TaskLane title="IN REVIEW" count="2" accent="purple">
                <TaskCard title="Fix progress calculation" tag="READY" accent="green" owner="AI" onClick={() => setTaskDone((value) => !value)} done={taskDone} />
              </TaskLane>
            </div>
          </>
        );
      case 'integrations':
        return (
          <>
            <ScreenHeading eyebrow="WORKSPACE / INTEGRATIONS" title="Connect your tools" detail="Bring your repositories, designs, and team conversations into Buildrs." action={<span className="pdemo-status status-green"><Check size={11} /> {isGithubConnected ? '1 connected' : 'Ready to connect'}</span>} />
            <div className="pdemo-integration-grid">
              <IntegrationCard name="GitHub" description="Repositories, branches, and pull requests." mark="GH" active={isGithubConnected} onClick={() => { setGithubConnectionOverride(!isGithubConnected); notice(isGithubConnected ? 'GitHub disconnected' : 'GitHub connected'); }} buttonRef={actionRef} />
              <IntegrationCard name="Slack" description="Share agent updates with your team." mark="S" active={false} onClick={() => notice('Slack connection is ready to configure')} />
              <IntegrationCard name="Figma" description="Use design context in agent tasks." mark="F" active={false} onClick={() => notice('Figma connection is ready to configure')} />
            </div>
            <div className="pdemo-inline-note"><ShieldCheck size={13} /> Connections are workspace-scoped and can be managed by an admin.</div>
          </>
        );
      case 'specs':
        return (
          <>
            <ScreenHeading eyebrow="BUILD / SPECS" title="Specs & requirements" detail="Give every agent task a clear, testable definition of done." action={<SmallButton primary buttonRef={actionRef} onClick={() => { setSpecCreated(true); notice('Spec added to the project'); }}><Plus size={14} /> New spec</SmallButton>} />
            {isSpecCreated && <div className="pdemo-created-banner purple"><CheckCircle2 size={15} /> Spec generated from your project brief <span className="pdemo-spacer" /><span className="pdemo-status status-purple">Draft</span></div>}
            <div className="pdemo-spec-card">
              <div className="pdemo-spec-icon"><FileText size={17} /></div>
              <div className="pdemo-spec-main"><div className="pdemo-spec-title">{isSpecCreated ? 'Customer portal onboarding flow' : 'Project overview improvements'} <span className="pdemo-status status-purple">SPEC</span></div><p>As a workspace owner, I can see accurate project health and progress so that I can prioritize work with confidence.</p><div className="pdemo-spec-meta"><span><ListTodo size={12} /> 4 acceptance criteria</span><span><CheckCircle2 size={12} /> 3 validation checks</span><span>Updated 12m ago</span></div></div>
              <button type="button" className="pdemo-icon-button" aria-label="More spec options"><MoreHorizontal size={16} /></button>
            </div>
            <div className="pdemo-criteria">
              <div className="pdemo-section-label">ACCEPTANCE CRITERIA</div>
              <Criterion text="Progress is safely calculated when tasks are empty" checked />
              <Criterion text="Project status is visible in the overview card" checked />
              <Criterion text="Loading and error states are handled" />
            </div>
          </>
        );
      case 'agent':
        return (
          <>
            <ScreenHeading eyebrow="BUILD / AI AGENT" title="Agent sandbox" detail="Isolated execution with a human approval gate before changes land." action={<span className={`pdemo-status ${isAgentApproved ? 'status-green' : elapsed > 6000 ? 'status-amber' : 'status-cyan'}`}>{isAgentApproved ? <><Check size={11} /> Merged</> : elapsed > 6000 ? <><Clock3 size={11} /> Review needed</> : <><Loader2 size={11} className="pdemo-spin" /> Running</>}</span>} />
            <div className="pdemo-agent-task"><div className="pdemo-agent-avatar"><Bot size={15} /></div><div><b>Prevent project progress from exceeding 100%</b><span>Customer Portal · Task T-2048 · Agent sandbox</span></div><span className="pdemo-agent-live"><i /> {isAgentApproved ? 'Complete' : elapsed > 6000 ? 'Needs review' : 'Agent active'}</span></div>
            <div className={`pdemo-diff ${isAgentApproved ? 'is-approved' : ''}`}>
              <div className="pdemo-diff-head"><span><FileCode2 size={13} /> src/components/ProjectCard.tsx</span><span className="pdemo-diff-stats"><b>+2</b> <i>-1</i></span></div>
              <div className="pdemo-code">
                {(elapsed < 1900 ? sampleCode.map((text) => ({ kind: 'context', text: ` ${text}` })) : codeDiff.slice(0, diffCount)).map((line, index) => <div className={`pdemo-code-line ${line.kind}`} key={`${index}-${line.text}`}><span className="pdemo-line-no">{String(index + 1).padStart(2, '0')}</span><code>{line.text || ' '}</code></div>)}
                {!isAgentApproved && elapsed > 1900 && elapsed < 6200 && <span className="pdemo-caret" />}
              </div>
              <div className="pdemo-review-bar">
                {isAgentApproved ? <><span className="pdemo-verified"><BadgeCheck size={15} /> Verified and merged</span><span className="pdemo-muted">CI checks passed · main</span></> : elapsed > 6000 ? <><span className="pdemo-review-text"><ShieldCheck size={14} /> Human review required</span><SmallButton primary buttonRef={actionRef} onClick={() => { setAgentApproved(true); notice('Changes approved and merged'); }}><Check size={13} /> Approve &amp; Merge</SmallButton></> : <><span className="pdemo-muted"><Sparkles size={13} /> {elapsed < 1900 ? 'Preparing isolated sandbox…' : 'Streaming code changes…'}</span><span className="pdemo-muted">Mock run · no API</span></>}
              </div>
            </div>
            <div className="pdemo-agent-foot"><span><ShieldCheck size={12} /> Changes stay isolated until you approve.</span><span><Activity size={12} /> Tests: {isAgentApproved ? 'passed' : elapsed > 6000 ? 'ready to run' : 'running'}</span></div>
          </>
        );
      case 'editor':
        return (
          <>
            <ScreenHeading eyebrow="BUILD / EDITOR" title="Code editor" detail="Inspect project files and work in a connected development environment." action={<SmallButton primary buttonRef={actionRef} onClick={() => notice('Preview started in the mock workspace')}><Play size={12} /> Run preview</SmallButton>} />
            <div className="pdemo-editor">
              <aside className="pdemo-filetree"><div className="pdemo-section-label">FILES <MoreHorizontal size={13} /></div><div className="pdemo-folder"><ChevronDown size={12} /> src</div><div className="pdemo-folder indent"><ChevronDown size={12} /> components</div><div className="pdemo-file selected"><FileCode2 size={12} /> ProjectCard.tsx</div><div className="pdemo-file"><FileCode2 size={12} /> TaskBoard.tsx</div><div className="pdemo-folder"><ChevronDown size={12} /> pages</div><div className="pdemo-file"><FileCode2 size={12} /> index.tsx</div><div className="pdemo-file"><FileCode2 size={12} /> package.json</div></aside>
              <div className="pdemo-editor-code"><div className="pdemo-editor-tab"><FileCode2 size={12} /> ProjectCard.tsx <span>×</span></div><pre>{sampleCode.map((line, index) => <div key={line + index}><span>{String(index + 1).padStart(2, '0')}</span><code>{line}</code></div>)}</pre><div className="pdemo-terminal"><div><span>TERMINAL</span><span className="pdemo-terminal-ok"><i /> Ready</span></div><code>$ npm run dev</code><small>compiled successfully · Local: http://localhost:3000</small></div></div>
            </div>
          </>
        );
      case 'figma':
        return (
          <>
            <ScreenHeading eyebrow="BUILD / FIGMA" title="Design context" detail="Bring design frames into project specs and agent tasks." action={<SmallButton primary buttonRef={actionRef} onClick={() => notice('Figma file linked in your demo workspace')}><Link2 size={13} /> Connect Figma</SmallButton>} />
            <div className="pdemo-design-preview"><div className="pdemo-design-toolbar"><span>Acme Studio / Onboarding flow</span><span className="pdemo-status status-purple">FIGMA</span></div><div className="pdemo-design-canvas"><div className="pdemo-design-screen"><div /><b>Welcome to Acme</b><span>Everything your team needs, in one place.</span><i /><i /><strong>Get started</strong></div><div className="pdemo-design-inspector"><b>Frame properties</b><span>Desktop · 1440 × 900</span><span>Selected layer</span><code>Button / Primary</code><span>Linked to</span><code>Project onboarding spec</code></div></div></div>
            <div className="pdemo-inline-note"><FileText size={13} /> Attach a selected design frame to a task to give the agent visual context.</div>
          </>
        );
      case 'mcp':
        return (
          <>
            <ScreenHeading eyebrow="BUILD / MCP SERVER" title="MCP Server" detail="Expose Buildrs project context to the tools your team already uses." action={<SmallButton primary buttonRef={actionRef} onClick={() => notice('MCP configuration copied to clipboard')}><Link2 size={13} /> Copy config</SmallButton>} />
            <Panel title="Workspace MCP endpoint" extra={<span className="pdemo-status status-green">ACTIVE</span>}>
              <div className="pdemo-mcp-config"><code>https://mcp.buildrshq.dev/v1/workspace/acme</code><button type="button" className="pdemo-icon-button" aria-label="Copy MCP endpoint" onClick={() => notice('MCP endpoint copied to clipboard')}><Check size={13} /></button></div>
              <Criterion text="Project and specification context available" checked />
              <Criterion text="Agent sessions and task actions available" checked />
              <Criterion text="Access controlled by workspace membership" checked />
            </Panel>
          </>
        );
      case 'debug':
      case 'team':
      case 'memory':
        return (
          <>
            <ScreenHeading eyebrow={`COLLABORATE / ${activeScreen.label.toUpperCase()}`} title={activeScreen.id === 'debug' ? 'Debug room' : activeScreen.id === 'memory' ? 'Team memory' : 'Your team'} detail={activeScreen.id === 'debug' ? 'Share logs and work through issues together.' : activeScreen.id === 'memory' ? 'Keep decisions and engineering knowledge available to every agent.' : 'Bring people, tasks, and decisions together.'} action={<SmallButton primary buttonRef={actionRef} onClick={() => notice('Invite link copied to clipboard')}><Plus size={14} /> {activeScreen.id === 'debug' ? 'Start debug room' : 'Invite member'}</SmallButton>} />
            <div className="pdemo-two-col">
              <Panel title="Workspace members" extra="8 members">
                <MemberRow initials="AM" name="Alex Morgan" role="Admin" color="cyan" />
                <MemberRow initials="JL" name="Jordan Lee" role="Engineer" color="purple" />
                <MemberRow initials="SK" name="Sam Kim" role="Designer" color="amber" />
                <MemberRow initials="AI" name="Buildrs Agent" role="AI agent" color="green" />
              </Panel>
              <Panel title="Upcoming meetings" extra="Open calendar">
                <div className="pdemo-meeting"><span className="pdemo-date">10:30</span><div><b>Daily standup</b><small>Today · 4 attendees</small></div><MessageSquare size={14} /></div>
                <div className="pdemo-meeting"><span className="pdemo-date">14:00</span><div><b>Project review</b><small>Today · 3 attendees</small></div><MessageSquare size={14} /></div>
                <div className="pdemo-meeting-note"><Clock3 size={13} /> Notes and decisions stay attached to the work.</div>
              </Panel>
            </div>
          </>
        );
      case 'git':
        return (
          <>
            <ScreenHeading eyebrow="SHIP / GIT & PULL REQUESTS" title="Review every change" detail="Branch, diff, and merge agent work with a clear audit trail." action={<SmallButton primary buttonRef={actionRef} onClick={() => notice('Pull request opened in the mock workspace')}><GitPullRequest size={14} /> Open pull request</SmallButton>} />
            <div className="pdemo-pr-card"><div className="pdemo-pr-icon"><GitPullRequest size={18} /></div><div className="pdemo-pr-main"><div className="pdemo-pr-title">Fix project progress calculation <span className="pdemo-status status-green">OPEN</span></div><p><b>#248</b> opened by Buildrs Agent · buildrs-web</p><div className="pdemo-branch"><code>agent/fix-project-progress</code><ArrowRight size={12} /><code>main</code></div></div><span className="pdemo-diff-stats"><b>+12</b> <i>-3</i></span></div>
            <div className="pdemo-checks"><div className="pdemo-section-label">STATUS CHECKS</div><Criterion text="Unit tests — 128 passed" checked /><Criterion text="Lint and typecheck — passed" checked /><Criterion text="Human approval — required before merge" /></div>
            <div className="pdemo-inline-note"><GitBranch size={13} /> GitHub sync keeps branches and pull requests linked to project tasks.</div>
          </>
        );
      case 'deploy':
        return (
          <>
            <ScreenHeading eyebrow="SHIP / DEPLOY" title="Deploy with confidence" detail="See live environment status and recent release activity." action={<SmallButton primary buttonRef={actionRef} onClick={() => { setDeployed(true); notice('Deployment verified successfully'); }}><Rocket size={13} /> Deploy to production</SmallButton>} />
            <div className={`pdemo-deploy-banner ${isDeployed ? 'success' : ''}`}><div className="pdemo-deploy-icon">{isDeployed ? <CheckCircle2 size={18} /> : <Rocket size={18} />}</div><div><b>{isDeployed ? 'Deployment successful' : 'Production is healthy'}</b><span>{isDeployed ? 'Customer Portal · deployed just now' : 'buildrs-web · main · deployed 18 minutes ago'}</span></div><span className="pdemo-status status-green"><i /> {isDeployed ? 'VERIFIED' : 'LIVE'}</span></div>
            <Panel title="Deployment activity" extra="View logs">
              <ActivityRow icon={<CheckCircle2 />} title="Production deployment succeeded" meta="buildrs-web · 18 min ago" tone="green" />
              <ActivityRow icon={<GitCommitHorizontal />} title="Merged #247 · Add project filters" meta="Jordan Lee · 42 min ago" tone="cyan" />
              <ActivityRow icon={<Rocket />} title="Preview deployment ready" meta="feature/task-board · 1 hour ago" tone="purple" />
            </Panel>
          </>
        );
      case 'billing':
      case 'audit':
      case 'support':
      case 'settings':
        return (
          <>
            <ScreenHeading eyebrow={`MANAGE / ${activeScreen.label.toUpperCase()}`} title={activeScreen.title} detail="Manage workspace access and see the activity that matters to your team." action={<SmallButton buttonRef={actionRef} onClick={() => notice(`${activeScreen.title} opened in demo`)}><Settings2 size={13} /> {activeScreen.id === 'billing' ? 'Manage plan' : 'Settings'}</SmallButton>} />
            <div className="pdemo-two-col">
              <Panel title="Workspace plan" extra={<CreditCard size={13} />}>
                <div className="pdemo-plan"><div><span>TEAM PLAN</span><b>Team</b><small>Renews Nov 21, 2025</small></div><span className="pdemo-status status-cyan">ACTIVE</span></div>
                <div className="pdemo-usage-label"><span>Agent minutes</span><b>640 / 1,000</b></div><div className="pdemo-usage"><i /></div>
                <div className="pdemo-usage-label"><span>Projects</span><b>8 / 20</b></div><div className="pdemo-usage"><i className="usage-purple" /></div>
              </Panel>
              <Panel title="Recent audit activity" extra={<ShieldCheck size={13} />}>
                <ActivityRow icon={<CheckCircle2 />} title="Changes approved and merged" meta="Alex Morgan · Just now" tone="green" />
                <ActivityRow icon={<Link2 />} title="GitHub integration connected" meta="Alex Morgan · 2 min ago" tone="cyan" />
                <ActivityRow icon={<Users />} title="Jordan Lee joined workspace" meta="Admin invite · Yesterday" tone="purple" />
              </Panel>
            </div>
            <div className="pdemo-inline-note"><ShieldCheck size={13} /> Role-based access and audit events help keep your workspace accountable.</div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <section
      ref={rootRef}
      className={`pdemo ${paused ? 'is-paused' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { if (!modalType) setPaused(false); }}
      aria-label="Interactive Buildrs product walkthrough"
    >
      <div className="pdemo-browser workspace-global-header ail-global-header">
        <div className="ail-global-brand"><img src="/buildrs.png" alt="" /><strong>Buildrs<span>HQ</span></strong></div>
        <div className="ail-global-tools">
          <button type="button" className="ail-branch-selector" onClick={() => notice('Demo workspace · main branch')}><GitBranch /><span>main</span><ChevronDown /></button>
          <span className="ail-global-chip is-ci"><i />CI Passing</span>
          <span className="ail-global-chip is-staging"><i />Staging Live</span>
          <label className="ail-global-search"><Search /><input type="search" placeholder="Search specs, diff, agents" aria-label="Search specs, diff, agents" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const query = searchQuery.trim().toLowerCase();
            if (!query) return;
            const match = screens.findIndex((screen) => `${screen.title} ${screen.group}`.toLowerCase().includes(query));
            if (match >= 0) {
              visit(match);
              setSearchQuery('');
            } else {
              notice('No matching screen in this demo');
            }
          }} /></label>
          <span className="pdemo-tour-label"><span className="pdemo-tour-pulse" /> TOUR <b>{activeIndex + 1}<i>/</i>{screens.length}</b></span>
          <button type="button" className="pdemo-icon-button" aria-label="Notifications"><Bell size={14} /></button>
          <button type="button" className="ail-global-avatar" aria-label="Alex Morgan profile">AM</button>
          <button type="button" className="pdemo-mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle workspace navigation"><Menu size={15} /></button>
        </div>
      </div>
      <div className="pdemo-layout">
        <aside className={`workspace-sidebar pdemo-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
          <nav aria-label="Demo workspace navigation" className="sidebar-nav">
            {workspaceNavigation.map((section) => (
              <div key={section.label} className="pdemo-nav-section">
                <div className="sidebar-nav-section text-[10px] tracking-wider text-zinc-500 font-semibold px-3 mb-1.5">{section.label}</div>
                <div className="flex flex-col gap-0.5">
                  {section.items.map(({ id, icon: Icon }) => {
                    const screenIndex = screens.findIndex((screen) => screen.id === id);
                    const screen = screens[screenIndex];
                    return (
                      <button
                        ref={id === 'projects' ? (element) => { navRefs.current.projects = element; } : undefined}
                        type="button"
                        key={id}
                        className={`sidebar-nav-item ${activeScreen.id === id ? 'active' : ''}`}
                        onClick={() => { visit(screenIndex); setMobileNavOpen(false); }}
                        title={screen.label}
                      >
                        <Icon className="sidebar-nav-icon" />
                        <span>{screen.label}</span>
                        {id === 'tasks' && taskCreated && <span className="pdemo-nav-count">1</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="sidebar-user pdemo-sidebar-user">
            <div className="sidebar-user-info">
              <span className="sidebar-user-avatar pdemo-real-avatar">AM</span>
              <div className="sidebar-user-details">
                <div className="sidebar-user-name">Alex Morgan</div>
                <div className="sidebar-user-role text-zinc-400 text-xs">Workspace Admin</div>
              </div>
            </div>
            <MoreHorizontal size={15} />
          </div>
        </aside>
        <main className="pdemo-main">
          <div className="pdemo-main-top"><div className="pdemo-breadcrumb"><span>Acme Studio</span><span>/</span><b>{activeScreen.title}</b></div><div className="pdemo-top-right"><span className="pdemo-stage"><i /> {stage}</span><button type="button" className="pdemo-icon-button" aria-label="More workspace options"><MoreHorizontal size={15} /></button></div></div>
          <div className={`pdemo-screen screen-${activeScreen.id}`} key={activeScreen.id}>{renderScreen()}</div>
          <div className="pdemo-footer"><div className="pdemo-progress-track"><i style={{ width: `${((activeIndex + elapsed / activeScreen.duration) / screens.length) * 100}%` }} /></div><div className="pdemo-footer-content"><span><Sparkles size={12} /> {guideMessage}</span><span>{activeIndex + 1} of {screens.length} <button type="button" onClick={() => visit((activeIndex + 1) % screens.length)} aria-label="Next walkthrough screen"><ArrowRight size={12} /></button></span></div></div>
        </main>
      </div>
      {isMounted && createPortal(<svg className={`pdemo-cursor ${activeScreen.id === 'agent' && elapsed > 9000 && elapsed < 9600 ? 'is-clicking' : ''}`} style={{ transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px)` }} width="22" height="27" viewBox="0 0 22 27" aria-hidden="true"><path d="M2 1.5v19.2l5.2-5.1 3.8 8.3 3.2-1.5-3.8-8.1h7.2L2 1.5Z" fill="#f8fafc" stroke="#08080b" strokeWidth="1.5" strokeLinejoin="round" /><path d="m8 16 4 7" stroke="#08080b" strokeWidth="1.3" /></svg>, document.body)}
      {toast && <div className="pdemo-toast"><CheckCircle2 size={14} /> {toast}</div>}
      {!paused && activeScreen.id === 'agent' && elapsed > 6200 && elapsed < 9400 && !agentApproved && <span className="pdemo-auto-hint">Agent waiting for your review</span>}
      {isAgentApproved && activeScreen.id === 'agent' && <span className="pdemo-merge-toast"><BadgeCheck size={15} /> Verified · merged to main</span>}
      {isDeployed && activeScreen.id === 'deploy' && <span className="pdemo-merge-toast"><BadgeCheck size={15} /> Deployment verified</span>}
      {modalType && isMounted && createPortal(
        <div className="pdemo-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          {modalType === 'project' ? (
            <div className="pdemo-project-dialog" role="dialog" aria-modal="true" aria-label="Create new project">
              <CreateProjectWizard
                demoMode
                initialSourceType="template"
                focusTargetRef={actionRef}
                onStepChange={setProjectWizardStep}
                onClose={closeModal}
                onCreated={handleProjectCreated}
              />
            </div>
          ) : (
            <div className="pdemo-task-dialog" role="dialog" aria-modal="true" aria-label="Create new task">
              <CreateTaskWizard
                demoMode
                companyId="demo-workspace"
                user={{ fullName: 'Alex Morgan' }}
                projects={[
                  ...(createdProject ? [createdProject] : []),
                  { id: 'demo-buildrs-web', name: 'buildrs-web', defaultBranch: 'main' },
                ]}
                specs={[{ id: 'demo-project-spec', projectId: createdProject?.id || 'demo-buildrs-web', title: 'Project overview improvements' }]}
                defaultProjectId={createdProject?.id || 'demo-buildrs-web'}
                focusTargetRef={actionRef}
                onClose={closeModal}
                onCreated={handleTaskCreated}
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </section>
  );
}

function Stat({ label, value, icon, tone, trend }) {
  return <div className={`pdemo-stat tone-${tone}`}><div className="pdemo-stat-head"><span>{label}</span><i>{icon}</i></div><b>{value}</b><small>{trend}</small></div>;
}

function Panel({ title, extra, children }) {
  return <section className="pdemo-panel"><div className="pdemo-panel-head"><b>{title}</b><span>{extra}</span></div><div className="pdemo-panel-body">{children}</div></section>;
}

function ActivityRow({ icon, title, meta, tone }) {
  return <div className="pdemo-activity"><span className={`pdemo-activity-icon tone-${tone}`}>{icon}</span><span><b>{title}</b><small>{meta}</small></span><ArrowUpRight size={12} /></div>;
}

function ProjectRow({ name, meta, progress }) {
  return <div className="pdemo-project-row"><span><b>{name}</b><small>{meta}</small></span><div className="pdemo-mini-progress"><i style={{ width: progress }} /></div><span className="pdemo-progress-value">{progress}</span></div>;
}

function ProjectCard({ name, repo, stack, percent, icon }) {
  return <article className="pdemo-project-card"><div className="pdemo-project-card-top"><span className="pdemo-project-mark">{icon}</span><button type="button" className="pdemo-icon-button" aria-label={`${name} options`}><MoreHorizontal size={14} /></button></div><b>{name}</b><small><GitBranch size={11} /> {repo}</small><div className="pdemo-project-tags"><span>{stack}</span><span>Private</span></div><div className="pdemo-project-card-foot"><span>Progress</span><b>{percent}</b></div><div className="pdemo-mini-progress"><i style={{ width: percent }} /></div></article>;
}

function TaskLane({ title, count, accent, children }) {
  return <section className={`pdemo-lane lane-${accent}`}><div className="pdemo-lane-head"><i />{title}<span>{count}</span></div><div className="pdemo-lane-cards">{children}</div></section>;
}

function TaskCard({ title, tag, accent, owner, done, onClick }) {
  return <button type="button" onClick={onClick} className={`pdemo-task-card ${done ? 'done' : ''}`}><div><span className={`pdemo-task-tag tag-${accent}`}>{tag}</span><MoreHorizontal size={13} /></div><b>{title}</b><small><span className={`pdemo-assignee ${owner === 'AI' ? 'is-ai' : ''}`}>{owner || 'JL'}</span>{owner === 'AI' ? 'AI Agent' : 'Jordan Lee'}<Clock3 size={11} /> 2d</small></button>;
}

function IntegrationCard({ name, description, mark, active, onClick, buttonRef }) {
  return <article className={`pdemo-integration ${active ? 'connected' : ''}`}><div className="pdemo-integration-top"><span className={`pdemo-integration-mark mark-${mark.toLowerCase()}`}>{mark}</span><span className={`pdemo-status ${active ? 'status-green' : 'status-gray'}`}>{active ? 'CONNECTED' : 'NOT CONNECTED'}</span></div><b>{name}</b><p>{description}</p><div className="pdemo-integration-foot"><span>{active ? <><Check size={12} /> Synced just now</> : 'Workspace integration'}</span><SmallButton buttonRef={buttonRef} primary={!active} onClick={onClick}>{active ? 'Manage' : <><Link2 size={12} /> Connect</>}</SmallButton></div></article>;
}

function Criterion({ text, checked }) {
  return <div className={`pdemo-criterion ${checked ? 'checked' : ''}`}><span>{checked && <Check size={10} />}</span>{text}</div>;
}

function MemberRow({ initials, name, role, color }) {
  return <div className="pdemo-member"><span className={`pdemo-member-avatar tone-${color}`}>{initials}</span><span><b>{name}</b><small>{role}</small></span><span className="pdemo-member-active"><i /> Active</span></div>;
}
