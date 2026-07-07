# Changelog

`@yuneta/gobj-js` — the GObject-JS runtime (JavaScript port of the C GObject
kernel). Versioned to track `YUNETA_VERSION`; a gobj-js-only patch may move
ahead of the SDK version between releases.

## 7.7.0

Developer-tooling hooks for the gobj-ui dev monitor (all additive, backwards
compatible; consumed locally by gui_agent / gui_treedb, needed by gobj-ui 2.2.0).

- **`set_log_callback(fn)`** — an optional global sink that receives every
  framework log line (`log_error` / `log_warning` / `log_info` / `log_debug` /
  `trace_msg`, called as `(level, msg, hora)`) IN ADDITION to the browser
  console. Lets a GUI mirror the console (and, since the automata trace runs
  through `log_debug`, the FSM transitions) inside the app. `null` (default)
  leaves behaviour unchanged.
- **`gobj_set_trace_machine_format(0|1)` / `gobj_trace_machine_format()`** —
  mirror the C kernel's `trace_machine_format`: `1` switches the FSM trace to the
  compact one-liner `🔄 EVENT dst STATE from src` (no return line); `0` (default)
  keeps the verbose `mach(gclass^name), st:…, ev:…, ac:…, from(…)` + return line.
  `tab()` nesting indentation is unchanged, so it reads like C.
- **`trace_json` routed to the log sink.** `trace_json` now also emits via the
  log callback (level `"json"`, the raw payload) so a sink can pretty-print it —
  e.g. the event `kw` dumped by the verbose automata trace. `console.dir` still
  goes only to the browser console. (`emit_log_callback` passes payloads
  unchanged; text levels already pass a string.)

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
