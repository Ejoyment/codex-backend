# Backend Work Needed for the Editor

This file lists what the server side needs and why. Written in plain language - no jargon.
Checked again after the latest main-branch merge: several endpoints that were
missing before now exist. Only the items marked NEEDS WORK below still need the
backend person.

---

## 6. Emails going to spam - NEEDS WORK (Resend domain config)

The `from` address in all emails uses `onboarding@resend.dev` (Resend's default
domain). This is the #1 reason emails land in spam. Fix:

1. Go to https://resend.com/domains
2. Add your domain (e.g. `buildrshq.dev`)
3. Add the DNS records Resend gives you (SPF, DKIM, DMARC)
4. Update `EMAIL_FROM` in `.env` to use your verified domain:
   `EMAIL_FROM=BuildrsHQ <noreply@buildrshq.dev>`

Until this is done, most email providers will treat these as spam.

---

## 1. AI Helper - editor side done, one page still broken (NEEDS WORK)

The editor's AI chat now uses the two endpoints that DO exist and work:

- `POST /api/ai-pair/session` - starts a chat session (exists)
- `POST /api/ai-pair/chat` - sends a message and gets a reply (exists)

Still broken: the separate AI Pair page (`pages/ai-pair.js`, line 142) still
calls `POST /api/ai-pair/message`, which does NOT exist anywhere on the server.
Either add that endpoint or switch that page to `/api/ai-pair/chat` like the
editor.

---

## 2. Version Control (Git) - no backend work needed

The editor previously called git endpoints without telling the server which
workspace it was talking about, so every git call failed.

Every real git endpoint needs a `workspaceId` (the workspace/company ID). This PR
now looks up the user's current company and sends its ID, so these now work:

- `GET /api/git/status/:workspaceId` - current git status (already exists)
- `POST /api/git/commit` - commit changes (already exists, needs workspaceId)
- `POST /api/git/push` - push (already exists, needs workspaceId)
- `POST /api/git/pull` - pull (already exists, needs workspaceId)

Note: git only works once the user is in a workspace. The UI now shows a clear
message if no workspace is selected.

---

## 3. Terminal - NEEDS WORK (one endpoint missing)

`POST /api/terminal/execute` does NOT exist. The terminal handles help, clear,
ls, pwd and git status on its own, and anything else currently comes back as an
error in the terminal window.

Important context for the backend person: the server already runs terminals over
live socket messages (`terminal:create` / `terminal:input` in `server.js`), not
over a normal REST address. So there are two options: add a simple
`POST /api/terminal/execute` that takes `{ command, fileId }` and returns
`{ output }`, or tell us to switch the editor's terminal to the socket messages.
Either way only allow safe, read-only commands.

---

## 4. Deployments - no backend work needed (already exists)

Good news: `GET /api/deployments`, `POST /api/deployments` and
`DELETE /api/deployments/:id` all exist in `routes/deployments.js` and are
connected in `server.js`. The editor's calls match what the server expects
(`projectId`, `subdomain`, `companyId`).

Two things the backend person should know:
- Deploying needs a project selected in the Files panel, not just a file.
- If deploys fail with "Deployment backend is not configured", the server is
  missing its `DEPLOY_SSH_HOST` and `DEPLOY_SSH_KEY` settings. That is a server
  setup issue, not a code bug.

---

## 5. Sandbox - NEEDS WORK (one-line fix)

`POST /api/sandbox/start` exists in `routes/sandbox.js` and returns exactly
what the editor expects (`{ sandboxUrl }`), BUT it is never connected in
`server.js`, so calls to it get a 404. The fix is one line in `server.js`:

```js
app.use('/api/sandbox', sandboxRoutes);
```

(with `const sandboxRoutes = require('./routes/sandbox');` at the top).
After that the Sandbox tab should work with no frontend changes.

---

## Summary for the backend person

| # | Item | Status | What to do |
|---|------|--------|------------|
| 1 | AI Pair page (`pages/ai-pair.js:142`) calls missing `POST /api/ai-pair/message` | Needs work | Add the endpoint, or switch the page to working `/api/ai-pair/chat` |
| 2 | Sandbox 404 | Needs work | One line: connect `routes/sandbox.js` in `server.js` |
| 3 | Terminal commands beyond help/ls/pwd | Needs work | Add `POST /api/terminal/execute`, or tell us to use the socket terminal messages |
| 4 | Deployments | OK already | Nothing, unless 503 appears (then set server SSH settings) |
| 5 | Git, AI chat in editor, file tree, collaborators | OK already | Nothing |
