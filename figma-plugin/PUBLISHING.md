# Publishing "Send to Buildrs" to the Figma Community

Figma reviews every Community plugin (usually within 5–10 business days). Do
the checks in "Before submitting" first; review fails if the plugin cannot be
used end to end.

## Before submitting

1. **The Figma OAuth app must work for any Figma user.** In
   <https://www.figma.com/developers/apps>, open the Buildrs OAuth app and make
   sure it is published or publicly usable. Then sign in to Buildrs with a
   second Figma account (not the app owner) and connect Figma. If Figma refuses
   the connection for other accounts, publish/submit the OAuth app first:
   the plugin depends on it.
2. **Backend and frontend are deployed** from `main`, so `/figma` shows the
   "Figma plugin" card and `POST /api/figma/plugin/push` exists.
3. **Two-factor authentication** is enabled on the Figma account that will
   publish (Figma requires it to publish).
4. **Test it as a development plugin** in Figma desktop
   (Plugins → Development → Import plugin from manifest → `manifest.json`):
   generate a token, paste it, link a file, select frames, Send.

## Get the plugin ID

Done: `manifest.json` uses the Figma-issued ID `1701018943863600939`. To
re-issue an ID (for example for a separate staging plugin):

1. Figma desktop → **Plugins → Development → New plugin…** → choose
   *Figma design* → *Default/empty* → name it **Send to Buildrs** → save it
   anywhere. Open the generated `manifest.json` and copy its numeric `"id"`.
2. Put that value in `figma-plugin/manifest.json` → `"id"`.
3. Rebuild the download: `npm run build:figma-plugin`, commit, push.
4. Delete the throwaway plugin folder and, in Figma, re-import
   `figma-plugin/manifest.json` (Plugins → Development → Import plugin from
   manifest) so the development plugin uses the new ID.

If the publish dialog later offers a different ID, use that one instead and
repeat step 3.

## Submit

Figma desktop → **Plugins → Development → Manage plugins in development** →
**Send to Buildrs** → **⋯ → Publish**. Fill in:

| Field | Value |
| --- | --- |
| Icon (128×128) | `figma-plugin/assets/icon-128.png` |
| Cover / thumbnail (1920×1080) | `figma-plugin/assets/cover-1920x1080.png` |
| Name | Send to Buildrs |
| Tagline | Turn selected frames into code and AI coding tasks in Buildrs |
| Category / tags | Development, Code, Handoff, AI |
| Support contact | Your support email (or `https://buildrshq.dev/support`) |
| Publish to | Community (public) |
| Network access | Already declared in the manifest: `codex-backend-7utu.onrender.com` |

### Description

> Send your Figma designs straight to Buildrs.
>
> Select one or more frames and click **Send to Buildrs**. The file and
> frames appear in your Buildrs workspace, where you can:
>
> • Convert any frame to React, React + Tailwind, or HTML/CSS
> • Create a task linked to the exact frame
> • Delegate the task to a Buildrs AI agent that codes to the design —
>   layout, spacing, colors, typography and copy
>
> **Setup (one time):** sign up at buildrshq.dev, connect Figma, open
> **Figma → Figma plugin → Generate token** and paste the token into the
> plugin. The first time you send a file, paste its link (Share → Copy link)
> so Buildrs knows which file it is.

### Data & privacy answers

- **What data leaves Figma?** The file key (from the link the user pastes),
  the document name, and the id/name/type/size/page of the selected layers.
  Design contents are then read by the Buildrs backend through the user's own
  Figma OAuth connection.
- **Where is it sent?** Only `https://codex-backend-7utu.onrender.com`.
- **Authentication:** a per-user Buildrs plugin token kept in Figma client
  storage; only its SHA-256 hash is stored server-side. Users can revoke it
  in Buildrs at any time.
- **Privacy policy:** `https://buildrshq.dev/privacy`

### Notes for the reviewer

Paste something like this into the review notes, with a real test account:

> To test: sign in at https://buildrshq.dev with
> `<reviewer test email>` / `<password>` (Figma is already connected to a
> test Figma account). Open **Figma** in the sidebar → **Figma plugin** →
> **Generate token**, paste the token into the plugin, paste this file's link
> when asked, select a frame and click **Send to Buildrs**. The frame then
> appears on the Buildrs Figma page.

Create that reviewer account in Buildrs before submitting and connect Figma on
it, so the reviewer does not need their own Figma OAuth consent to test.

## After approval

1. Copy the Community URL
   (`https://www.figma.com/community/plugin/<id>/send-to-buildrs`).
2. Set `NEXT_PUBLIC_FIGMA_PLUGIN_URL` to it in the frontend environment
   and redeploy. The Buildrs Figma page then shows
   **Install from Figma Community** instead of the zip download.
3. For updates: bump nothing in the manifest — change the code, then
   **Manage plugins in development → Publish new version**.
