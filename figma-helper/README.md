# Buildrs Figma Helper

A tiny Manifest V3 browser extension that makes your Figma designs usable in
Buildrs without pasting links and without any Figma OAuth scope.

## Why this exists

Figma's public REST API cannot list the files a user can open:

- `GET /v1/me` returns only the user's id, handle and email.
- `GET /v1/teams` is POST-only (create a team).
- Every folder/file listing endpoint requires a team or folder id that Figma
  never exposes programmatically.
- Public OAuth apps cannot request `folders:read`, and `file_content:read` is
  often missing from an existing token.

Figma's own web app can show a **recent files** list and read any file the
signed-in user can open. This helper does the same thing from a signed-in
`figma.com` tab, using the user's existing Figma session.

## What it does

1. **Sync designs.** Reads `figma.com/api/recent_files` and posts the file
   keys, names, thumbnails and modified dates to Buildrs.
2. **Open a design.** Reads the file document and returns its pages and
   top-level frames, so Buildrs can show frame cards.
3. **Read a frame.** Returns one frame's full node tree (layout, fills,
   typography, text). Buildrs stores it as a design snapshot, which is what
   code generation and AI agent tasks implement.

Only file keys, names, thumbnails, frame metadata and the selected frame's
node data are sent to Buildrs. Figma cookies never leave the browser.

## Install (unpacked)

1. Download the helper from the Figma page in Buildrs, or build it with
   `npm run build:figma-helper`.
2. Unzip it.
3. Open `chrome://extensions` in Chrome (or any Chromium browser).
4. Turn on **Developer mode**.
5. Choose **Load unpacked** and select the unzipped `figma-helper` folder.
6. Open Buildrs, sign in, and visit the **Figma** page once. This links the
   helper to your Buildrs account.
7. Keep a signed-in `figma.com` tab open, then click **Sync from Figma**.

Your designs appear as cards. Click one to browse its frames, convert a frame
to code, or send it to an agent.

## How it works

```
Buildrs page (content script)
  └─ reads localStorage.authToken + localStorage.buildrsApiBase
     └─ background service worker
        ├─ finds/opens a www.figma.com tab
        ├─ same-origin fetch with the user's Figma cookies:
        │    /api/recent_files?org_id=null      (file list)
        │    /api/files/:key                    (pages + frames)
        │    /api/files/:key/nodes?ids=:id      (one frame's subtree)
        └─ POST <apiBase>/api/figma/files/sync  (file list)

Buildrs web app
  └─ receives the selected frame from the helper
     └─ POST <apiBase>/api/figma/snapshots   (frame stored for codegen/agents)
```

- The Buildrs JWT is stored in `chrome.storage.local` and only used to call
  Buildrs endpoints.
- Figma cookies never leave the browser.
- Snapshots expire after 30 days and are replaced each time a frame is opened.

## Settings

Open the extension's **Settings** to change the Buildrs API base or web app
base. The defaults are:

- API: `https://codex-backend-7utu.onrender.com`
- Web app: `https://buildrshq.dev`

The Buildrs web app writes `localStorage.buildrsApiBase` automatically, so
normal deployments need no configuration.

## Development

The extension is plain JavaScript with no build step. Edit the files in this
folder and click **Reload** on the extension card in `chrome://extensions`.

To rebuild the downloadable zip from the repository root:

```bash
npm run build:figma-helper
```

The zip is written to
`buildrs-frontend/public/downloads/buildrs-figma-helper.zip`.
