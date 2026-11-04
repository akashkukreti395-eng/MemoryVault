MEMORYVAULT MOTION COMPONENTS — INSTALLATION

This is an additive patch intended for the current MemoryVault Vault Core source.
It does NOT replace index.html, app.js, server.js, or your database.

Files:
- motion-components.css — cinematic vault intro styling, reusable reveal/hover components, dashboard/admin entry choreography, progress rail.
- motion-components.js — observes public landing, signed-in dashboard, admin dashboard, and dynamically rendered memory/admin cards. Includes reduced-motion support and restrained desktop pointer depth.

Install:
1. Back up your current project.
2. Copy both files into the project root (same folder as index.html).
3. In index.html, inside <head>, immediately AFTER the existing style.css link, add:
   <link rel="stylesheet" href="motion-components.css">
4. At the very bottom of index.html, immediately AFTER the existing app.js script, add:
   <script src="motion-components.js"></script>
5. Save, restart the local server, and hard-refresh with Ctrl+Shift+R.

Do not replace your current index.html or app.js with files from this patch.
Do not copy .env, database files, or credentials.

Test:
- Intro: let the vault materialize; click Enter MemoryVault; test Replay Intro.
- Public page: scroll How It Works, Features, memory preview, and CTA.
- Signed-in user dashboard: verify header, stat cards, create-memory card, archive and memory cards animate.
- Admin dashboard: verify page heading, metric cards, panels, account cards, memory inspector, pagination and dynamically loaded content.
- Login/register: ensure forms remain readable and work.
- Check a mobile viewport and reduced-motion setting.

No code has been pushed to GitHub or deployed to Render.
