import {
  Bot,
  Box,
  ClipboardList,
  Code2,
  Globe,
  MoreHorizontal,
  PenTool,
  Server,
  Smartphone,
  Sparkles,
} from 'lucide-react';

// Single source of truth for the guided setup: step labels, option catalogs and
// the defaults a fresh workspace starts from. The page renders whatever is here,
// so tuning the flow does not mean editing markup.

export const STEPS = ['Welcome', 'Use case', 'Primary focus', 'Setup', 'Get started'];

export const USE_CASES = [
  { id: 'web', label: 'Web app', hint: 'Sites, dashboards, full-stack apps', Icon: Globe },
  { id: 'api', label: 'API / Backend', hint: 'Services, integrations, data', Icon: Server },
  { id: 'mobile', label: 'Mobile app', hint: 'iOS, Android, cross-platform', Icon: Smartphone },
  { id: 'ai', label: 'AI agent / app', hint: 'Agents, copilots, automations', Icon: Bot },
  { id: 'prototype', label: 'Prototype / MVP', hint: 'Validate an idea fast', Icon: Box },
  { id: 'other', label: 'Other', hint: 'Something else entirely', Icon: MoreHorizontal },
];

export const FOCUS_OPTIONS = [
  { id: 'developer', label: 'Developer', hint: 'Build, debug and ship code', Icon: Code2 },
  { id: 'designer', label: 'Designer', hint: 'Shape flows and interfaces', Icon: PenTool },
  { id: 'product', label: 'Product Manager', hint: 'Plan, spec and coordinate', Icon: ClipboardList },
  { id: 'other', label: 'Other', hint: 'Still figuring the role out', Icon: Sparkles },
];

export const FOCUS_EXTRAS = {
  developer: {
    question: 'Which technologies feel familiar?',
    options: ['React', 'Next.js', 'TypeScript', 'Python', 'Node.js', 'Still exploring'],
    // Stack the recommended template uses, so step 3 already reflects it.
    defaults: ['React', 'Next.js'],
  },
  designer: {
    question: 'How do you like to bring designs to life?',
    options: ['Share design references', 'Collaborate with teammates', 'Prepare & refine specs'],
    defaults: [],
  },
  product: {
    question: 'As a Product Manager, what matters most?',
    options: ['Write requirements & specs', 'Plan & prioritize', 'Collaborate & hand off'],
    defaults: [],
  },
  other: {
    question: 'What would help you most on day one?',
    options: ['Explore the workspace', 'Bring my team in', 'See a sample project'],
    defaults: [],
  },
};

// Pre-selected answers: the setup opens on the recommended path (solo, web app,
// developer, template) rather than an empty form, and the user changes what
// does not fit instead of answering everything blind.
export const DEFAULT_ONBOARDING = {
  useMode: 'solo',
  useCase: 'web',
  focus: 'developer',
  focusExtras: FOCUS_EXTRAS.developer.defaults,
  startMode: 'template',
  nextAction: 'project',
};

// Example values shown in empty fields, so the format is obvious at a glance.
export const ONBOARDING_PLACEHOLDERS = {
  name: 'Alex Morgan',
  email: 'alex@company.com',
  invite: 'teammate@company.com',
};

export const MAX_INVITES = 8;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
