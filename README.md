# BuildrsHQ

**The developer workspace that replaces your scattered toolchain with one place to code, collaborate, and ship.**

---

## What is this?

BuildrsHQ is an AI-powered development platform built for real teams. Instead of jumping between GitHub, Slack, ChatGPT, Notion, Figma, and five other tabs, everything lives in one workspace: your code, your conversations, your tasks, your AI assistant, and your design handoffs.

It’s the tool we wished existed while building distributed products, so we built it.

---

## Why does this exist?

Modern development is fragmented. Here’s the reality most teams accept:

- **Context switching is constant.** A single feature can require GitHub for PRs, Slack for reviews, Notion for specs, Figma for designs, and a separate AI chat for debugging. Each handoff costs time and introduces errors.
- **AI doesn’t know your project.** ChatGPT is smart, but it has no idea what your codebase looks like, what your team decided yesterday, or which PRs are blocked. You end up copy-pasting context back and forth.
- **Remote collaboration is bolted on.** Tools like VS Code Live Share exist, but they’re disconnected from project management, meetings, and the rest of your workflow.

BuildrsHQ fixes this by putting the full development lifecycle in one place: editor, AI pair programmer, team chat, video standups, project tracking, and direct integrations with the tools you already use.

---

## Who is it for?

- **Solo developers** who want an AI pair programmer that actually understands their code
- **Startups and small teams** (2–50 people) who need real-time collaboration without the overhead of five different tools
- **Mid-market and enterprise teams** (50+) that need role-based permissions, audit logs, SSO, and SOC 2-ready infrastructure
- **Freelancers and students** who need a free, capable environment to build and learn

---

## What can you actually do with it?

### Code with an AI that knows your project
The built-in AI pair programmer doesn’t just autocomplete. It reads your repositories, understands your stack, and helps with debugging, refactoring, and implementation. You can open a session on a specific repo, ask questions about the codebase, and get suggestions tied to real files.

### Collaborate in real time
Multiple people can edit the same codebase at the same time. You’ll see live cursors, presence indicators, and changes sync instantly via CRDT—no merge conflicts, no “I’m editing that file,” no refreshing.

### Manage work without leaving the editor
Create projects, break them into tasks, assign priorities, and track progress. Everything connects back to the code and the team. If a task is tied to a PR, a commit, or a discussion, that context stays attached.

### Meet and chat inside the workspace
Persistent team messaging, threaded conversations, and video meetings are all native. No need to switch to Slack or Zoom for standups and design reviews. Meetings are tied to projects, and participants can jump straight into the shared editor from the call.

### Connect the tools you already use
BuildrsHQ integrates with:
- **GitHub** — repos, PRs, issues, commits
- **Slack** — notifications and threaded discussions
- **Discord** — community and team sync
- **Notion** — documentation and knowledge base
- **Figma** — design files and handoff context

More platforms are on the roadmap.

### Run code, terminals, and LSP features in the browser
You don’t need a local dev environment to be productive. The in-browser terminal, LSP integration, virtual file system, and code search mean you can go from idea to running code without leaving the browser.

### Ship with enterprise confidence
For larger teams, there’s role-based access control, company-level project isolation, audit logs, support ticketing with AI triage, SSO, and SOC 2-ready infrastructure. Payments are handled through Stripe, Paystack, and Flutterwave, so teams in Africa, Europe, and the US can subscribe in their local currency.

---

## How is it built?

The backend is an Express.js API with Socket.IO for real-time features, MongoDB for persistence, and Passport.js for OAuth. The frontend is a Next.js app styled with Tailwind and built around a shared workspace shell. AI capabilities are powered by Groq and Google Generative AI, with a modular provider layer so we can swap or add models over time.

Real-time collaboration uses Yjs for conflict-free replicated data types, which is what makes simultaneous editing actually reliable. The editor layer, terminal, and LSP server are all wired into the same session so the experience feels like a native IDE running in the cloud.

---

## Getting started

### Prerequisites
- Node.js 18+
- MongoDB
- Redis (optional, for production sessions)

### Backend

```bash
cd /Users/mac/codex-backend
npm install
cp .env.example .env
# fill in your config
npm run dev
```

### Frontend

```bash
cd /Users/mac/codex-backend/buildrs-frontend
npm install
npm run dev
```

Open `http://localhost:3001` and sign in. The frontend proxies API requests to the backend, so make sure both are running.

---

## Environment variables

The backend needs a few things configured. The minimum set:

- `MONGODB_URI` — your database connection
- `JWT_SECRET` — signing key for auth tokens
- `RESEND_API_KEY` and `EMAIL_FROM` — email verification and notifications
- `FRONTEND_URL` — CORS and OAuth redirects
- `GROQ_API_KEY` and `AI_PROVIDER` — AI pair programming
- OAuth client IDs/secrets for GitHub, Discord, Slack, Notion, and Figma
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` — billing (or Paystack/Flutterwave equivalents)

A full list is in `.env.example`.

---

## Project structure

```
/Users/mac/codex-backend
├── server.js                  # Express app + Socket.IO bootstrap
├── routes/                    # REST API endpoints
│   ├── auth.js                # signup, signin, profile, OAuth
│   ├── dashboard.js           # aggregated workspace data
│   ├── projects.js            # local projects + standalone tasks
│   ├── meetings.js            # meeting rooms and scheduling
│   ├── integrations.js        # OAuth connect/disconnect
│   ├── github-api.js          # GitHub proxy endpoints
│   ├── ai-pair.js             # AI pair programming sessions
│   ├── collaboration.js       # real-time collaboration APIs
│   └── ...
├── models/                    # Mongoose schemas
│   ├── User.js
│   ├── LocalProject.js
│   ├── LocalTask.js
│   ├── TeamProject.js
│   ├── TeamTask.js
│   ├── MeetingRoom.js
│   ├── Integration.js
│   └── ...
├── middleware/                 # auth, trial enforcement, rate limits
├── utils/                     # Socket.IO namespaces, email, billing
├── config/                    # Passport, Stripe, Swagger, etc.
├── tests/                     # Jest + Supertest coverage
├── buildrs-frontend/          # Next.js workspace app
│   ├── pages/
│   │   ├── dashboard.js       # main workspace command center
│   │   ├── tasks.js
│   │   ├── meetings.js
│   │   ├── editor.js
│   │   └── ...
│   ├── components/            # shared UI
│   ├── hooks/                 # useDashboard, useCurrentCompany, etc.
│   ├── lib/                   # API client, security helpers, utils
│   ├── store/                 # Zustand auth store
│   └── styles/                # workspace design system + globals
└── frontend/                  # legacy static frontend assets
```

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│                    BuildrsHQ Frontend                │
│                 (Next.js + Tailwind)                 │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS / WSS
┌───────────────────────▼─────────────────────────────┐
│                    Express Backend                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ REST API    │  │ Socket.IO   │  │  OAuth      │  │
│  │ (50+ routes)│  │ Namespaces  │  │  Proxies    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │         │
│  ┌──────▼────────────────▼────────────────▼──────┐  │
│  │              Mongoose / MongoDB                 │  │
│  │   24 models: users, projects, tasks, meetings, │  │
│  │   integrations, subscriptions, support, etc.   │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
        │                   │                   │
   GitHub API           Stripe/Paystack      Groq / Google AI
```

Real-time features (collaboration, messaging, meetings, support) run over Socket.IO namespaces. REST endpoints handle everything else. The frontend is server-rendered with Next.js but behaves like a modern SPA inside the workspace pages.

---

## Running tests

```bash
npm test
```

Uses Jest with Supertest. Coverage is collected across routes, models, middleware, and config.

---

## API documentation

There’s a Swagger UI available in development and a full markdown reference in `API_DOCUMENTATION.md`. The backend also exposes `/api-docs` when running.

---

## Contributing

This is a private codebase, but if you’re reading this and want to help:

1. Pick an issue or propose a change
2. Keep changes focused and consistent with the existing workspace design system
3. Run the linter and tests before opening a PR
4. Describe what you changed and why, not just what you changed

---

## License

Proprietary — CODEX INC / BuildrsHQ. All rights reserved.

