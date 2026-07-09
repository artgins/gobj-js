# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## ⚠️ First step: read the yunetas CLAUDE.md

**Before doing anything in this repo, read the yunetas SDK's `CLAUDE.md`.**
This repo is normally checked out as the `kernel/js/gobj-js` git submodule of
yunetas, so it lives at `/yuneta/development/yunetas/CLAUDE.md` (standalone
clone: `github.com/artgins/yunetas`, `CLAUDE.md` at the root). It carries the
framework-wide rules that also govern this codebase: always-braces, no silent
errors, gobj-js gotchas, gclass skeletons and subscription models (CHILD vs
SERVICE), JS GUI conventions, and the submodule/release flow. This file only
adds the gobj-js-specific layer on top.

## This repo in the yunetas ecosystem

- `@yuneta/gobj-js` — the GObject-JS runtime, published to npm, versioned in
  lockstep with `YUNETA_VERSION` (a gobj-js-only patch may move ahead between
  SDK releases).
- Single line on `main`. To ship: bump `package.json`, commit on `main`,
  `npm publish`, then **bump the `kernel/js/gobj-js` submodule pointer in
  yunetas**.
- Local `file:` consumers (wattyzer, `yunos/js/*`) resolve this checkout at
  its submodule path; estadodelaire/hidraulia consume the npm package.
- Validate any change with `npm install && npm run build && npm test`.
