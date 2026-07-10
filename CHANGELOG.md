# Changelog

`@yuneta/gobj-js` — the GObject-JS runtime (JavaScript port of the C GObject
kernel). Versioned to track `YUNETA_VERSION`; a gobj-js-only patch may move
ahead of the SDK version between releases.

## 7.7.3

- **feat(lib_treedb): `field_desc` now carries the fkey mapping.**
  `treedb_get_field_desc()` copies `col.fkey` ({topic_name: hook_name}) into
  the returned descriptor (`fkey: null` when absent, incl. the string-spec
  branch of `template_get_field_desc()`, which cannot express a mapping).
  Lets form widgets encode/decode canonical refs ("topic^id^hook") from the
  descriptor alone, without dragging the raw schema col around (first
  consumer: gobj-ui `C_YUI_FORM` fkey fields).

- **fix(helpers): `kwid_new_dict()` no longer collapses an array to its
  last element.** Its internal `kw_get_str(kv, "id", ...)` still used the
  pre-gobj signature, so every element's id resolved to the string
  `"false"` — the whole array collapsed onto one key (a treedb desc
  passed as a C_YUI_FORM template rendered only its last column), with a
  per-element "GObj bad instanceof" + "kw must be list or dict" log
  storm.

- **fix(lib_treedb): `create_template_record()` no longer fills fields
  with `0`.** It called `kw_get_dict_value(col, "default")` with a wrong
  signature (col as gobj, "default" as kw) — every field without an explicit
  default got the error-path `0`, plus a "kw must be list or dict" +
  "GObj bad instanceof" log storm per field. Now the default is read from
  the column descriptor only when the template value is an object
  (a string spec carries no default).

## 7.7.2

- **fix(c_ievent_cli): no `TypeError` storm when a connected iev is
  stopped+destroyed in the same turn.** `mt_stop` closes the websocket
  (nulling `priv.websocket`) but the FSM leaves `ST_SESSION` only on the
  ASYNC `onclose` — in that window every subscription removed by
  `gobj_destroy` sent an `__unsubscribing__` frame through the dead socket:
  one `send_iev(): TypeError: can't access property "send"` ERROR per
  subscription (seen as a 14-line burst on gui_treedb's connection reopen).
  `mt_subscription_added`/`mt_subscription_deleted` now also require a live
  socket (the remote side drops a session's subscriptions on close anyway),
  and `send_iev` itself guards a missing/not-OPEN socket with a single
  warning ("message lost") instead of a TypeError.

## 7.7.1

- **`emit_log_callback` re-entrancy guard.** A log sink that itself logs
  (directly, or through any framework helper that logs on a bad argument) no
  longer recurses `log_* → sink → log_*` until the JS stack limit: while the
  sink runs, nested log lines skip the sink (the browser console still gets
  them). Previously only the shipped gobj-ui sink defended itself with its own
  flag; now the framework guarantees it for every sink.

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
