# Send to Buildrs — Figma plugin

Sends the open Figma file and the selected frames to a Buildrs workspace, where
they can be converted to code or linked to tasks for AI agents.

## Install (development / private use)

1. Download `buildrs-figma-plugin.zip` from the Buildrs Figma page (or use this
   folder directly) and unzip it.
2. In the Figma desktop app: **Plugins → Development → Import plugin from
   manifest…** and choose `manifest.json`.
3. In Buildrs open **Figma → Figma plugin → Generate token**, then run
   **Plugins → Development → Send to Buildrs** and paste the token.

## Notes

- The plugin authenticates with a Buildrs plugin token (`bfp_…`). Design data
  is fetched by the Buildrs backend with the user's own Figma OAuth
  connection, so Figma must also be connected in Buildrs.
- `figma.fileKey` is only exposed to private plugins, so the Community plugin
  asks for the file link once and stores the key on the document
  (`setPluginData`), or in the user's client storage for view-only files.
- To publish to the Figma Community, follow `PUBLISHING.md`.
- The API origin is set in `ui.html` (`API_BASE`) and must also be listed in
  `manifest.json` → `networkAccess.allowedDomains`.
- After editing, rebuild the downloadable zip with
  `npm run build:figma-plugin` from the repository root.
