# Changelog

`@yuneta/gobj-js` — the GObject-JS runtime (JavaScript port of the C GObject
kernel). Versioned to track `YUNETA_VERSION`; a gobj-js-only patch may move
ahead of the SDK version between releases.

## 7.6.8

No gobj-js changes in this SDK release; the package stays at **7.6.7**
(published, in lockstep). The 7.6.8 SDK release is C-only — see the top-level
`CHANGELOG.md`.

## 7.6.7

- **fix(c_ievent_cli): publish `EV_ON_CLOSE` on a deliberate stop.** A
  deliberately stopped `C_IEVENT_CLI` must still emit `EV_ON_CLOSE` so
  subscribers (e.g. an SPA link) observe the disconnect and can recover the
  session, matching the C kernel contract.

## 7.6.6

- **refactor(gobj): align `gobj_current_state()` with the C kernel semantics.**
- **fix(c_ievent_cli): guard `mt_subscription_*` against a destroying gobj** —
  avoid touching a gobj that is being torn down.
- **fix(c_ievent_cli): detach WebSocket handlers on a deliberate stop** — no
  stray callbacks fire after an intentional close.

## 7.6.5

- Initial public snapshot of `@yuneta/gobj-js` (extracted to its own repository,
  `github.com/artgins/gobj-js`, single `main` line). History before this point
  was not preserved.
