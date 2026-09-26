# Backend Work Needed for the Editor

This file lists what the server side needs and why. Written in plain language - no jargon.
The frontend editor page has been updated so its buttons no longer crash, but a few
features can't actually work until the server endpoints below are created.

The editor calls these endpoints. For each one this says whether it exists today,
and if not, why it is needed and what the server should return.

---

## 1. AI Helper - NOW FIXED (no backend work needed)

The editor previously called a URL that did not exist on the server
(`POST /api/ai-pair/message`). This has been fixed in this PR to use the two
endpoints that DO exist and work:

- `POST /api/ai-pair/session` - starts a chat session (already exists)
- `POST /api/ai-pair/chat` - sends a message and gets a reply (already exists)

Same problem exists on the separate AI Pair page (`pages/ai-pair.js`, line 142)
which still calls `POST /api/ai-pair/message`. That page was NOT changed in this
PR. It should be switched to `/api/ai-pair/chat` too, exactly like the editor.

---

## 2. Version Control (Git) - NOW FIXED (no backend work needed)

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

## 3. Terminal - NEEDS BACKEND WORK

The editor used to call `POST /api/terminal/execute`. This endpoint does NOT exist
anywhere in the server code.

Why it is needed: the "Terminal" tab should let the user run commands. Right now
the terminal can only handle a few simple local tricks (help, clear, ls, pwd,
git status) and shows a friendly message for everything else.

What the server should do:
- `POST /api/terminal/execute` which accepts a `{ command, fileId }` body and
  runs the command, returning `{ output }`. Follow the same style as the existing
  terminal routes in `routes/terminal.js`.
- Safety: only allow safe, read-only commands (no `rm`, no shell operators), and
  only run inside the user's workspace folder.

---

## 4. Deployments - NEEDS BACKEND WORK

The editor used to call `GET /api/deployments` and `POST /api/deployments`. NEITHER
of these endpoints exists anywhere in the server code.

Why it is needed: the "Deployments" tab is supposed to list a user's deployments
and let them deploy the current file. Right now the buttons just show a message
that deployments aren't enabled yet.

What the server should do:
- `GET /api/deployments` - return the list of deployments for the logged-in user:
  `{ deployments: [...] }` with fields like id, status, createdAt.
- `POST /api/deployments` - accept `{ fileId }` and start a deployment, returning
  `{ deployment }`. At minimum it can create a record with status "pending" and
  update it to "success" later. Needs a database collection to store them.

---

## 5. Sandbox - NEEDS BACKEND WORK

The editor used to call `POST /api/sandbox/start`. This endpoint does NOT exist
anywhere in the server code.

Why it is needed: the "Sandbox" tab is supposed to start a live preview of the
code running in an iframe. Right now the button just shows a message that the
sandbox isn't enabled yet.

What the server should do:
- `POST /api/sandbox/start` - accept `{ fileId }` and return a URL the frontend
  can show in an iframe: `{ url }` or `{ sandboxUrl }`.

Note: the backend already has some sandbox code but under a different address
(`/api/ai-pair/execute` and sandbox routes inside `routes/debug-handoff.js`).
Those are separate from what the editor's Sandbox tab needs.

---

## Summary of what to build

| Feature      | Endpoint to create                     | Why                                                  |
|--------------|----------------------------------------|------------------------------------------------------|
| Terminal     | POST /api/terminal/execute             | Lets the terminal run commands                        |
| Deployments  | GET + POST /api/deployments            | List deployments and deploy the current file          |
| Sandbox      | POST /api/sandbox/start                | Start a live preview iframe for the current code      |

Also, separately: switch `pages/ai-pair.js` off the missing `/api/ai-pair/message`
to the working `/api/ai-pair/chat` (same change already done in the editor).
