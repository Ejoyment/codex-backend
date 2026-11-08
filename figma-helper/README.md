# Buildrs Figma Helper

A tiny Manifest V3 browser extension that makes a connected user's Figma
designs appear on the Buildrs **Figma** page automatically.

There are no links to paste and no Buildrs plugin to run inside a Figma file.

## Why this exists

Figma's public REST API cannot list the files a user can open:

- `GET /v1/me` returns only the user's id, handle and email.
- `GET /v1/teams` is POST-only (create a team).
- Every folder/file listing endpoint requires a team or folder id that Figma
  never exposes programmatically.

Figma's own web app does show a **recent files** list. This helper reads that
list from a signed-in `figma.com` tab using the user's existing Figma session,
then sends only the file keys, names, thumbnails and modified dates to Buildrs.

## Install (unpacked)

1. Download and unzip `buildrs-figma-helper.zip`.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the unzipped `figma-helper` folder.
5. Open Buildrs, sign in, and visit the **Figma** page once. This links the
   helper to your Buildrs account.
6. Make sure a `figma.com` tab is open and signed in.
7. Click the Buildrs Figma Helper icon and choose **Sync now**.

Your recent Figma designs appear on the Buildrs Figma page. After that the
helper re-syncs every 15 minutes and whenever you ask from the popup or the
Buildrs Figma page.

## How it works

```
Buildrs page (content script)
  └─ reads localStorage.authToken + localStorage.buildrsApiBase
     └─ background service worker
        ├─ opens/finds a www.figma.com tab
        ├─ same-origin fetch: /api/recent_files?org_id=null
        │  (uses the user's own Figma cookies)
        └─ POST <apiBase>/api/figma/files/sync
           Authorization: Bearer <Buildrs JWT>
```

- The Buildrs JWT is stored in `chrome.storage.local` and only used to call the
  sync endpoint.
- Figma cookies never leave the browser.
- File contents are never downloaded; Buildrs later reads frames with the
  user's own Figma OAuth token when they open a design.

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
