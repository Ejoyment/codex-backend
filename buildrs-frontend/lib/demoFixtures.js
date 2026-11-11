import { getDebugRoomDemoResponse } from './debugRoomDemoFixtures';

const projectFixtures = [
  {
    id: 'demo-buildrs-web',
    _id: 'demo-buildrs-web',
    name: 'buildrs-web',
    description: 'The BuildrsHQ workspace experience.',
    type: 'Next.js',
    status: 'active',
    progress: 72,
    defaultBranch: 'main',
    updatedAt: new Date().toISOString(),
    members: [],
    technologies: ['Next.js', 'React'],
  },
  {
    id: 'demo-api-service',
    _id: 'demo-api-service',
    name: 'api-service',
    description: 'Workspace APIs and integrations.',
    type: 'Node.js',
    status: 'active',
    progress: 48,
    defaultBranch: 'main',
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    members: [],
    technologies: ['Node.js', 'Express'],
  },
];

const taskFixtures = [
  {
    id: 'demo-task-progress',
    _id: 'demo-task-progress',
    title: 'Fix project progress calculation',
    description: 'Handle projects with no completed tasks without showing invalid progress.',
    status: 'in_review',
    priority: 'high',
    projectId: 'demo-buildrs-web',
    project: projectFixtures[0],
    projectName: 'buildrs-web',
    assignee: { fullName: 'Buildrs Agent', name: 'Buildrs Agent' },
    agentSessionId: 'demo-agent-session',
    agentExecution: { status: 'awaiting_review' },
    specIds: ['demo-spec-progress'],
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'demo-task-invites',
    _id: 'demo-task-invites',
    title: 'Add invite team flow',
    description: 'Allow workspace admins to invite teammates.',
    status: 'backlog',
    priority: 'medium',
    projectId: 'demo-buildrs-web',
    project: projectFixtures[0],
    projectName: 'buildrs-web',
    assignee: { fullName: 'Jordan Lee', name: 'Jordan Lee' },
    specIds: [],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'demo-task-search',
    _id: 'demo-task-search',
    title: 'Add workspace search',
    description: 'Search tasks and projects from the workspace header.',
    status: 'in_progress',
    priority: 'medium',
    projectId: 'demo-buildrs-web',
    project: projectFixtures[0],
    projectName: 'buildrs-web',
    assignee: { fullName: 'Alex Morgan', name: 'Alex Morgan' },
    specIds: [],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

const specFixtures = [
  {
    _id: 'demo-spec-progress',
    id: 'demo-spec-progress',
    projectId: 'demo-buildrs-web',
    title: 'Project overview improvements',
    description: 'Show accurate project health and progress to workspace owners.',
    status: 'active',
    acceptanceCriteria: [
      'Progress remains valid when a project has no completed tasks.',
      'Project health is visible from the overview.',
      'Automated tests cover empty and active projects.',
    ],
    updatedAt: new Date().toISOString(),
  },
];

const companyFixture = {
  id: 'demo-company',
  _id: 'demo-company',
  name: 'Acme Studio',
  role: 'admin',
  members: [],
};

const integrationsFixture = [
  { provider: 'github', name: 'GitHub', isActive: true, connected: true, updatedAt: new Date().toISOString() },
  { provider: 'slack', name: 'Slack', isActive: true, connected: true, updatedAt: new Date().toISOString() },
  { provider: 'figma', name: 'Figma', isActive: false, connected: false },
  { provider: 'discord', name: 'Discord', isActive: false, connected: false },
  { provider: 'notion', name: 'Notion', isActive: false, connected: false },
];

const memberFixtures = [
  { id: 'demo-alex', _id: 'demo-alex', fullName: 'Alex Morgan', name: 'Alex Morgan', email: 'alex@example.com', role: 'admin' },
  { id: 'demo-jordan', _id: 'demo-jordan', fullName: 'Jordan Lee', name: 'Jordan Lee', email: 'jordan@example.com', role: 'engineer' },
  { id: 'demo-sam', _id: 'demo-sam', fullName: 'Sam Kim', name: 'Sam Kim', email: 'sam@example.com', role: 'designer' },
];

const fileFixtures = [
  { _id: 'demo-file-card', id: 'demo-file-card', name: 'ProjectCard.jsx', path: 'src/components/ProjectCard.jsx', type: 'file', language: 'javascript' },
  { _id: 'demo-file-projects', id: 'demo-file-projects', name: 'projects.js', path: 'src/pages/projects.js', type: 'file', language: 'javascript' },
  { _id: 'demo-file-progress', id: 'demo-file-progress', name: 'progress.test.js', path: 'src/lib/progress.test.js', type: 'file', language: 'javascript' },
];

const now = () => new Date().toISOString();
const success = (data = {}) => ({ success: true, ...data });
const agentSessionFixture = {
  _id: 'demo-agent-session',
  id: 'demo-agent-session',
  taskId: 'demo-task-progress',
  taskTitle: 'Fix project progress calculation',
  title: 'Fix project progress calculation',
  status: 'awaiting_review',
  branch: 'agent/fix-project-progress',
  model: 'Buildrs Code Agent',
  summary: 'Handle projects with no completed tasks and keep progress values valid.',
  progress: 1,
  startedAt: new Date(Date.now() - 6 * 60000).toISOString(),
  completedAt: new Date(Date.now() - 60000).toISOString(),
  createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
  updatedAt: now(),
  filesChanged: [
    {
      path: 'src/lib/projectProgress.ts',
      action: 'modified',
      diff: '@@ -4,3 +4,6 @@\n export function getProgress(completed: number, total: number) {\n-  return completed / total;\n+  if (total === 0) return 0;\n+  return Math.min(1, Math.max(0, completed / total));\n }\n',
    },
    {
      path: 'src/lib/projectProgress.test.ts',
      action: 'modified',
      diff: '@@ -8,2 +8,5 @@\n+  it("returns zero when there are no tasks", () => {\n+    expect(getProgress(0, 0)).toBe(0);\n+  });\n',
    },
  ],
  diffSummary: { filesChanged: 2, insertions: 7, deletions: 1 },
  terminalLog: [
    { type: 'command', message: 'npm test -- projectProgress', timestamp: new Date(Date.now() - 3 * 60000).toISOString() },
    { type: 'success', message: '2 tests passed', timestamp: new Date(Date.now() - 2 * 60000).toISOString() },
    { type: 'success', message: 'Changes are ready for review.', timestamp: new Date(Date.now() - 60000).toISOString() },
  ],
  validationResult: {
    specs: [
      { name: 'Zero-task progress is valid', passed: true },
      { name: 'Progress remains bounded', passed: true },
    ],
  },
};

export function isDemoTourActive() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('tour') === '1'
    || window.name === 'buildrs-product-tour';
}

export function getDemoApiResponse(path, options = {}) {
  const url = new URL(path, 'http://buildrs-demo.local');
  const pathname = url.pathname;
  const method = (options.method || 'GET').toUpperCase();

  const debugRoomDemo = getDebugRoomDemoResponse(pathname, method, options.body);
  if (debugRoomDemo) return success(debugRoomDemo);

  if (pathname === '/api/dashboard/data') {
    return success({
      data: {
        stats: { activeProjects: 2, totalCompleted: 8, teamMembers: 3, integrations: 2 },
        trial: null,
        connectedIntegrations: ['github', 'slack'],
      },
    });
  }
  if (pathname === '/api/dashboard/overview') {
    return success({
      data: {
        workspace: { name: 'Acme Studio', branch: 'main' },
        isEmpty: false,
        needsAttention: [{ id: 'demo-task-progress', title: 'Review project progress fix', href: '/ai-pair', severity: 'medium' }],
        activeDevelopment: {
          taskCode: 'BUILD-24',
          taskTitle: 'Fix project progress calculation',
          status: 'In review',
          stepText: 'Agent changes are ready for review.',
          progressPercent: 100,
          branch: 'agent/fix-project-progress',
          filesChanged: 3,
          checks: 4,
          terminalLog: '✓ Tests passed\n✓ Lint passed\nWaiting for approval',
        },
        sprint: {
          inProgress: 1,
          inReview: 1,
          completed: 8,
          items: [
            { id: 'demo-sprint-1', code: 'BLD-124', title: 'Improve project overview', status: 'in_progress', assignee: 'AM' },
            { id: 'demo-sprint-2', code: 'BLD-128', title: 'Fix project progress calculation', status: 'in_review', assignee: 'AI' },
          ],
        },
        recentActivity: [
          { id: 'activity-1', type: 'git', title: 'Agent pushed a fix', description: 'buildrs-web · 4 min ago', timestamp: now() },
          { id: 'activity-2', type: 'code', title: 'Progress calculation updated', description: '3 files changed', timestamp: now() },
        ],
        shipReadiness: { percent: 92, checks: [{ label: 'Build', status: 'passed' }, { label: 'Tests', status: 'passed' }] },
        debugRooms: [],
        connections: integrationsFixture,
      },
    });
  }
  if (pathname === '/api/projects' && method === 'GET') return success({ projects: projectFixtures });
  if (pathname === '/api/projects' && method !== 'GET') return success({ project: projectFixtures[0], id: projectFixtures[0].id });
  if (pathname === '/api/projects/tasks' && method === 'GET') return success({ tasks: taskFixtures });
  if (pathname === '/api/projects/tasks' && method !== 'GET') return success({ task: taskFixtures[0], id: taskFixtures[0].id });
  if (/^\/api\/projects\/[^/]+\/files$/.test(pathname)) return success({ files: fileFixtures });
  if (/^\/api\/projects\/[^/]+\/tasks$/.test(pathname)) return success({ tasks: taskFixtures });
  if (/^\/api\/projects\/[^/]+\/provisioning/.test(pathname)) return success({ status: 'ready', ready: true });
  if (/^\/api\/projects\/[^/]+$/.test(pathname)) return success({ project: projectFixtures[0] });
  if (/^\/api\/projects\/tasks\/[^/]+$/.test(pathname)) return success({ task: taskFixtures[0] });

  if (pathname === '/api/company/my-companies') return success({ companies: [companyFixture] });
  if (/^\/api\/company\/[^/]+\/members$/.test(pathname)) return success({ members: memberFixtures });
  if (/^\/api\/company\/[^/]+\/settings$/.test(pathname)) return success({ settings: {} });
  if (/^\/api\/company\/[^/]+$/.test(pathname)) return success({ company: companyFixture });
  if (/^\/api\/collaboration\/[^/]+\/projects$/.test(pathname)) {
    return success({
      projects: [{
        ...projectFixtures[0],
        id: 'demo-team-portal',
        _id: 'demo-team-portal',
        name: 'team-portal',
        description: 'Shared work for the Acme Studio team.',
        type: 'team',
      }],
    });
  }

  if (pathname === '/api/integrations' || pathname === '/api/integrations/') return success({ integrations: integrationsFixture });
  if (/^\/api\/integrations\/[^/]+\/auth$/.test(pathname)) return success({ connected: true });
  if (/^\/api\/integrations\/[^/]+\/disconnect$/.test(pathname)) return success({ disconnected: true });
  if (pathname === '/api/github/status' || pathname === '/api/slack/status' || pathname === '/api/discord/status' || pathname === '/api/figma/status') {
    return success({ connected: true, isConnected: true, status: 'connected' });
  }
  if (pathname === '/api/github/repos' || pathname === '/api/ai-pair/repos') {
    return success({
      repositories: [{
        id: 201,
        name: 'buildrs-web',
        fullName: 'buildrshq/buildrs-web',
        owner: 'buildrshq',
        description: 'Workspace web app for BuildrsHQ',
        language: 'TypeScript',
        private: true,
        url: 'https://github.com/buildrshq/buildrs-web',
        defaultBranch: 'main',
        stars: 12,
        forks: 2,
        openIssues: 3,
      }],
    });
  }
  if (/^\/api\/github\/repos\/[^/]+\/[^/]+\/(branches|commits|issues|pulls)$/.test(pathname)) {
    const key = pathname.split('/').pop();
    return success({ [key]: key === 'branches' ? [{ name: 'main' }, { name: 'agent/fix-project-progress' }] : [] });
  }
  if (/^\/api\/github\/repos\/[^/]+\/[^/]+$/.test(pathname)) return success({ repository: { name: 'buildrs-web', owner: 'buildrshq', default_branch: 'main' } });
  if (pathname === '/api/github-advanced/pull-request') return success({ pullRequest: { number: 248, state: 'open' } });

  if (pathname === '/api/v1/specs' && method !== 'GET') return success({ spec: specFixtures[0] });
  if (pathname === '/api/v1/specs' || /^\/api\/v1\/specs\/project\/[^/]+$/.test(pathname)) return success({ specs: specFixtures });
  if (pathname === '/api/v1/specs/verify') return success({ verified: true, checks: [] });
  if (pathname === '/api/v1/specs/drift-report') return success({ report: { drift: [] } });
  if (/^\/api\/v1\/specs\/[^/]+$/.test(pathname)) return success({ spec: specFixtures[0] });

  if (/^\/api\/mcp\/company\/[^/]+$/.test(pathname)) return success({ servers: [{ _id: 'demo-mcp', name: 'Buildrs tools', status: 'connected', tools: ['search_specs', 'read_file', 'create_task'] }] });
  if (pathname === '/api/mcp' && method !== 'GET') return success({ server: { _id: 'demo-mcp', name: 'Buildrs tools', status: 'connected' } });
  if (pathname === '/api/mcp') return success({ servers: [{ _id: 'demo-mcp', name: 'Buildrs tools', status: 'connected', tools: ['search_specs', 'read_file', 'create_task'] }] });
  if (/^\/api\/mcp\/[^/]+\/probe$/.test(pathname)) return success({ status: 'connected', tools: 3 });
  if (/^\/api\/mcp\/[^/]+$/.test(pathname)) return success({ deleted: true });

  if (pathname === '/api/ai-pair/sessions' || pathname === '/api/v1/agent/sessions') {
    return success({ sessions: [{ ...agentSessionFixture }] });
  }
  if (pathname === '/api/ai-pair/providers') return success({ providers: [{ id: 'groq', name: 'Groq', available: true }, { id: 'gemini', name: 'Gemini', available: true }] });
  if (pathname === '/api/v1/agent/delegate' || pathname === '/api/v1/agent/approve' || pathname === '/api/v1/agent/reject' || pathname === '/api/v1/agent/tweak') {
    return success({ execution: { id: 'demo-agent-session', status: 'awaiting_review' } });
  }
  if (/^\/api\/v1\/agent\/status\//.test(pathname)) return success({ execution: { status: 'awaiting_review', summary: 'Changes are ready for review.', terminalLog: [] } });
  if (/^\/api\/v1\/agent\//.test(pathname)) return success({ execution: { status: 'running' } });
  if (pathname === '/api/ai-pair/session') return success({ session: { _id: 'demo-agent-session', title: 'Project progress improvements' } });
  if (pathname === '/api/ai-pair/chat') return success({ message: 'I reviewed the project progress logic and prepared a safe fix.' });
  if (/^\/api\/ai-pair\/session\/[^/]+$/.test(pathname)) return success({ session: { _id: 'demo-agent-session', messages: [] } });

  if (pathname === '/api/code-editor/files') return success({ files: fileFixtures });
  if (/^\/api\/code-editor\/files\/[^/]+\/collaborators$/.test(pathname)) return success({ collaborators: memberFixtures });
  if (pathname === '/api/code-editor/languages') return success({ languages: ['JavaScript', 'TypeScript', 'JSON', 'Markdown'] });
  if (/^\/api\/code-editor\/files\/[^/]+$/.test(pathname)) return success({ file: { ...fileFixtures[0], content: 'export function getProgress(completed, total) {\\n  return total ? completed / total : 0;\\n}' } });
  if (pathname === '/api/github/repos/buildrshq/buildrs-web/git/tree') return success({ tree: fileFixtures.map((file) => ({ path: file.path, type: 'blob' })) });
  if (/^\/api\/github\/repos\/[^/]+\/[^/]+\/git\/tree$/.test(pathname)) return success({ tree: fileFixtures.map((file) => ({ path: file.path, type: 'blob' })) });
  if (pathname === '/api/git/status/demo-workspace' || /\/api\/git\/status\//.test(pathname)) return success({ branch: 'main', changes: [], clean: true });
  if (/\/api\/git\/diff\//.test(pathname)) return success({ diff: '+ return total ? completed / total : 0;' });
  if (pathname.startsWith('/api/git/')) return success({ branch: 'main', committed: true, changes: [] });
  if (pathname === '/api/sandbox/start') return success({ sandbox: { id: 'demo-sandbox', status: 'running' } });
  if (pathname === '/api/agent-confirmation/pending') return success({ confirmations: [] });
  if (pathname === '/api/agent-confirmation/respond') return success({ success: true });

  if (pathname === '/api/meetings/ice-config') return success({ iceServers: [] });
  if (pathname === '/api/meetings') return success({ meetings: [{ _id: 'demo-meeting', title: 'Daily standup', scheduledAt: new Date(Date.now() + 3600000).toISOString(), attendees: memberFixtures }] });
  if (/^\/api\/meetings\/[^/]+\/leave$/.test(pathname)) return success({ success: true });
  if (pathname === '/api/company/create') return success({ company: companyFixture });
  if (pathname === '/api/ai-context/team-conventions' && method !== 'GET') return success({ convention: { _id: 'demo-convention-new', title: 'New convention', content: '' } });
  if (/^\/api\/ai-context\/team-conventions\/[^/]+$/.test(pathname)) {
    return success({ conventions: [
      { _id: 'demo-convention-1', title: 'Keep UI components small', content: 'Prefer focused components and reusable design tokens.', category: 'Code style', updatedAt: now() },
      { _id: 'demo-convention-2', title: 'Protect async states', content: 'Cover loading, empty, and error states in every data view.', category: 'Reliability', updatedAt: now() },
    ] });
  }
  if (/^\/api\/pipelines\/company\/[^/]+\/runs$/.test(pathname)) {
    return success({ runs: [{ _id: 'demo-pipeline-run', pipelineId: 'demo-pipeline', status: 'success', branch: 'main', startedAt: now(), duration: 42 }] });
  }
  if (/^\/api\/pipelines\/company\/[^/]+$/.test(pathname)) {
    return success({ pipelines: [{ _id: 'demo-pipeline', name: 'Build and test', repository: 'buildrshq/buildrs-web', branch: 'main', status: 'active', stages: [{ name: 'Install', command: 'npm ci' }, { name: 'Test', command: 'npm test' }, { name: 'Build', command: 'npm run build' }] }] });
  }
  if (pathname === '/api/pipelines' && method !== 'GET') return success({ pipeline: { _id: 'demo-pipeline', name: 'Build and test', status: 'active' } });
  if (/^\/api\/pipelines\/[^/]+\/run$/.test(pathname)) return success({ run: { _id: 'demo-pipeline-run', status: 'running' } });
  if (/^\/api\/pipelines\/[^/]+$/.test(pathname)) return success({ pipeline: { _id: 'demo-pipeline', name: 'Build and test', status: 'active' }, deleted: true });
  if (pathname === '/api/audit-logs/company/demo-company' || pathname.startsWith('/api/audit-logs/company/')) {
    return success({ logs: [
      { _id: 'audit-1', action: 'agent.approved', description: 'Agent changes approved and merged', user: 'Alex Morgan', createdAt: now() },
      { _id: 'audit-2', action: 'integration.connected', description: 'GitHub integration connected', user: 'Alex Morgan', createdAt: now() },
    ], auditLogs: [] });
  }
  if (pathname === '/api/deployments') return success({ deployments: [{ _id: 'demo-deploy', environment: 'production', status: 'success', branch: 'main', createdAt: now() }] });
  if (/^\/api\/deployments\/[^/]+$/.test(pathname)) return success({ deleted: true });
  if (pathname === '/api/support/agent/login') return success({ agent: { id: 'demo-support-agent', name: 'Buildrs Support' }, token: 'demo-only' });
  if (pathname === '/api/support/agent/tickets') return success({ tickets: [{ _id: 'demo-ticket', ticketId: 'BR-204', subject: 'Help connecting a repository', status: 'open', priority: 'medium', customer: { name: 'Taylor Reed', email: 'taylor@example.com' }, createdAt: now(), messages: [] }] });
  if (/^\/api\/support\/agent\/tickets\/[^/]+\/(status|assign)$/.test(pathname)) return success({ updated: true });
  if (/^\/api\/support\/tickets\/[^/]+\/messages$/.test(pathname)) return success({ message: { content: 'Thanks for reaching out.' } });
  if (pathname === '/api/support/tickets') {
    if (method === 'POST') {
      return success({
        ticketId: 'demo-ticket',
        referenceNumber: 'BH-10428',
        ticket: { ticketId: 'demo-ticket', referenceNumber: 'BH-10428' },
      });
    }
    return success({ tickets: [] });
  }
  if (pathname === '/api/support/agent/logout') return success({ success: true });
  if (pathname === '/api/auth/delete-account') return success({ success: true });
  if (pathname === '/api/invitations') return success({ invitation: { id: 'demo-invitation' } });

  if (/^\/api\/v1\/billing\//.test(pathname)) {
    const periodEnd = new Date(Date.now() + 19 * 86400000).toISOString();
    return success({
      subscription: {
        tier: 'team_standard',
        status: 'active',
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        paymentProvider: 'stripe',
        usage: {
          credits: { used: 640, limit: 1000 },
          computeHours: {
            used: 38,
            limit: 100,
            overageHours: 0,
            overageAmountMinor: 0,
            overageEnabled: false,
            overageCapMinor: 5000,
            overageRateMinorPerHour: 100,
          },
        },
        isFree: false,
      },
      state: {
        tier: 'team_standard',
        status: 'active',
        phase: 'active',
        isTrialing: false,
        isPaid: true,
        isFree: false,
        canCancel: true,
        canResume: false,
        nextBillingDate: periodEnd,
        paymentProvider: 'stripe',
        usage: {
          credits: { used: 640, limit: 1000 },
          computeHours: {
            used: 38,
            limit: 100,
            overageHours: 0,
            overageAmountMinor: 0,
            overageEnabled: false,
            overageCapMinor: 5000,
            overageRateMinorPerHour: 100,
          },
        },
      },
    });
  }
  if (pathname === '/api/profile' || pathname === '/api/profile/picture') return success({ user: { fullName: 'Alex Morgan', name: 'Alex Morgan', role: 'Workspace Admin' } });

  throw new Error(`No demo response configured for ${method} ${pathname}`);
}
