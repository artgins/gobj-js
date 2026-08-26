# Changelog

`@yuneta/gobj-js` — the GObject-JS runtime (JavaScript port of the C GObject
kernel). Versioned to track `YUNETA_VERSION`; a gobj-js-only patch may move
ahead of the SDK version between releases.

## 7.13.7

- **change: the machine trace defaults to the SIMPLER shape, the C kernel's
  default.** `trace_machine_format` was 0 here and 1 there
  (gobj.c: `PRIVATE int trace_machine_format = 1; // 0 legacy, 1 simpler`),
  so a browser yuno wrote THREE lines for one transition — the call, the
  state change, and a `<- mach(…) ret: N` return — where a node wrote one.
  The same trace, three times the wall, and the two sides did not look alike
  read side by side.

  Both shapes stay, and `gobj_set_trace_machine_format(0)` still asks for the
  old one (gobj-ui's dev window has the toggle, now on by default):

  ```
  1  🔄 EV_TIMEOUT C_TIMER^t ST_IDLE from C_TIMER^t
  0  🔄 mach(C_TIMER^t), st: ST_IDLE, ev: EV_TIMEOUT, ac: fi(), from(C_TIMER^t)
     🔀🔀 mach(C_TIMER^t), new st(ST_IDLE), prev st(ST_IDLE)
     <- mach(C_TIMER^t), st: ST_IDLE, ev: EV_TIMEOUT, ret: 0
  ```

  Both name the event, so anything that reads the trace back by event name
  keeps working across the switch.

## 7.13.6

- **feat: `set_console_log_filter(fn)` — a per-LINE say over the console
  writes.** `set_console_log_enabled()` is all or nothing, and the console
  write happens BEFORE the log sink is called, so nothing downstream can
  un-print a line. A consumer that wants one CLASS of lines kept off the
  console had no way to ask for it: gobj-ui's dev monitor could hide the
  `machine` trace's timer traffic — two `EV_TIMEOUT` lines a second, for ever
  — from its own window and had to watch the same flood arrive in the browser
  console beside it.

  `fn(level, msg)` returns true to let the line through; `null` (the default,
  and anything that is not a function) restores the behaviour there has always
  been. It filters the **console only**: the log sink still receives every
  line, so a monitor keeps its complete record and decides separately what to
  show. The master switch still wins, and a filter that **throws** is ignored
  — a broken one must never be able to silence the log.

  Every console write of the log helpers goes through it: `log_error`,
  `log_warning` (both of their branches, direct and remote), `log_info`,
  `log_debug`, `trace_msg` and `trace_json`.

## 7.13.5

- **fix: the last two sites of the boolean/int trap, the ones 7.13.4 left
  reported.** Both were about a callback that answers **nothing**, which is the
  most javascript thing a callback can do, and `undefined` is neither `< 0` nor
  `=== 0`:

  - **The tree walk** (`rc_walk_by_tree()` / `rc_walk_by_list()`) read a
    callback that returned nothing as "do not descend", and skipped the whole
    subtree in silence. What a callback answers is now normalized to the number
    the contract is written in (`-1` stop, `0` descend, `>0` skip children),
    with nothing meaning **0** — the neutral answer. A BOOLEAN is not guessed:
    it could mean either half of that contract, so it is **reported** and taken
    as 0, because a walk that quietly loses a subtree is the one thing this
    function must not do.
  - **`c_ievent_cli`**, in the not-in-session state (the one that processes
    `EV_IDENTITY_CARD_ACK`), closed the websocket unless the action answered
    exactly `0`. An action that did its work and returned nothing hung up a
    session that was fine. Handled now unless the action says it FAILED.

- **feat: `walk_type_t` is exported.** `gobj_walk_gobj_children_tree()` was
  exported and the enum you must pass it was not, so the API could only be
  called with a magic number.

## 7.13.4

- **fix: the same boolean-where-C-returns-an-int trap, in the three siblings of
  7.13.3.** Auditing every strict comparison against a numeric sentinel in this
  runtime turned up three more hooks that answer with a number in C and are
  written with a boolean here:

  - **`mt_publication_pre_filter`** carried the same `topublish === 0` guard as
    the `__filter__` one, eighty lines above it: a pre-filter saying `false`
    published anyway.
  - **`mt_play`**: `if(ret < 0)` is what un-sets `playing`, and `false < 0` is
    FALSE — a play that failed with `false` left the gobj **playing**.
  - **`mt_subscription_added`**: a hook refusing the subscription with `false`
    was ignored and the subscription stayed.

  None of them had an implementation in this tree yet, so nothing was broken in
  the field; they were all waiting for the first one. Pinned in
  `tests/publish_filter.test.js`.

  Two more sites of the same family are LEFT ALONE on purpose, because
  normalizing them changes what a caller's return means rather than repairing
  it — they are reported instead: the tree walker `rc_walk_by_tree()`, where a
  callback that returns nothing (`undefined === 0` is false) stops the walk
  from descending; and `c_ievent_cli`'s `gobj_send_event(...) === 0` in the
  not-in-session state, where an action that forgets to `return 0` closes the
  websocket.

## 7.13.3

- **fix: `__filter__` on a subscription never filtered anything.**
  `gobj_publish_event()` asks `kw_match_simple()`, which answers a **boolean**,
  and then compares it with `topublish === 0`. `false === 0` is FALSE in
  javascript, so a subscription whose filter did not match fell straight
  through the guard and was published to anyway — with the machine trace
  printing `💜💜🔄👎 publishing with filter` on the line right above the
  delivery. The C side passes an int around and has always been right; this is
  the port.

  What it cost, where it was found: a treedb view subscribes to
  `EV_TREEDB_NODE_DELETED` once per topic, each with a
  `{treedb_name, topic_name}` filter. Deleting one row delivered the event
  **five times** (once per topic of that treedb), and the four deliveries that
  belonged to other topics went looking for the row in the table that was open
  and logged *"record not found"*. Every filtered subscription in every app on
  this runtime was doing the same, quietly.

  The filter result is normalized to the 1/0 the contract is written in
  (`-1` break, `0` skip, `1` publish) and the guard now reads `!topublish`, so
  an `mt_publication_filter` that answers `false` means what it says too.
  Pinned by `tests/publish_filter.test.js`.

## 7.13.2

Ahead of the SDK release it belongs to: `YUNETA_VERSION` is 7.13.1 and the
change below only means something with the qualified keys landing after it, so
this ships at the number the SDK will catch up to.

- **feat: `qualified` joins the field-type vocabulary.** `treedb_field_types`
  is what turns a column FLAG into the `type` every form and table switches
  on, and a flag missing from it leaves `field_desc.type` at the plain
  `string`. The SDK gained a third way for the store to hand a key out
  (beside `uuid` and `rowid`): a pkey flagged `qualified` is composed from the
  parent named in the record's fkey plus its own name, so it is never typed on
  create and it is stable enough to update. Without the word here, gobj-ui
  could not tell that key apart from one the user is expected to fill in.

  Mirrors the `flag` enum of `treedb_system_schema.c` and the vocabulary
  comment in `tr_treedb.h`; the three are one list in three places.

## 7.12.0

Aligned with `YUNETA_VERSION` 7.12.0: the SDK release this ships with, rather
than a patch of its own ahead of it.

- **fix: the two lookups answer `null` when they find nothing, never
  `undefined`.** `gclass_find_by_name()` and `gobj_find_service()` read a plain
  object by key, and a missing key answers `undefined` — so the obvious guard

  ```js
  if(gclass_find_by_name("C_FOO") === null) {   /*  never true  */
  ```

  was FALSE for a gclass that is not registered, and the guard behind it never
  ran. `gclass_find_by_name` even declared its intent — `let gclass = null;` —
  and then overwrote it with the missing key.

  gobj-ui had four guards written exactly that way (fixed in its 5.14.2). The
  one that cost real time was `C_YUI_TREEDB_TOPICS`: its *"not registered by the
  app"* message could never print, so a missing registration surfaced one frame
  later as *"can't access property jn_attrs, e is null"*, thrown by whoever used
  the gobj that `gobj_create` had refused to build — an error naming neither the
  gclass nor the app that forgot it.

  `gobj_find_service` was not just wrong, it was inconsistent: `null` with
  `verbose`, `undefined` without it. The same absent service answered a
  different falsy value depending on a **logging flag**, and handing that
  `undefined` to a `DTP_POINTER` attr logs *"attr undefined"* on every use —
  which is why gobj-ui's route map carried a comment warning about it two lines
  above a `!== null` test on the other lookup.

  Both now return `null` on every path. Nothing that used truthiness changes;
  no consumer compared either result to `undefined` (checked across gobj-ui,
  the two in-repo JS yunos, wattyzer, estadodelaire, hidraulia, yunomusica and
  the three yunovatios GUIs).

  `tests/lookup_contract.test.js` pins it, including the
  verbose-must-not-change-the-value case.

## 7.10.0

- **`gobj_post_event()` now means the same thing it means in C.** This port has
  had the call for years — under a comment reading *"post_event, by now only in
  js"* — and 7.10.0 of the SDK finally added it to C. What came back from that
  is a contract, and this is the port catching up to it.

  What it was: `setTimeout(() => gobj_send_event(...), 10)`. One timer per
  event, and ten milliseconds standing in for "later" — which is the very
  thing this call exists to stop writing.

  What it is now:

  - **A queue drained once per turn**, with `setTimeout(0)` and deliberately
    **not** `queueMicrotask()`. A microtask runs before the browser can paint
    or handle an input, so a chain of posted events would hold the page the
    same way draining-until-empty held the event loop in C. A macrotask gives
    the browser its turn between one event and the next.
  - **A snapshot per turn**: the events queued when the drain begins are the
    ones delivered in it, and whatever an action posts waits for the following
    turn. So a chain advances one step per turn instead of running to the end.
  - **Lifetime, both ways.** `gobj_destroy()` drops what a gobj had pending as
    DESTINATION, and clears `src` on what it left as SOURCE — the destination
    still wants its event, and it arrives with `src === null`.
  - **The event is checked against the destination's gclass when you post**,
    not a turn later, so the error names the caller instead of the drain.
  - **A ceiling of 10000**, because it is not a work queue, and reaching it is
    an error.
  - **A `machine` trace line** when the event is posted.

  `gobj_posted_events_size()` and `gobj_deliver_posted_events()` are exported
  alongside it, the same two the C side exposes.

  Nothing called `gobj_post_event()` in this repo or in any consumer, so the
  behaviour change breaks nobody. Covered by `tests/post_event.test.js`, which
  pins each clause — and the snapshot is pinned by the test that fails when
  the drain is changed to empty the queue in one turn.

## 7.9.9

- **`gobj_set_gclass_no_trace()`** — the silencing setter the C kernel has and
  this port did not. The field was already there and already consulted
  (`gobj_trace_no_level()` ORs `gclass.no_trace_level`); only the setter was
  missing, so the idiom every C `main()` uses could not be written in JS:

  ```js
  gobj_set_gclass_no_trace("C_TIMER", "machine", true);
  gobj_set_global_no_trace("timer_periodic", true);
  ```

  `machine` traces every event by design — timers included, exactly as
  `gobj.c` does it — so without this a one-second periodic tick buries
  whatever you were trying to follow. Silence the noisy gclass, not the level
  you are chasing.

  Also realigns the package with `YUNETA_VERSION`, which had drifted (7.9.6
  against an SDK at 7.9.9).

## 7.9.11

- **The runtime kept its own two timers by hand.** 7.9.10 made
  `clear_timeout()` stop the timer, and `c_ievent_cli.mt_stop()` still called
  `gobj_stop()` right after it — so every stop of an ievent client logged
  *"GObj NOT RUNNING"*, the exact noise the release was meant to end. Its
  `gobj_start()` in `mt_start` is gone too (`set_timeout()` starts what it
  arms), and `c_yuno` stops its periodic with `clear_timeout()` instead of
  `gobj_stop()`. No behaviour change beyond the missing complaint: the two
  calls are the whole contract, in the runtime as much as in a view.

## 7.9.10

- **`C_TIMER`: `set_timeout()` arms and `clear_timeout()` disarms — and that is
  the whole contract**, as in C (`c_timer.h`). Whether the gobj is running was
  leaking out as the caller's problem: every view had to pair its
  `set_timeout()` with a `gobj_start()`, and remember a `gobj_stop()` on the way
  out or get *"Destroying a RUNNING gobj"*. In C `set_timeout()` starts,
  `clear_timeout()` stops, and a spent one-shot stops itself; here none of the
  three happened.

  The running state now follows the timeout, and it follows it in **`mt_writing`
  on the `msec` attribute**, not in the helpers. The attribute is the real
  interface — `set_timeout()`/`clear_timeout()` are PUBLIC functions on a gclass,
  which is an escape from the interface every other gclass keeps to, so they must
  be sugar and nothing else. `gobj_write_integer_attr(timer, "msec", 1000)` now
  leaves the timer exactly as `set_timeout()` would.

  **BREAKING for callers that stop the timer themselves.** `clear_timeout()`
  already stopped it, so a following `gobj_stop()` finds it stopped and logs
  *"GObj NOT RUNNING"*. Drop the `gobj_start()`/`gobj_stop()` pair around a
  C_TIMER: the two calls are the whole surface. Every in-tree consumer was
  migrated with this release.

- **A periodic timer cleared from inside its own action really stops.** The
  re-arm ran *after* the action, so it undid the `clear_timeout()` and re-armed
  with the `msec` the clear had just written — a negative delay, which
  `setTimeout()` serves immediately: the timer became a busy loop instead of
  stopping. It re-arms *before* delivering now, which is also what keeps the
  period from carrying the execution time of the action (the reason C does it in
  that order).

## Unreleased

## 7.9.6

One alignment fix, so a JS trace and a node's read the same.

### Fixed

- **`tab()` indents by 2 spaces per level, like `gobj.c`.** It was `2n - 1`,
  one space short at every level, so a JS trace read beside a node's did not
  line up — and the C version never returns zero either (it writes the first
  space before its loop). Pinned by a test that nests one event inside
  another's action and checks the two leading widths.

## 7.9.5

A gobj-js-only patch, ahead of the SDK: the JS runtime gets back the trace
that makes the framework debuggable, and a failure path that crashed outside
a browser.

### Added

- **The `machine` trace is back, and it is the C kernel's.** The JS port had
  the trace lines written but disconnected: `tracea` was hard-wired to a yuno
  attr in `gobj_send_event`, and the calls in `gobj_change_state`,
  `gobj_start`/`gobj_stop` and create/delete were commented out. The whole
  level model from `gobj.c` is now in place, with the **same names and the same
  bits** so a level means one thing on both sides:

  ```js
  gobj_set_global_trace("machine", true);      // everything
  gobj_set_gclass_trace("C_TREEDB_VIEW", "machine", true);
  gobj_set_gobj_trace(gobj, "ev_kw", true);    // + the kw of each event
  gobj_set_gobj_no_trace(noisy_src, "machine", true);   // veto by SOURCE
  ```

  Levels: `machine`, `create_delete`, `create_delete2`, `subscriptions`,
  `start_stop`, `ev_kw`, `authzs`, `states`, `gbuffers`, `timer`, `fs`,
  `liburing`, `timer_periodic`, `liburing_timer`, `commands`. The node-only
  ones keep their bit rather than being dropped — removing them would shift
  every bit above and break exactly the alignment this is for. As in C, a
  gobj's effective level is the **union** of global, gclass and gobj; `timer`
  and `timer_periodic` light up for their own event only; and the SOURCE can
  veto a trace the destination allows. Read it with `set_log_callback()`.

  The pre-existing yuno attrs (`tracing`, `trace_timer`, `trace_creation`,
  `trace_start_stop`) still work — gobj-ui's dev panel writes them — and are
  folded in as one more source of bits, guarded so probing a yuno that does
  not declare them no longer logs *"GClass Attribute NOT FOUND"*.

### Fixed

- **`log_error` / `log_warning` threw `ReferenceError: window is not defined`
  outside a browser.** Both reached for `window.console` directly, in the very
  path that reports a failure, so on Node (a test, a build step, SSR) the error
  being reported was replaced by a crash. They now use the module's already
  guarded `_console` — identical behaviour in a browser. Found by the new trace
  tests, which log an error on purpose to check an unknown level is refused.

## 7.9.4

Ships with SDK **7.9.4**. One fix, applied identically on the C side
(`kernel/c/gobj-c/src/gobj.c`) — the JS runtime is a port of that kernel and
this was a shared defect, not a port slip.

- **`gobj_destroy()` now actually stops the gobj it complains about.**
  Destroying a live gobj is the caller's bug and the framework has always said
  so out loud (*"Destroying a RUNNING gobj"* / *"Destroying a PLAYING gobj"*),
  then tried to repair it by calling `gobj_stop()` / `gobj_pause()`. That
  repair could never work: the destroying flag was raised **first**, and both
  entry points refuse a destroying gobj — rightly so, nobody outside may stop
  something already being dismantled. So the rescue died on its own guard,
  emitting a second, misleading *"gobj NULL or DESTROYED"*, and `mt_stop` /
  `mt_pause` never ran: the gobj was taken apart still holding its timers,
  subscriptions and DOM listeners.

  The pause/stop now happen **before** the flag goes up, so the gobj is
  quiesced exactly as an orderly stop would leave it. That order also matters
  for what `mt_stop` itself does: a gclass that stops its children there goes
  through a path carrying the same guard, so with the flag already up the
  whole subtree would have stayed running.

  The complaint stays loud — the fix at the call site is still
  `gobj_stop_tree()` before `gobj_destroy()`. What changed is that the
  framework no longer pretends to repair it. This exact trap had been
  diagnosed and fixed at the caller at least three times (gui_treedb's Keys
  picker and Raw JSON viewer, yunovatios' shell teardown).

  New unit tests (`tests/destroy_stops.test.js`) pin the order: `mt_stop`
  before `mt_destroy`, pause before stop for a playing gobj, no second error,
  and silence for a gobj that was never started.

## 7.8.7

Ships with SDK **7.8.7**. One behaviour change, shared with the C side.

- **`C_IEVENT_CLI` matches `dst_role` the way the framework matches names.**
  The check was a strict `!==`, so a peer whose role differed only in letter
  case was dropped — while `gobj_find_service()` lowercases before looking a
  service up, and the C side compares roles and yuno names with `strcasecmp()`.
  Now it compares lowercased, like the rest of the naming.

  (`dst_yuno` is still not checked here — the `// Check yuno_name too` note
  stays. The C client does check it; adding it to the browser client is a
  separate decision.)

## 7.8.0

Ships with SDK **7.8.0**. No BREAKING changes, but one behaviour a consumer will
observe: a dropped `C_IEVENT_CLI` link now **backs off** instead of retrying
every 5s for ever (documented opt-out: set `timeout_retry_max` = `timeout_retry`).

- **feat(i18n): `refresh_language()` processes `data-i18n-placeholder`.** A
  placeholder is an attribute, not a text node, so the `data-i18n` walk could
  not reach it and an input's placeholder kept the mount-time language
  forever (first consumer: gobj-ui's site-map filter). Same contract as
  `data-i18n-title` / `data-i18n-aria-label`.
- **feat(logging): `set_console_log_enabled(enabled)` gates the direct
  browser-console writes.** New exported switch (default **on** — unchanged
  behaviour) that silences the `console.*` output of `log_error` /
  `log_warning` / `log_info` / `log_debug` / `trace_msg` / `trace_json`
  without touching anything else: the log-sink callback (`set_log_callback`)
  still fires, and remote log functions (`set_remote_log_functions`) still
  fire. It lets a GUI dev monitor route framework output — including the
  automata/FSM trace, which arrives as `debug` — to its own window only,
  keeping the browser console clean. Consumed by gobj-ui's dev-window "Output"
  selector.

- **feat(c_ievent_cli): a link can advertise its OWN `required_services`.**
  The identity_card read the list from the **yuno**, so every link of a yuno
  sent the same one. New per-link attr (`SDF_RD`, default `[]`); empty falls
  back to the yuno's, so a single-link yuno is unchanged.

  It matters for a MULTI-link yuno: gui_treedb keeps one `C_IEVENT_CLI` per
  configured backend, and the yuno-wide list can only be the **union** of every
  backend's selected services — so each backend was told the service names of
  all the others, and got a card naming services it does not host. C_AUTHZ
  needs the list to authorize the treedb commands, so it cannot just be
  dropped: it has to be per link.

- **feat(c_ievent_cli): the reconnect BACKS OFF, with jitter.** The retry delay
  was the constant `timeout_retry` (5s), for ever: a backend that is down — or a
  URL with a typo, which never comes back — was hit every 5 seconds for the
  whole life of the tab, by EVERY link pointed at it, all in lockstep. It now
  doubles from `timeout_retry` up to the new `timeout_retry_max` attr (default
  60s; set it equal to `timeout_retry` for the old fixed-interval behaviour),
  with ±20% jitter — which is what breaks the lockstep, so N links that dropped
  together do not stampede a backend that is just coming back up. The backoff
  resets when a session is actually reached, and on `mt_start` (a deliberate
  reconnect must not inherit a previous run's penalty).

- **fix(dbsimple, helpers): a rejected localStorage write is no longer
  reported as saved.** `kw_set_local_storage_value()` returned nothing and only
  `console.warn`'d; `db_save_persistent_attrs()` dropped the result. So
  `gobj_save_persistent_attrs()` and every app above it reported success for a
  write the store had refused — a full or blocked localStorage (quota, private
  mode) silently discarded the change while the in-memory attr and the UI
  showed it as saved, and the next reload lost it. Both return 0 / -1 now, and
  the failure goes through `log_error`, not `console`.

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
