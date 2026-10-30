# Changelog

`@yuneta/gobj-js` — the GObject-JS runtime (JavaScript port of the C GObject
kernel). **Versioned to track `YUNETA_VERSION`, and never ahead of it except in
the third index**: the first two are the SDK's, the third is this package's own
life between SDK releases. Rule set on 2026-08-28; before it the line had
drifted to 7.13.x while the SDK was at 7.16.2, which told a consumer nothing
about which SDK it was built against.

## Unreleased

## 7.29.4

- **Tests: the linearity of the secret masking runs alone, and keeps the
  best time of each size across its measures.** `vite.config.js` puts
  `tests/secret_masking_linear.test.js` in a vitest project of its own that
  runs after every other file has ended (`sequence.groupOrder`), and the
  slope is fitted on the best time of each size over up to six rounds of
  three passes. A linear masking passes once each size had one clean pass;
  a masking that rescans is steep in every pass and still fails.
  - **Every size is timed over the SAME amount of work** (8 calls of
    256 KB, 2 of 1 MB, 1 of 2 MB), so a load that takes the CPU away now
    and then hits every size alike. With a window of 10 ms for every size
    the best of the small sizes found a window the load had not touched and
    the best of the largest did not, and the slope of the linear masking
    grew with the load alone (1.15 to 1.24 with three runnable tasks per
    core, against a limit of 1.15; 1.04 to 1.09 with equal work).
  - **The sizes are 256 KB, 1 MB and 2 MB, and the limit 1.20.** A masking
    that also rescans, at twice the time at 1 MB, gives 1.26 to 1.46 on
    every shape; at 64 KB, 256 KB and 1 MB it gave 1.09 to 1.25 and most
    shapes passed.
  - No published file changes.
- **The `json2flat()` note and the json_flat tests tell the first C
  implementation's failure generically:** a dict keyed by a yuno id N came
  back as an array of N+1 elements. The note is in the bundles of `dist/`.
  No code change.
- **Tests: the C_TIMER cases of `destroy_under_dispatch.test.js` wait for
  the events, not for 20 ms.** A timer of 1 ms on a loaded machine fired
  after the fixed wait, and its late `EV_DIE` landed in the next test. No
  published file changes.

## 7.29.3

- **Example ids.** The `json2flat()` note and the json_flat tests use
  `7301`/`7302`/`7303` and the port `7401`, the same as the C test. No code
  change.

## 7.29.2

- **The CHANGELOG and the tests say what each version changed** (the
  masking tests' table is `SCHEME_WORD_SHAPES`). No code change.
- **Generic example ids.** The `json2flat()` note and its tests key the
  numeric-key case by generic yuno ids, and the diff tests use a generic
  port. No code change.

## 7.29.1

- **The comments of `src/` name what was fixed** (the source maps in
  `dist/` carry them), and the tests of the runtime contracts live in
  `tests/runtime_contracts.test.js`. No code change.

## 7.29.0

The number follows SDK 7.29 (its first two indexes are the SDK's).

- **`build_path()` keeps a root `/`, and a `..` never goes above the first
  segment, as in the C `build_path()`**. A first segment made
  only of `/` was lost: `("/", "tmp")` gave the relative `"tmp"`. And `.` /
  `..` of the later segments stayed as they came: `("/", "..", "etc")` gave
  `"../etc"`, `("/store", "../../etc")` gave `"/store/../../etc"`. Now
  `"/tmp"`, `"/etc"` and `"/store/etc"`; a double `/` inside a later
  segment is one. The URLs the SPAs build (`build_path(bff_url, "auth",
  "login")`) do not change. `tests/build_path.test.js` pins the cases of
  the C test: 15 of its 29 were red on 7.28.1. 601 tests pass.

## 7.28.1

- **`tab()` indents 4 spaces per nesting level, like `gobj.c`** (SDK
  7.28.8). It was 2: an event sent from inside another one's action now
  stands clearly under it in the machine trace.

## 7.28.0

The number follows SDK 7.28 (its first two indexes are the SDK's).

- **dev:** `@rollup/plugin-terser ^1.0.2`.
- **BREAKING: `jwtDecode()` and `jwt2json()` are removed.** `jwtDecode()`
  was an answer copied from StackOverflow, under CC BY-SA, a license the MIT
  of gobj-js cannot carry, and `jwt2json()` only called it. Nobody calls
  either (checked in gobj-ui, yunos-js and every consumer app), and an SPA
  never sees a token: the
  BFF keeps it in an httpOnly cookie.
- **`LICENSE`, `THIRD-PARTY-NOTICES` and `CONTRIBUTING.md`.** The package
  said MIT in `package.json` but carried no license text: `LICENSE` is the
  MIT License (Niyamaka 2014-2024, ArtGins 2024-2026). `src/sprintf.js`
  keeps its BSD-3-Clause License in full in its header and in
  `THIRD-PARTY-NOTICES`, which the package now ships. The header is a legal
  comment (`/*!`), so the bundles of `dist/` keep it. An app built with
  Vite 8 drops every comment: there the notice goes in the app's
  `licenses.txt`, written by gobj-ui's `yunetaLicensesPlugin` from this
  package's `THIRD-PARTY-NOTICES`. `CONTRIBUTING.md`
  says how to contribute and asks for the CLA of the Yuneta projects.
- **vite 8.3.5** (development, from 8.3.4). No published code changes.
  572 tests pass.
- **Development tooling on vitest 5** (`vitest` and `@vitest/coverage-v8`
  5.0.5, from 4.1.10). No published code changes, so there is no release.
  572 tests pass, as on 4.
- **jsdom 30.1.3** (from 26.1.0), the environment of
  `tests/create_element2.test.js`. Its 4 tests and the 572 pass;
  `npm audit` clean, and every range at its latest version (`ncu`).
- **`npm run test:coverage` passes again.** The 1 MB case of
  `tests/secret_masking.test.js` ran at its 120 s limit under coverage
  (119.7 s on vitest 4, 116.3 s on 5, alone; 12 s without). In the full
  parallel run it went over, on 4 as on 5. What it asserts is a slope, which
  the instrumentation does not change, so only the limit of the case
  widens. `vite.config.js` provides `coverage` (from `--coverage` on the
  command line), the test reads it with `inject("coverage")`, and the case
  gets 10 minutes under coverage and keeps 120 s otherwise. Full coverage
  run: 572 tests, 127 s.

## 7.27.0

The number follows SDK 7.27.0 (its first two indexes are the SDK's). No change
of the runtime's code over 7.26.29:

- **doc: `node_uuid()`'s comment** says which store failures warn (blocked or
  full) and which are silent (no `localStorage`, no browser).
- **dev:** `vite ^8.3.4`.

## 7.26.29

- **fix, BREAKING: `gobj_play()` of a gobj that is not running gives -1 when its
  start is refused, destroys the gobj, or leaves it not running** (it gave 0
  and called `mt_play`; a `mt_start` that returns -1 and leaves the gobj
  running still plays, as in C). It starts the gobj itself (with a WARNING) and ignored the result,
  so a start refused by an empty `SDF_REQUIRED` attribute (7.26.28) still
  called `mt_play` on a gobj that was not running, left it `playing`, and gave
  0; a gobj that destroyed itself in its `mt_start` got its `mt_play` after it
  was destroyed. As in C, `gobj_play()` now gives -1 and does not call
  `mt_play` when the start destroys the gobj or leaves it not running. In
  every published version (the refused start only in 7.26.28). Test
  `start_required`.
- **fix, BREAKING: `gobj_change_parent()` refuses the gobj itself or one of its
  descendants as the new parent**, with an ERROR and -1: it made a cycle that
  no longer hangs from the tree, where a `WALK_BOTTOM2TOP` walk and
  `gobj_full_name()` ended in a `RangeError`. A destroyed new parent is refused
  too, and every error gives -1 (a destroyed gobj gave `null`). In every
  published version. Its callers -- two consumer apps, in their device
  views and a sheet window -- move a live gobj under a live parent outside any
  walk, so neither refusal reaches them. Test `walk_destroyed`.
- **fix: `node_uuid()` replaces a stored `host_uuid` that is not a uuid** (a
  foreign or corrupt write: `"garbage"`, `"42"`, `"[object Object]"`) with a
  new one, written to the store, and one WARNING. It was sent as it was in the
  `node_uuid` attribute of the yuno, the `id` of the identity card and the
  `host` of every message. In every published version. Test `node_uuid`.

## 7.26.28

- **fix: `node_uuid()` answers ONE uuid for the life of the page.** When the
  store could not keep it (the site's data blocked, a full store, no
  `localStorage`, outside a browser) it made a new uuid on EVERY call, so the
  `node_uuid` attribute of the yuno, the `id` of `C_IEVENT_CLI`'s identity card
  and the `host` of every message it sends changed from one call to the next;
  7.26.27 said *"a uuid of this page only"*, and nothing kept it. Without
  `crypto.randomUUID()` (a page on http without TLS is not a secure context) it
  answered `null` -- with a working store too, for ever, as nothing was
  written. The first answer is kept now: the stored uuid, or one this page
  made (one WARNING); a missing `randomUUID()` makes a uuid v4 from
  `crypto.getRandomValues()`, or from `Math.random()` with no crypto at all. A
  uuid written to the store by another tab while the page lives does not
  change the page's. In every published version (the null, and a new uuid
  per call with no `localStorage` or outside a browser); with a blocked or full
  store, only in 7.26.27 (7.26.26 threw). Test `node_uuid`.
- **fix: a walk of the tree hands each gobj to its callback at most once.** 7.26.27
  walks a COPY of each child list and stepped over only a destroyed gobj, so a
  gobj a callback MOVED with `gobj_change_parent()` was handed in its old place
  and again under its new parent: in a `WALK_TOP2BOTTOM` where c1's callback
  moves c2 under c3, `c1 g1 c2 g2 c3 c2 g2` (7.26.26: `c1 g1 c3 c2 g2`). A gobj
  whose parent is no longer the owner of the list is stepped over now (handed
  where the walk finds it), and a walk keeps the set of gobjs it handed, so a
  gobj moved AHEAD after it was handed (by its own callback, or by the walk of
  its children) is not handed again there, nor are its children -- in every
  order (`WALK_TOP2BOTTOM`, `WALK_BOTTOM2TOP`, `WALK_BYLEVEL` both ways) and in
  `gobj_walk_gobj_children()`. Only in 7.26.27 for a gobj moved before it was
  reached; a gobj moved ahead after it was handed was handed twice in every
  published version. At most once, not exactly once: a gobj not reached yet
  that a callback moves under a parent the walk has passed is not handed at
  all, nor are its children. Its callers (two consumer apps) move a
  gobj outside any walk, so this does not reach them. Test
  `walk_destroyed`.
- **fix: with `create`, a store that can be read but not written (full) is
  warned once per key.** Every read tried to write the default again, and the
  failed write was an ERROR of `kw_set_local_storage_value()`: one ERROR per
  read of the locale, the theme... Now one WARNING per key, as for a store that
  cannot be read, warned again after a read that goes well. A default with no
  json text is still an ERROR (the caller's fault), and
  `kw_set_local_storage_value()` to a full store is still -1 with an ERROR. In
  every published version. Test `local_storage`.
- **fix, BREAKING: `gobj_start()` refuses a gobj with an empty `SDF_REQUIRED`
  attribute**, as `gobj_start()` does in C (`gobj_check_required_attrs()`): one
  ERROR naming the attributes (*"Cannot start without all required
  attributes"*), -1, `mt_start` not called. Empty is what C asks, type by type:
  a string `""`, a list, dict or json with nothing usable in it
  (`empty_json()`: null, `{}`, `[]`, `""` or a scalar), a null pointer; a
  boolean, integer or real is never empty. The check was a TODO with the C code
  commented out, so a gobj started without what it needs. `gobj_start_tree()`
  starts the children of a refused gobj, as in C. No consumer declares
  `SDF_REQUIRED` (gobj-ui, the in-repo yunos, every consumer app). In every
  published version. Test
  `start_required`.

## 7.26.27

- **fix: with the site's data blocked, the local storage helpers no longer
  throw.** In Chrome with cookies blocked, or in a sandboxed iframe, READING
  `window.localStorage` already throws a `SecurityError`, not only its
  `getItem()`; the helpers read the property outside their `try`, so
  `kw_get_local_storage_value()`, `kw_set_local_storage_value()`,
  `kw_remove_local_storage_value()` and `node_uuid()` threw it -- and every app
  reads its locale with `kw_get_local_storage_value("locale", ..., true)` at
  start, so the app did not start. One accessor (`local_store()`) reads the
  property in a `try` and answers a blocked store as one whose every call
  throws: a read gives the default (one WARNING per key, and `create` does not
  write it), a write -1 with an ERROR, a removal a WARNING, `node_uuid()` a uuid
  of this page only (one WARNING). 7.26.26 said *"a store that cannot be read
  is warned once per key"*, which held only when `getItem()` threw. Checked in
  Chromium and Firefox with a sandboxed iframe. In every published version.
  Test `local_storage`.
- **fix: a second corrupt value in the same key is warned again.** 7.26.26
  remembered a warned key for the life of the page, so a corrupt entry written
  again after the first was removed was removed with no trace. A key is
  forgotten when its corrupt entry is removed, and after a read that goes well;
  a corrupt entry that cannot be removed is warned once. Only in 7.26.26. Test
  `local_storage`.
- **fix, BREAKING: `kw_set_local_storage_value()` refuses a value with no json
  text**, with an ERROR and -1, as a typed writer refuses it (new public
  `json_text_of()`, the rule of a string attribute): a function was stored as
  the text `"undefined"` with an answer of 0 (and removed by the next read),
  `{w: NaN}` as `{"w":null}`, a `Date` as a string, a `Map` as `{}`; a cycle or
  a `BigInt` was refused as *"storage full or blocked?"*. Checked before the
  store, so outside a browser too. A key whose value is `undefined` is still an
  absent key. No consumer writes such a value (gobj-ui, the in-repo yunos,
  the consumer apps: strings, numbers, booleans and plain objects). In every published version. Tests `local_storage`, `attr_types`.
- **fix, BREAKING(`C_IEVENT_CLI`): the base of the first reconnect delay is at
  least 1000 ms** (the ±20% jitter puts the first delay itself between 800 and
  1200 ms). A `timeout_retry` of 0 never left 0 (0 doubled is 0), so with a
  `timeout_retry_max` of 0 too a server that closes before the ack was
  reconnected in a loop with no wait: 269 connections in one second on the dev
  machine. A lower `timeout_retry` is raised to 1000 with one WARNING per link;
  the age that makes a broken session "served" uses the raised values too.
  BREAKING (marked in 7.26.28): any `timeout_retry` below 1000 now waits 1000,
  and a 0 that never waited now reconnects every second; no consumer sets one
  below 1000. In every published version. Tests `ievent_restart`, `ievent_peer_fault` (whose
  backoff tests run on fake timers now, with delays from 1000 ms).
- **fix: a walk of the tree steps over a gobj a callback destroyed, and no
  longer skips or repeats a live one.** The walks went over a COPY of each
  child list below the top, so a child an earlier callback had destroyed was
  still handed to the callback (`gobj_walk_gobj_children_tree()`, any
  order); and the TOP list was the live one walked by index, so a callback
  that destroyed a child already passed moved the next one under the index:
  `gobj_start_tree()` left it stopped and `gobj_stop_tree()` left it running,
  and a bottom-to-top walk visited a gobj twice. Every list is copied now and
  a destroyed gobj is stepped over, before its callback and before its
  children, as the C walk does with the live list. `gobj_start_tree()` never
  started a destroyed gobj (`gobj_is_disabled()` answers true for one), so
  there was no *"gobj NULL or DESTROYED"*. In every published version. Test
  `walk_destroyed`.

## 7.26.26

- **fix: a getter or a `Proxy` trap that throws is refused, not thrown, by the
  attribute writers.** The walk of 7.26.25 read every value with no `try`, so
  `gobj_write_str_attr(g, "s", {get a() { throw new Error("boom"); }})` threw
  `boom` out of `gobj_write_attr()`, `gobj_write_attrs()` and the typed writers,
  for a string, a `DTP_DICT` and a `DTP_LIST` (7.26.24 refused it, as the README
  promises). A revoked `Proxy` threw even from the shape check. Refused now with
  *"a value with no json text"*: one ERROR, -1, the attr keeps its value. Only in
  7.26.25. Test `attr_types`.
- **fix: a plain object of another realm (a `vm` context, an iframe) is a plain
  object again** for a string, a `DTP_DICT` or a `DTP_LIST`. 7.26.25 asked its
  prototype to be THIS realm's `Object.prototype`, and refused it as *"a value
  with no json text"*; a `Map`, a `Date` or a class instance of another realm is
  still refused. Only in 7.26.25. Test `attr_types`.
- **fix, BREAKING: a value whose json text says another value is refused for a
  string, a `DTP_DICT` or a `DTP_LIST`** (one ERROR, -1, the attr keeps its
  value; every published version wrote it): an object with a `toJSON()`, `NaN`
  or `Infinity` inside (its text says `null`, and jansson holds no such real), a
  function, `undefined`, a symbol or a hole (`[1, , 3]`) inside an ARRAY (its
  text says `null`; as the value of a key it is still an absent key), and a value nested deeper than 2048 levels
  (a scalar is a level too) -- the depth C reads a text to, as a text is already
  refused; a value 200 000 levels deep passed and burst `JSON.stringify()` later.
  `NaN` or `Infinity` given to a string attribute was the text `"null"`. The
  depth also ends a cycle, so the walk keeps no set of the path; it stays
  without recursion, so a deep caller's stack does not change the answer. In
  every published version. A `Proxy` is read through its traps, as `JSON.stringify()`
  reads it: JS cannot tell one. Test `attr_types`.
- **The walk costs what a `JSON.stringify()` of the value costs** (a dict of
  50 000 records, some 450 000 values: 18-30 ms per write, against 26-50 ms for
  its `JSON.stringify()`, on the dev machine), on every write of a string, a dict
  or a list. Kept whole, by decision: a cache by identity would accept an object
  changed since its first check, and checking only some writes would leave the
  ones the check exists for. No consumer writes a large value to an attribute
  (gobj-ui writes `records` as `{}`); the kw of an event is not checked.
- **fix, BREAKING: an integer attribute refuses 2^63, as text and as a number**
  (one ERROR, -1: every published version wrote the texts below). A JS number
  rounds the last 512 integers of int64 up to 2^63, which is out of int64, and
  JSON.parse() makes 2^63 of `9223372036854775807`, of `9223372036854775808` (too
  big for C) and of the real `9.223372036854775808e18` (out of range in C) alike.
  7.26.25 took it (*"the int64 maximum it came from"*), so an attribute could hold
  a number whose text C refuses as *"too big integer"* when it goes back on the
  wire. Now *"a number out of its range"*, as the text `"9223372036854775296"` to
  `"9223372036854775807"`, which C takes and JS cannot hold; to a list or a dict
  2^63 is *"a real"*. Only in 7.26.25 for a number; a text in every published
  version. The parity table has 111 cases (105); the C test `tests/c/attr_types`
  passes all 111.
- **fix(`C_IEVENT_CLI`): a session that outlived `timeout_retry_max` starts the
  backoff over when the server breaks it.** 7.26.25 put back the backoff the ack
  had reset whatever the session's age, so after a run of broken sessions, a
  session that lived for hours and then got one foreign message was reconnected
  with the escalated delay. A session that long was served: its fault is now a
  delay from `timeout_retry`, as a clean end is. Broken sooner, the backoff goes
  on as in 7.26.25. Only in 7.26.25. Test `ievent_peer_fault`.
- **fix(`C_IEVENT_CLI`): `EV_MT_STATS` and `EV_MT_COMMAND` from the server are
  refused with a WARNING** naming what was asked (the stats or the command,
  masked: a command line can carry a secret) and the service. They were TODO
  actions that returned 0 and left no trace. The C client runs them on the
  service named and answers; a browser client does not run what its server
  asks. The session goes on (the protocol allows the ask). In every published
  version. Test `ievent_peer_logs`.
- **fix, BREAKING: `kw_get_local_storage_value()` warns ONCE for an entry that
  is not json, and removes it; it answers the default where it answered `null`
  or `undefined`.** It console.warn'ed (with JSON.parse()'s error, which
  quotes the text: an entry can hold a token) and answered the default on EVERY
  read, so every reader of a corrupt entry in gobj-ui (the dev window, the json
  viewer...) warned for ever; gobj-ui 7.26.47 worked around it in
  `C_YUI_WINDOW`. Now one WARNING through the log, the text never shown, the
  entry removed (with `create`, the default written in its place), the default
  answered. A json `null` is no value, as `json_absent()` in C: the default
  (it answered `null`, so a reader with a default of `"light"` got `null`), and
  `create` writes the default over it. A store that cannot be read is warned
  once per key. Outside a browser it answers the default (it answered
  `undefined`, so `Number(...)` of it was NaN). In every published version. No
  caller relied on the old answers: the keys written raw (`bulma-theme`,
  `host_uuid`, one app's own) are never read through it. Test `local_storage`.
- **docs:** the README's `C_IEVENT_CLI` section had a code block closed by a
  line with text after the backticks, so the paragraphs after it (the WARNING,
  the 4002, `EV_ON_CLOSE` and its example) rendered as code. The README and
  doc.yuneta.io now also say that a refused identity card is `EV_ON_ID_NAK` and
  then `EV_ON_OPEN_ERROR` (as the C transport: a subscriber that shows the first
  should not show the second), and doc.yuneta.io's `C_IEVENT_CLI` page gains the
  4002 close and the reconnection backoff.
- **The masking's decoded view is built with fewer allocations** (`mark_decoded_view()`): two strings for each `%XX` made enough garbage to bend the time of a large text, and the linearity test failed under load for `%25253D` (slope 1.16-1.20). The view is built as character codes, a chunk at a time. Same output -- the views, their marks and the masked text on 441 008 texts (the 438 008 the C kernel is measured on, and 3 000 long ones built to cross the chunks of the view) --; 1 MB of `%25253D` takes 28 ms instead of 57, 4 MB 111 instead of 226.

## 7.26.25

- **fix(`C_IEVENT_CLI`): a message that names no service is taken only for an
  event some gclass declares PUBLIC, and never for an event the transport says
  itself.** 7.26.24 took any declaration, so a server that sent `{"event":
  "EV_ON_OPEN"}` (or `EV_ON_CLOSE`, `EV_TIMEOUT`) with no service had it
  published to the app as if the transport had said it, with whatever kw the
  server chose (`username`, `services_roles`), and without a line of log; a
  declared but not public name ended in *"Event NOT DEFINED in state"*, an
  ERROR a peer provoked. Now the lookup asks `EVF_PUBLIC_EVENT`, as C's
  `gclass_find_public_event()`, and the transport's own names (`EV_ON_OPEN`,
  `EV_ON_CLOSE`, `EV_ON_OPEN_ERROR`, `EV_ON_ID_NAK`, `EV_TIMEOUT`,
  `EV_ON_MESSAGE`, and `EV_IDENTITY_CARD_ACK` in session, where it was an
  ERROR too) are refused from the server in any case of letters and whatever
  service the message names: a WARNING, the name masked, dropped. The other
  public events of the transport (`EV_MT_STATS`, `EV_MT_COMMAND`) are found in
  any case of letters, as C finds them. `EV_ON_ID_NAK` is no longer declared
  public (it is an output event, as in C). In every published version. No
  consumer of the ecosystem receives an event by this path (every requester is
  a named service, its answers arrive by name). Tests `ievent_peer_logs`.
- **fix(`C_IEVENT_CLI`): a session closed for a fault of the server is closed
  with 4002, and the backoff goes on.** A message for a role or a yuno that is
  not this one, or an event before the session, closed the channel with a clean
  1000, so `EV_ON_CLOSE` said the session had ended well; and the ack of that
  session had reset the reconnect backoff, so a server that broke every session
  was reconnected at `timeout_retry` (5 s) for ever, with a WARNING, an
  `EV_ON_OPEN` and an `EV_ON_CLOSE` in the app per round. The close is 4002 (a
  browser may close only with 1000 or 3000-4999: 1002 throws there, and the
  socket stayed open), and the backoff the ack reset is put back, so it doubles
  as for a failed open. The routing closes are of 7.26.24, the event out of
  session of every published version. Test `ievent_peer_fault`. (Correction, in
  7.26.26: the backoff was put back after a session of any age; a session that
  outlived `timeout_retry_max` now starts it over.)
- **fix: a value that is not json all the way down is refused for a string, a
  `DTP_DICT` or a `DTP_LIST`, at the write.** The shape check looked only at
  the top: a circular object, a gobj, a `Map`, a `Set`, a `Date`, a typed array
  or `[1n]` was written to a dict or a list, and burst (or changed) when the
  value was serialized, far from the write; a `Map` written to a string attr
  became the text `"{}"`, silently. Refused now with *"a value with no json
  text"*, one ERROR, -1, the attr keeps its value. A key of `undefined` or of a
  function is still taken (`JSON.stringify()` drops it). `DTP_JSON` is not
  checked. In every published version. Test `attr_types`. (Correction, in
  7.26.26: its walk let a getter that throws escape the writer, which 7.26.24
  refused, and it refused a plain object of another realm.)
- **fix: the json text and the numbers of the parity edges are read as C reads
  them.** A text nested deeper than 2048 levels (a scalar is a level too) is
  refused for a dict or a list, as jansson refuses it ("maximum parsing
  depth"), and stays the text for a `DTP_JSON` (JS parsed it). A number beyond
  int64 given to a dict or a list is refused as "a real", as in C (`1e20`,
  `1.5e300` were "an integer"). `9223372036854775807` given as a json number to
  an integer is taken (JSON.parse() makes it 2^63, which JS refused as out of
  range). (Correction, in 7.26.26: 2^63 is out of int64, and its text is one C
  refuses; JS refuses it again, as a number and as text.) `-0.0`, like `2.0`, stays "an integer" in JS. The parity table has
  105 cases (92), each with C's outcome and, where JS cannot give it, JS's; the
  C test `tests/c/attr_types` passes all 105.
- **fix(masking): a URL or a query %-encoded inside a value is read decoded** (`mask_secrets_inline()`, `json_mask_secrets()`): `next=%2Flogin%3Fpassword%3Dx`, `url=https%3A%2F%2Fbob%3Ax%40host`, `redirect_uri=...%3Ftoken%3Dx` and `%2570assword=x` showed `x`. Decoded twice at most, ASCII only, as the C kernel. In every published version.
- **fix(masking): `pass`, `pin` and `otp` before the last `&`, `?` or `;` of the word before a `=` or `:` no longer make it a secret's name**: `GET /search?q=boarding+pass&lang=es` gave `lang=********` (7.26.22 to 7.26.24). Measured position by position against 7.26.24 on 438 008 generated texts: what shows is that value and nothing else (1 816 texts); against 7.26.19 nothing more shows than in 7.26.24; C and JS give the same text on all of them and on 30 000 jsons. Tests `secret_masking`.

## 7.26.24

- **fix(`C_IEVENT_CLI`): a session that is CUT is a WARNING again, and
  `EV_ON_CLOSE` says how it ended.** 7.26.23 made every close of a session
  silent, so a 1006, a 1011 or a close of the server with 1008 left no trace
  unless the `ievents` trace was on, and the subscriber could not tell it
  either: `EV_ON_CLOSE` carried no code. A session that ends cleanly (a stop,
  a logout, the server closing with 1000 or 1001) still logs nothing; one that
  is not clean, or closes with any other code, is one WARNING with the code
  and the reason masked. `EV_ON_CLOSE` carries `code`, `reason` (masked and
  capped) and `was_clean`; `EV_ON_OPEN_ERROR` carries the reason masked too
  (it published it raw, and gui_agent paints it on the screen). New keys of a
  kw, nothing removed. The C transport's `EV_ON_CLOSE` has no code to give: its
  TCP layer has none. Test `ievent_close_logs`.
- **fix(`C_IEVENT_CLI`): an event name of the server no longer reaches the log
  raw.** A message that names no service was published as it came, so a name
  that no gclass declares showed unmasked in *"Publish event WITHOUT
  subscribers"* or *"Event NOT DEFINED in state"*. It is published only when a
  registered gclass declares its event (published under the declared name);
  any other is dropped with a WARNING, its name masked. (Unlike C's
  `gclass_find_public_event()`, which this line named, it did not require the
  declaration to be PUBLIC: fixed in 7.26.25.) The C transport refuses such a frame when it reads
  it. And what the server gets wrong is a WARNING, not an ERROR: an event out
  of session, a role that is not this yuno's, an event the named service does
  not take as public. In every published version. Test `ievent_peer_logs`.
- **fix(`C_IEVENT_CLI`): a message is routed as the C transport routes it.**
  An empty `dst_role` is legal in the protocol (a client that asked for no role
  sends none), and JS refused it as *"It's not my role"*; it is accepted now, and
  so is an empty `dst_yuno`, which JS never checked. A `dst_role` or `dst_yuno`
  that is not this yuno's is a WARNING and the channel is CLOSED (JS dropped the
  message and kept the session; it said nothing of a wrong `dst_yuno`). Before
  the session only `EV_IDENTITY_CARD_ACK` is taken: any other event is a WARNING
  and the channel goes (an `EV_MT_STATS` there was *"Event NOT DEFINED in
  state"*, an ERROR). The server's names are shown masked and capped at 128
  characters (64), as C. Test `ievent_peer_logs`.
- **New `gobj_find_event_type(event, event_flag, verbose)`**: an event in ANY
  registered gclass, any case, as the C kernel's `gobj_find_event_type()`.
- **fix: a value with no json text is refused, not thrown.**
  `gobj_write_str_attr()` of a circular object (a gobj, a DOM node) or a
  `BigInt` threw the exception of `JSON.stringify()` since 7.26.22 (it wrote
  `"[object Object]"` before); so did `gobj_write_attr()` and
  `gobj_write_integer_attr()` of one to any typed attr (their refusal logged the
  value with `JSON.stringify()`), and `gobj_write_attrs()` / the kw of
  `gobj_create()` to a string attr (in every published version). Refused now
  like any other value: one ERROR, -1, the attr keeps its value. Test
  `attr_types`.
- **fix: a json TEXT is read as the C parser reads it.** `JSON.parse()` reads
  what jansson refuses: an escaped NUL (`{"a": "x\u0000"}`), a lone surrogate,
  an integer out of int64, a real that overflows (`1e309` is `Infinity`). Such a
  text for a dict or a list is refused, as in C; for a `DTP_JSON` it stays the
  text (`command_parameter_from_json(DTP_JSON, "1e309")` gave `Infinity`, C the
  string `"1e309"`). Two cases stay different, because a JS number cannot carry
  them, and the parity table now says so for each kernel: an integer beyond 2^53
  is rounded, and `2.0` is the integer 2 (`2.0` for a dict is refused as "an
  integer", C says "a real"). The table has 92 cases (71), `DTP_JSON` among
  them.
- **fix: a dispatch always pops its frame.** `gobj_send_event()` changed the
  state between pushing the frame of the action and the `try` that pops it:
  had the change thrown, the frame stayed, and every later destroy of that gobj
  from another action was reported as *"Destroying a gobj while one of its
  actions is still running"*. The change of state is inside the `try`. Test
  `destroy_under_dispatch`.
- **fix: a query name as a form writes it, and the password of a URL, are
  masked** (`mask_secrets_inline()`, `json_mask_secrets()`): `GET
  https://my-file-server.com/get?user[password]=x`, `?user%5Bpassword%5D=x`,
  `?t%6Fken=x` and `https://bob:hunter2@host` showed. As the C kernel of
  7.26.10. In every published version. Nothing that 7.26.23 masked shows
  (378 008 texts, position by position); C and JS give the same text on all of
  them.
- **The masking is faster than 7.26.23 on every hard shape but one** (1 MB,
  best of 25 runs in 10 alternated rounds): `pin="` 10 % faster, the others 3
  to 15 % faster, `abcd=` at par, `a=` 10 % slower. A name one reading judged
  is not judged again. Correction of 7.26.22: on `pin="`, 7.26.22 and 7.26.23
  take about twice the time of 7.26.20 (1.96x, not the "73 ms against 60"
  written there); 7.26.24 takes 1.75x. `abcd=` takes what 7.26.20 takes.
- **test: the linearity test fits a slope over three sizes** (64 KB, 256 KB,
  1 MB; best of five interleaved passes; fails only if three measures are
  steep). The ratio of two sizes failed under load and let a quadratic copy
  pass; the new test catches it on 15 of 15 shapes and gives the masking 0.98
  to 1.09, idle and with every core busy.

## 7.26.23

- **fix(`C_IEVENT_CLI`): a session that ends is logged by nobody, as in the C
  transport.** Every close of the websocket was a WARNING (*"WebSocket closed
  ... Code: 1000 ... Clean: true"*), the clean one of a logout included, ahead
  of the branch that tells what happened: so a console check of an app passed
  or failed depending on when the close of its logout landed (one consumer
  app's, after 7.26.22). An ended session is published as `EV_ON_CLOSE` and
  logged by nobody; a socket that closes before it ever opened is still the
  `EV_ON_OPEN_ERROR` warning. With the gclass's `ievents` trace on, every close
  is traced. Test `ievent_close_logs` (red on 7.26.22). *Too much was silenced:
  a session CUT (1006, 1011, a close of the server with another code) left no
  trace either; 7.26.24 warns for it again.*
- **fix(`C_IEVENT_CLI`): the reason of a failed open is masked.** The
  `EV_ON_OPEN_ERROR` warning wrote the close reason the server gave as it
  came; 7.26.22 masked it in the other close log and not in this one. Masked
  and capped now, as every text of the server.

## 7.26.22

Parity with the C kernel of 7.26.10: the masking,
the reading of an attribute's value, and the check of a gobj destroyed under
code that still runs on it.

- **fix: a token in the query of a URL is masked**, as in the C kernel (`GET
  https://my-file-server.com/get?token=abc&x=1`, `{url:
  "https://cdn.public.example/x?access_token=abc"}`): the name of a
  `name=value` was the whole word before the `=`, host and path included. The
  run of name characters before the `=` is judged too. In every published
  version.
- **fix: what 7.26.19 masked is masked again.** 7.26.21 said that nothing
  7.26.9 hid is shown, but it compared with 7.26.20. Against 7.26.19 it showed
  a hidden value in 66 of 232 444 texts: the value of a name of a segment
  jumped over a `name=value` (`db_pass='password'=hunter2`). 7.26.19's reading
  is kept whole.
- **fix: a name is judged as the C kernel judges it**: its case is folded in
  ASCII (`toLowerCase()` folded the Kelvin sign into `k`), and it is judged by
  its last 128 bytes of UTF-8, not by 128 UTF-16 units (`"file_" + 62×"é" +
  "_password=x"` was masked by C and shown by JS). The price, as in C: a name
  over 128 bytes whose secret part lies before those 128 bytes shows its value
  (2 826 of 45 564 texts built around the cap and the case; none of the
  272 444 generic texts).
- **A JWT header whose only dots end it is no JWT** (`eyJhIjoxfQ.`): 7.26.21
  masked it, against its doc.
- **fix: `C_IEVENT_CLI` logs no text of the server unmasked**: the error of
  `JSON.parse()` (V8 quotes a slice of the frame, one that can begin inside a
  secret's name: `..."assword": hunter2}`), the frame dropped (its first 256
  characters, raw), the names of the event, the service and the role, and the
  close reason. Masked, then capped on a whole character. In every published
  version. Test `ievent_peer_logs`.
- **The masking is as fast as in 7.26.20 again** on the MB of `abcd=`: 51 ms
  (112 ms in 7.26.21, 53 in 7.26.20). 7.26.21 judged each name twice, each time
  with a substring, `toLowerCase()` and two regular expressions, and its
  7.26.20 reading allocated an array at every character. `pin="` is slower (73
  ms against 60): the price of keeping 7.26.19's reading. The test of linearity
  is a ratio of 1 MB to 256 KB, not a wall-clock cap (the cap of 500 ms failed
  under load). C and JS answer the same on 318 008 texts, 30 000 jsons and
  286 445 names.
- **fix, BREAKING: a value written to an attribute is read as its type, the
  same way as the C kernel** (`json2item()` and now `gobj_write_attr()`, which wrote its
  value raw; the kw of `gobj_create()`, `gobj_write_attrs()`, the persistent
  attrs; new `command_parameter_from_json()` / `command_parameter_from_text()`,
  the C parser's grammar). `parseInt("12abc")` wrote 12, `Number("")` 0, a
  boolean was `false` for `"maybe"` or `"yes"`, and a refusal said only *"attr
  NaN"*. A string for a boolean, integer, real, list or dict is read from its
  text, and a number or a boolean as the exact type (`2.7` to an integer
  refused). A refused value is not written: one `log_error` names the attr, its
  type, why and the value masked and capped to 64 characters (new `SDF_SECRET`
  flag, the C bit: its value never shown), and the attr keeps its value. In a
  kw, an `undefined` value is an absent key; `gobj_write_attr()` of
  `undefined` to a typed attr is refused. The typed writers read the value as
  THEIR type by the same grammar: `gobj_write_integer_attr()` refuses `2.5`,
  `NaN` and `"12abc"` (`parseInt()` wrote 2 and 12), `gobj_write_bool_attr()`
  reads `"yes"` as `true`, and `gobj_write_str_attr()` writes
  `null`/`undefined` as `""` (they were the texts `"null"` and `"undefined"`).
  `set_timeout()` and `set_timeout_periodic()` round the time to whole
  milliseconds (0.3 * 1000 is 300.00000000000006). **BREAKING: a refused
  write keeps the value the attr had**, as C's `json2item()` does, also for NO
  value: `gobj_write_bool_attr(g, "b", undefined | null | "" | "maybe")` wrote
  `false` and returned 0 up to 7.26.21; it returns -1 with an ERROR and `b`
  does not change. `gobj_write_attr()` of `null` or `""` to a `DTP_REAL` (or
  any typed attr) wrote it; it is refused now. A caller whose value can be
  absent computes it before the write (`kw.x === true`). A table of 71 cases
  (`tests/fixtures/attr_types_parity.json`) is read by the tests of both
  kernels, with the same outcome for each. Measured on the test suites of
  gobj-ui, gui_agent, gui_treedb and two consumer apps: no value
  refused. Test `attr_types.test.js`.
- **`gobj_destroy()` says when it destroys a gobj under code that still runs
  on it**, with the C kernel's check (7.26.10): *"Destroying a gobj while its
  tree is publishing"* (a subscriber destroys the publisher or an ancestor of
  it, or a publisher destroys itself in an action its subscriber sent it) and
  *"Destroying a gobj while one of its actions is still running"*, naming
  `destroying`, `publisher`/`running`, `event`, `destroyer`, `inner_event`,
  with the stack. The destroy is done all the same. Not an error: a gobj
  destroying itself in its own action, a host destroying its transport in the
  transport's `EV_STOPPED`. The runtime keeps a frame per action, publication
  and framework method; the walks of `gobj_start_tree()`/`gobj_stop_tree()` no
  longer go down into a gobj that ended itself in its own
  `mt_start`/`mt_stop`. Cost: +7 ns per `gobj_send_event()` (15 -> 22 ns
  median, Node 24); a publication to 4 subscribers unchanged within noise.
  Test `destroy_under_dispatch`.
- **fix(`C_TIMER`), BREAKING: a pure child PUBLISHES its timeout to its
  parent, which it subscribes in `mt_create`, as the C timer does.** Up to
  7.26.21 it SENT it to its parent, also when it had a `subscriber`, so a host
  that ended its timer in the timer's `EV_TIMEOUT` broke the kernel's rule in C
  and said nothing in JS. Now the host's `EV_TIMEOUT` action runs inside the
  timer's publication: destroying the timer or the host there is the ERROR
  above (defer it with `gobj_post_event()`), and a timer given a `subscriber`
  is heard by it alone. 26 consumers create a `C_TIMER` as a pure child (13
  in gui_agent, 2 in gui_treedb, 11 in the consumer apps; plus 2 in gobj-js
  itself, and none in gobj-ui): none destroys the timer or its host in `EV_TIMEOUT`, and none gives
  the timer a `subscriber` -- checked one by one for this note.
- **fix(`C_IEVENT_CLI`), BREAKING for a host of a pure child: it PUBLISHES its
  events, to its parent, which it subscribes in `mt_create` -- the C
  transport's contract.** Up to
  7.26.21 it SENT `EV_ON_ID_NAK`, `EV_ON_OPEN` and every message that names no
  service to its parent and subscribed nobody: the parent never heard
  `EV_ON_CLOSE` / `EV_ON_OPEN_ERROR`, a `subscriber` other than the parent
  never heard the three, and a host ending the transport in its
  `EV_ON_ID_NAK` was not reported as C reports it. One subscription (the
  `subscriber` attr, else the parent), so a parent that is also the subscriber
  hears each event once. Such a host must now declare `EV_ON_CLOSE` and
  `EV_ON_OPEN_ERROR` in its FSM, or each is *"Event NOT DEFINED in state"*. No
  consumer hosts it as a pure child (all of them create it with
  `gobj_create()` / `gobj_create_service()`). Test `ievent_pure_child`.
- Deploy note: this version reaches the apps together with gobj-ui
  7.26.43 and gui_agent 0.29.54 / gui_treedb 0.17.120, which defer the five
  destroys it would otherwise report in the console.

## 7.26.21

Parity with the C kernel (the masking it released in 7.27.0).

- **After `Bearer` or `Basic`, only a word that can be a credential is
  masked**, by the rule of the C kernel's `scheme_credential()`: a quoted one,
  one after the scheme doubled (`Bearer Bearer tok`), or one that is not a word
  of prose -- it holds a digit or one of `_~+=`, mixes its case past its first
  letter, or is 24 characters or more; for `Bearer` 8 at least, for `Basic` the
  base64 of a `user:password`. `the bearer of this letter` showed
  `the bearer ******** this letter`; `basic plan` is left as it is.
- **A JWT or a JWE is `eyJ`, base64url and a `.`** (two parts or more): a JWE
  (five parts) and a JWT a cap cut were shown.
- **A `name: value` whose name is a secret's is masked**, its name in quotes
  or not (`"password": hunter2`, `bearer: tok`, `X-Auth-Token: x`), and a value
  that is a scheme and its credential WHOLE (`Authorization: Basic x` is
  `Authorization: ********`; it was `Authorization: Bearer ********`).
- The twin tests carry the C kernel's table, and the same 30 000 texts give the
  same answers on both sides.
- **Nothing that the masking of 7.26.9 hid is shown** but the word after a
  bare `Bearer` that cannot be a credential (as in the C kernel): each rule
  judges the text as it came (the characters to mask are marked, a run of
  them is one `********`), and 7.26.9's reading of the parameters is kept
  whole. 7.26.20 showed the value of a `name=value` whose name a JWT of two
  parts took (`eyJ..bearer1=x`), whose `=` the word after `Bearer Bearer` took, or that a
  label's value hid (`x-auth-token: password=a,b` showed `,b`); the rest of a
  token after a byte of no token68 (`Bearer abc%2Bdef`: the word of 7.26.9's
  Bearer is masked whole, its dots at the end too). A `\"name\":\"x\"` of a
  json inside a json is a `name: value` (its value to the quote escaped the
  same way), a character that is no ASCII is no letter of prose, and the
  base64 of `Basic` is read as far as it goes (`(Basic dXNlcjpwYXNz)`). The C
  and JS twins give the same answers on 230 078 texts.

## 7.26.20

Parity with the C kernel (the masking it released in 7.27.0).

- **A secret by its VALUE, as the C kernel masks it.** `mask_secrets_inline()`
  and `json_mask_secrets()` (every string, under any key) mask a JWT (`eyJ...`,
  three base64url parts joined by `.`; a `.` after it, the end of a sentence,
  is not a fourth) and the token after `Bearer ` (any case, a word of its own)
  wherever they are -- the shapes of the C kernel's `jwt_len()` /
  `bearer_token_len()`. A JWT under a plain key showed in clear. A string with
  a NUL inside is read as a blank, as C reads it.
- **`is_secret_name()` takes `pass`, `pin` and `otp` as WHOLE segments** (a run
  of letters and digits: `db_pass`, `user-pin`, `sim_pin`, `user[pin]`; not
  `passive`, `ping`, `spinner`, `otpx`), with the same exclusions (`pin_count`
  is not one). `key` and `cert` stay no secrets' names. The list is the C
  kernel's again.
- **`set` of the yuno's trace commands is read as the C kernel reads it**
  (`trace_set_value()`): a boolean, an integer, or text -- `set`/`reset`, a
  JSON integer `-?(0|[1-9][0-9]*)`, `true`/`false`, `yes`/`no`, `on`/`off` in
  any case. It went through `Number()`, which took `" 1"`, `"0x1"`, `"1e3"`,
  `"+5"`, `"007"`, `"2.5"` and a real (refused now, as in C), and refused
  `"yes"` and `"on"`.

## 7.26.19

- **fix: the reentrancy guard of 7.26.18 swallowed console lines.** It was
  ONE guard for every log function, and `log_info()`, `log_debug()`,
  `trace_msg()` and `trace_json()` write their console through it: a remote
  function that logged one of those levels lost its console line (the sink
  and the backlog still had it). The guard is the remote function's only
  now. 7.26.18 said "the inner line still reaches the console", which was
  true only for errors and warnings. The guard stops synchronous recursion;
  a remote function that logs from a timer still loops, so a teardown
  unwires it first (`set_remote_log_functions(null)`).

## 7.26.18

- **a log function that logs is not called again from inside itself**: a
  remote one (`set_remote_log_functions()`) whose socket logs as it fails
  recursed until the stack overflowed -- some 2000 lines in 27 ms, enough to
  fill the backlog of 600. The inner line still reaches the console and the
  sink; only the remote call is dropped.
- `log_stringify()` writes a BigInt as text, all its digits: `JSON.stringify()`
  threw on it, so a `trace_json()` of one replayed from the backlog lost the
  value.

## 7.26.17

- **fix: a log path could still throw.** `trace_json()` kept its payload in
  the backlog with a bare `String()` fallback, which throws on an object with
  no prototype, a `toString()` that throws or a revoked Proxy (so
  `trace_json_masked()` threw too); it goes through `log_stringify()` now.
  Its message is printed with `log_string()` (a Symbol or an object threw in
  `"=====> " + msg`), and `console.dir()` cannot throw out of it.
- **a log function that throws no longer takes its caller with it**: the
  remote one of `set_remote_log_functions()` (a socket that is gone) and the
  console ones are called inside a `try`; what they threw goes to the console.
- `format_log()`: `%%` is a `%` and takes no argument (it came out as `%%`),
  `%j` prints json (it stayed literal, and its argument went to the end), and
  a BigInt in `%d`/`%i`/`%f` keeps its digits (`parseInt()` rounded it).

## 7.26.16

- **fix: `format_log()` could still throw.** `%s` went through `String()` and
  `%d`/`%f` through `parseInt()`/`parseFloat()`, which throw on an object with
  no prototype, a `toString()` that throws, a revoked Proxy or (for the
  numbers) a Symbol -- so `log_error("%s", x)` threw. Every conversion of a
  log line is guarded now; what cannot be a string is printed as json, or as
  `<type: not printable>`. 7.26.15 said "a log line can no longer throw",
  and it could.
- **`kw_get_dict()` / `kw_get_list()` with `KW_CREATE` over a `null` and no
  default of the right type** treat it as a missing key, as C does since SDK
  7.26.9: silent, or "path not found" with `KW_REQUIRED`. They logged
  "cannot create" for it.
- docs: `kw_clone_by_keys()` / `kw_clone_by_not_keys()` no longer say "new
  keys are the paths": they read keys as keys, now as C does.

## 7.26.15

- **fix: a log line could still throw.** `log_stringify()` fell back to
  `String()`, which throws on an object with no prototype or a `toString()`
  that throws; and the jdb had its own copy, which read `e.message` of a
  thrown `null`. One function now, safe all the way down; the jdb uses it.
- docs: `kw_get_dict()` / `kw_get_list()` say what `KW_CREATE` does over a
  `null` and over another type, and where C differs.

## 7.26.14

- **`kw_get_dict()` / `kw_get_list()` with `KW_CREATE` over a value of another
  type log it** (they gave an unwritten default back in silence), and a
  `null` at the path is replaced by the create, as a missing key -- the C
  readers do the same since SDK 7.26.9, except that C returns NULL where JS
  gives the unwritten default back.
- **the jdb's error lines cannot throw**: a record that is circular, or holds a
  BigInt, broke the `JSON.stringify()` of its own error message.

## 7.26.13

- **fix: `kw_set_dict_value()` refuses a path with an empty segment**
  (``"a`"``, ``"`a"``, ``"a``b"``): it wrote the key `""` (`{a: {"": v}}`),
  while the C writer dropped the segment and wrote over `a`. Both writers
  refuse it now (SDK 7.26.9 for C), logged, `-1`, nothing written; so do
  `kw_set_subdict_value()` and a reader with `KW_CREATE` over such a path.

## 7.26.12

- **fix: `jdb_update()` / `jdb_delete()` with a record that is not an object
  threw a TypeError** (`kw["id"]` on `null`). They answer `null` with an error,
  and the error shows the record as json (it printed `[object Object]`).
- **fix: a path with an empty segment** (``"a`"``, ``"`a"``) was taken as the
  path without it, or failed further on. It is refused, logged.
- docs: a json reader with `KW_CREATE` that cannot write gives its default
  back, unwritten and logged -- C returns NULL there since SDK 7.26.9, and both
  pages say so.

## 7.26.11

- **fix: `jdb_update()` threw a TypeError when the hook of the record its path
  ends on was not a list** (`5`, a string, an object). It answers `null` with
  an error now.
- **fix: a failed `jdb_update()` changed the jdb**: walking the path created
  the hook list of every record it went through, so ``"a`zz"`` left
  `a.data = []` behind. Walking creates nothing now.
- **fix: at the root, an `id` that was already there was added a second
  time.** It is updated, as under any record.
- docs: an empty dict in a jdb schema is an empty group (no topic); an empty
  SEGMENT of a kw path is a key `""` in JS, which C does not agree on.

## 7.26.10

- **fix: `jdb_update()` and `jdb_delete()` said nothing when they did
  nothing.** A record of `path` that is not there, or a record to delete that
  is not there, gave the topic back as if it had written. Both answer `null`
  with an error now.
- **fix: `jdb_init()` made a topic of a dict that groups topics**, so the
  topics under it went through a list (`{schema: {a: {b: []}}}` logged
  *"segment 'b' is not an index"*). Only a leaf of the schema is a topic.
- **fix: an empty path is refused by `kw_set_dict_value()`** (and so by
  `kw_set_subdict_value()` and a `KW_CREATE` reader), as C does: it wrote
  `kw[""]` and answered `0`.
- `jdb_get_topic()` passed an argument `kw_get_dict_value()` does not take.

## 7.26.9

- **fix: `jdb_init()` created nothing.** It passed `1` where it meant to
  create, and `1` is `KW_REQUIRED`: a jdb built from a schema had no topic and
  no hook, and `jdb_update()` pushed a child into a hook list that belonged to
  no record. Every one of those calls is `KW_CREATE` now. Nobody in the
  libraries or the apps uses the jdb; the API reference gets its example.
- **fix: `kw_set_subdict_value()` logged a scalar in the middle of its path
  twice** (`{a: 5}` with ``"a`b"``): `kw_find_path()` logs that one even when
  it is not verbose, as in C, and `kw_set_dict_value()` logged it again. Once
  now, as 7.26.8 said.

## 7.26.8

- **fix: `kw_set_subdict_value()` answered `0` for a path it could not
  write**, and wrote the value into a dict that belonged to nobody: it went
  through `kw_get_dict(KW_CREATE)`, which hands back its default when the
  create fails. A path that is not a string, a segment that is not an index of
  its list, or a value at the path that is not an object is now `-1` with one
  log error, and nothing is written.
- **fix: `jdb_update()` and `jdb_delete()` threw a TypeError** on a path that
  is not a string (`path.split()`); they answer `null` with an error now, as
  for a missing topic.

## 7.26.7

- **fix: a path that is not a string threw a TypeError** in `kw_delete()` and
  `kw_set_dict_value()` (`path.split()` / `lastIndexOf()` on `null` or a
  number). Both answer `-1` with an error now, as `kw_find_path()` already
  did. The test checks the errors are logged.

## 7.26.6

- **fix: `kw_delete()` as C.** A key or a parent that is not there answered
  `0` in silence, and a top-level list still threw a TypeError on `length`.
  Now only a key of a dict is deleted; anything else is `-1` with an error
  (`path not found`, `cannot delete an item of a list`), as C. Nobody in the
  libraries or the apps deletes a key that may be missing.
- **removed: the dead treedb register of `lib_treedb.js`**
  (`treedb_register_formtable`, `treedb_unregister_formtable`,
  `treedb_register_nodes`, `treedb_register_update_node`,
  `treedb_register_del_node`, `treedb_get_register`, `treedb_get_topic_data`,
  `treedb_get_topic_field_data`). They were not exported, nobody called them,
  and they could not have worked: their calls lacked the `gobj` argument, and
  the `true` meant as "create" is `KW_REQUIRED`.
- **notes on 7.26.4:** C's path WRITER also drops empty segments (`split2()`
  is strtok-based), so in C `a`` replaces the whole `kw.a` while its reader
  answers item 0; JS refuses it in both. And of the masking markers, four are
  C's literals; `"<not shown: the masking failed>"` exists only here.
- tests: `kw_delete()` of a missing key, a missing parent and a top-level
  list; the retry armed when the failure cannot be posted (queue full).

## 7.26.5

- **security: `create_template_record()` (lib_treedb) assigned the template's
  keys.** The template is the backend's schema, so a parsed key `__proto__`
  became the PROTOTYPE of the new record (`.admin === true`, lost by
  `JSON.stringify()`). It writes own keys now. The last copy by assignment
  found.

## 7.26.4

- **fix: the path WRITERS read a list as the reader does.** 7.26.2 made
  `kw_find_path()` take a list segment only as an index, and left the writers
  behind: `kw_set_dict_value(kw, "a`length", 0)` emptied the list, `"a`01"`
  wrote a property `"01"` on the array (invisible in JSON) while the reader
  took it as item 1, and `kw_delete(kw, "a`length")` threw a TypeError. Now a
  list is walked by an index inside it (digits, read as `atoi()`), never grown,
  and anything else is refused with an error, as C does; `kw_delete()` of a
  list item is refused with an error, as in C (which deletes only a key of a
  dict). The remaining difference with C: its `atoi()` also takes `" 1"`,
  `+1` and `1abc` as item 1 and `""`/`abc` as item 0; here they are not found.
- **fix: a failed open whose failure could not be posted left the link without
  a retry.** `gobj_post_event()` refuses when its queue is full (logged); the
  retry is armed directly then.
- **docs: `createOneHtml()`** says its string is markup in any mode.
- **correction to 7.26.2:** before it, a STRING in a list of children was not
  parsed as html either: it was DROPPED in silence, like the Text node and the
  svg. Since 7.26.2 it is appended as text, and a number or an object in the
  list is logged as an ERROR — so `[count && ['b', {}, 'x'], ...]` with a count
  of 0 logs one now (`false`, `null` and `undefined` are skipped).
- tests: the own-key copies of the C_IEVENT_CLI inject and of `jdb_update()`,
  a stale posted failure ignored, and the backoff over several failed opens.

## 7.26.3

- **feature: `html_markup(string)`, markup said out loud.** `createElement2()`
  reads a plain string that starts with `<` as html, so whether a string runs
  depends on its CONTENT, not on who wrote it: a value from a backend that
  starts with `<` runs. `html_markup('<i class="yi-copy"></i>')` is the explicit
  way to ask for markup (in the third slot or in a list of children; every node
  of it is kept, not only the first). `is_html_markup()` tells it apart.
- **feature: `set_strings_are_text(true)`.** Opt-in mode of `createElement2()`
  in which a plain string is ALWAYS text and `html_markup()` is the only way to
  insert markup. A string that starts with `<` is then logged once (a
  deliberate one not migrated yet, or a datum that used to run as html). The
  default is unchanged: an app turns it on once its code and the libraries it
  mounts are migrated. The default flips only when every consumer is.

## 7.26.2

- **fix: a url the browser refuses opened nothing and said nothing.** When
  `new WebSocket()` THROWS (a malformed url, typically one edited by hand),
  `C_IEVENT_CLI` only logged: no `EV_ON_OPEN_ERROR`, no retry, the link left
  running in `ST_DISCONNECTED` with no timer. Up to 7.26.0 the warning arrived
  by accident, with the stale close of the previous socket. The failure is now
  posted as the close of a socket that never opened, so it publishes
  `EV_ON_OPEN_ERROR` and arms the retry, at the start and on every retry. A
  posted failure of a socket that a later start replaced is ignored.
- **fix: a deliberate stop while the socket was still connecting published
  `EV_ON_OPEN_ERROR`.** Nothing failed to open; it publishes nothing now. A
  stop with a session open still publishes `EV_ON_CLOSE`.
- **security: the copies by assignment that were left.** `flat_diff()` (a
  `__proto__` id was lost, so diff → apply did not make the round trip),
  `kwid_new_dict()`, `kw_set_subdict_value()`, `duplicate_objects()`, the jdb
  update, and the `Object.assign()` of `gobj.js` and `C_IEVENT_CLI` — the
  publication twin, the subscription match and the injected kw, where a kw
  parsed from the backend with an own `__proto__` reached the subscriber with
  a prototype the backend chose. All copy own keys now. The 12
  `x.hasOwnProperty()` of `gobj.js` are `.call()` too.
- **fix: `kw_find_path()` read `length` of a list as an item.** In a list a
  segment is an index (digits only, read as C's `atoi()` reads them); any other
  segment is not found. C answers item 0 for a segment that is not a number
  (`atoi()`); that difference is left on the C side.
- **fix: `createElement2()` dropped a Text node (or an svg) in a LIST of
  children, in silence.** A node is appended as it is, a string in that list
  is appended as TEXT (never markup), and any other non-null child is logged.
  A bare string in the third slot is still markup when it starts with `<`
  (that contract is unchanged; see its docstring).
- tests: run with `jsdom` (new devDependency) for the DOM helpers.

## 7.26.1

- **fix: a start whose url fails let the old socket's close in twice.** The
  socket's sequence number was counted after `new WebSocket()`, so a url that
  throws left the old socket current: its late close was delivered after the
  one `mt_start()` already delivered, publishing a spurious
  `EV_ON_OPEN_ERROR` and arming a retry against the bad url. Counted before.
- **security: an own `__proto__` key turned into the prototype when copied.**
  7.26.0 writes `__proto__` as an own key (as `JSON.parse()` does), and the
  helpers that copy by assignment — `json_object_update()`,
  `json_object_update_existing/missing()`, `json_object_set()`,
  `kw_clone_by_keys()`, `kw_clone_by_not_keys()`, `flat_apply()`,
  `json_mask_secrets()` — then set it as the PROTOTYPE of the copy
  (`.admin === true`, `JSON.stringify()` = `{}`). They write own keys now, and
  `json2flat()` keeps a top-level `__proto__` as `flat2json()` does.
- **fix: an inherited method was read as a value.** A path read answers only
  what the kw OWNS: `kw_get_dict_value(null, {}, "toString")` answered a
  function, and `kw_match_simple({}, {valueOf: 0})` answered true. Every
  `x.hasOwnProperty(k)` of helpers.js is `Object.prototype.hasOwnProperty.call()`,
  so a kw with no prototype, or with its own `hasOwnProperty` key, works.
- **fix: `DTP_JSON` decodes only a string that encodes a dict or a list.**
  7.26.0 decoded every string that parses, so a persisted `"42"` came back a
  number. The comment says the one difference with C.
- **fix:** the log of an action that throws names the state it ran in, not the
  next one.

## 7.26.0

The minor follows the SDK (7.26.x); no API was removed. Each fix is pinned by
a test (`tests/runtime_contracts.test.js`,
`tests/ievent_restart.test.js`).

- **fix: `log_error()` / `log_warning()` / `log_info()` / `log_debug()` /
  `trace_msg()` dropped their arguments.** They took `format` alone, so
  `log_error("Command not found: %s", command)` printed `... undefined`, against
  the printf contract of the README and the docs. They pass `...args` now; a
  message with no arguments (a template literal) is printed as it is, `%s` in
  its data included, and a circular argument no longer makes the log throw.
- **fix: a filter on a false value never matched.** `_kw_match_simple()`
  tested the record value with the C `if(!ptr)`, so `{online: false}`,
  `{channel: 0}` and `{name: ""}` matched nothing — in a subscription
  `__filter__`, `kw_select()`, `kw_collect()`, `kwid_collect()`. It tests
  `undefined` now. And `cmp_two_simple_json()` reads a non-numeric string as 0
  against a number, as `jn2integer()` does in C: NaN compared "equal" to every
  number, so `{n: 5}` matched `{n: "abc"}`.
- **security: a path through `__proto__` wrote `Object.prototype`.**
  `flat2json({"__proto__`polluted": "yes"})` and
  `kw_set_dict_value(null, {}, "__proto__`isAdmin", true)` set a key on every
  object of the page, and `kw_get_dict(null, {}, "__proto__")` answered
  `Object.prototype`. `__proto__`, `constructor` and `prototype` are keys like
  any other now, as in C: read only when the kw holds them, written as its own
  key. The services registry has no prototype either.
- **fix: `C_IEVENT_CLI` stopped and started in the same turn broke the
  link.** The late close of the old socket ran as the current one: it unwired
  the NEW socket and left it open for ever; and the new socket's open, arriving
  while the FSM was still in `ST_SESSION`, was sent to the backend as a message
  called `EV_ON_OPEN`. Every socket carries its sequence number now, a stale
  one is ignored, and `mt_start()` ends the old session itself (its
  `EV_ON_CLOSE` is published at the start). The `EV_ON_CLOSE` kw is plain json
  (`code`, `reason`, `was_clean`), not the DOM `CloseEvent`.
- **fix: a malformed frame from the peer threw a TypeError** in
  `ac_on_message`. It is dropped with a warning and a capped dump; the parser's
  own lines are warnings too (bad bytes from a peer, not a broken invariant).
  A `__subscribing__` / `__unsubscribing__` from the peer is logged, as in C.
- **fix: an action that throws lost the rest of the posted events**, and the
  trace's depth grew for ever. The exception still goes on (a test must fail
  on it), logged once with its stack; the events posted after it go out on the
  next turn.
- **fix: `mt_writing`, `mt_child_added`, `mt_child_removed` were looked up on
  the gobj instead of its gclass** in `gobj_write_attr()` with a path and in
  `gobj_change_parent()`, so they never ran.
- **fix: `priv` mirrored the wrong value.** `sdata_write_default_values()`
  (`gobj_reset_volatil_attrs()`) stored `set_default()`'s return, always 0;
  `gobj_write_bool/integer/str_attr()` stored the raw value while the attr held
  the coerced one.
- **fix: `DTP_JSON` takes any json, as in C** — `null`, a scalar, a string that
  is not json — and an empty default is a json null (it logged *"default_value
  WRONG"*). A NaN for `DTP_INTEGER`/`DTP_REAL` is logged and NOT stored.
- **fix: a destroyed default service could not be built again**
  (*"default service ALREADY registered"*, and `__default_service__` resolved
  to the dead gobj).
- **fix, small:** `kw_clone_by_not_keys()` drops a key saved as `false` and
  answers `{}` for an absent kw (`gobj_remove_persistent_attrs()` with nothing
  saved threw); `gobj_set_bottom_gobj(gobj, null)` no longer warns *"already
  set"*; *"parent service not found"* names the service, not `null`;
  `gobj_find_service()` checks the type of the name; `c_yuno` plays and pauses
  no default service when there is none; `build_command_response()` keeps an
  empty comment a string; the vitest block of `vite.config.js` was nested in
  `build` and never read.
- **docs:** README — logging with arguments, `gobj_yuno_name/role/id()` take
  no argument, the optional parameters of `gclass_find_by_name()`,
  `debounce()`, `jwt2json()`, the flat json and the secret-masking API, the
  GClass example (attrs ARE loaded in `mt_create`, which holds the
  subscription block), the version rule in *Publish*, the source layout.
  `createElement2()` says that a string starting with `<` is markup, and that
  data goes in as a Text node. The 7.16.0 entry of this file is in English.

## 7.25.9

- **security: traces and logs do not show credentials.** New
  `is_secret_name()`, `mask_secrets_inline()`, `json_mask_secrets()` and
  `trace_json_masked()` (helpers.js), with the C kernel's rule and lists: a
  key whose name is a secret's (`password`, `token`, `api_key`,
  `private_key`...) is shown `"********"` at any depth, whatever its type; so
  is a `name=value` inside a string (a command line) and the `value` of a
  write-attr whose `attribute` names a secret. The commands trace of
  `gobj_command()` (line and kw), the machine trace with `ev_kw` (an event
  sent, executed, published, a subscription), the kw a `kw_get_*()` error
  dumps and `C_IEVENT_CLI`'s ievents trace print that way. Up to 7.25.8 they
  printed a command's password in clear. Only JSON is walked (plain objects
  and arrays): a gobj, a widget, a DOM node, a class instance or a typed
  array in a kw is written as it is, never walked; a cycle is not walked
  twice, a nesting deeper than 64 levels is `"<deeper not shown>"`, and the
  masking never throws (a failure is `"<not shown: the masking failed>"`). A
  name that names something ABOUT a credential (`token_endpoint`,
  `cookie_domain`, `jwt_public_keys`, `*_count`) is not masked, as in C. An
  unquoted value ends at the end, at the quote that closes an outer quoted
  value, or before the next `name=` -- not at any quote -- so
  `command='... password=x'` keeps its closing quote.

  ```js
  gobj_command(gobj, "set-user-pwd username=bob password=hunter2", {}, gobj);
  // 🌀🌀 mach(...), cmd: set-user-pwd username=bob password=********
  ```

  Publishing costs the same as before the rename and the masking: 701
  against 703 ns per delivery (100 subscribers, 20000 publications, the
  mean of 8 alternated runs). The rename is read as a field
  (`subs.renamed_event`); with `kw_get_str()` it cost ~8-12% more.

- **`subs_flag` carries the C kernel's bits** (`__rename_event_name__` 0x1,
  `__hard_subscription__` 0x2, `__own_event__` 0x4; hard was 0x1 and own 0x2).
  Nothing reads the number across the wire or from a store.
- **`__rename_event_name__` renames, as in C.** A subscription whose
  `__config__` renames the event to one that some gclass declares stores it
  as its `renamed_event`, takes the key out of the stored `__config__`, adds
  `__original_event_name__` to its `__global__`, and the subscriber is SENT
  the renamed event. Up to 7.25.8 the rename was a TODO: the key stayed in the
  stored `__config__`, nothing was renamed, and the matching of repeats and
  withdrawals differed from C (a plain kw with the rest of that `__config__`
  made a second subscription where C has one). The renamed event is compared
  on its own: a renamed subscription over a plain one, and two renames of one
  event, are two; a plain kw is a wildcard, so a plain subscription over a
  renamed one replaces it, and a plain unsubscribe removes both. A rename to
  an event no gclass declares is logged (*"EVENT NOT FOUND"*) and stays in the
  `__config__`, as in C. No JS consumer sets `__rename_event_name__`.

  ```js
  gobj_subscribe_event(pub, "EV_ON_MESSAGE",
      {__config__: {__rename_event_name__: "EV_A"}}, sub);    // sub declares EV_A
  gobj_publish_event(pub, "EV_ON_MESSAGE", {});               // sub gets EV_A,
                                                              // {__original_event_name__: "EV_ON_MESSAGE"}
  ```

- **A subscription withdrawn meanwhile is not a hard one kept.** When the
  publisher's `mt_subscription_deleted()` withdraws a later entry of the same
  unsubscribe, `gobj_unsubscribe_event()` counted it as a hard subscription
  kept and warned *"Hard subscription not removed"*. It is gone, as asked, and
  nothing is logged; `gobj_unsubscribe_list()` logs a stale entry once per
  call, as a warning (*"Subscription(s) already removed, nothing to remove"*).
  Same as the C kernel.
- **A repeated `__own_event__` or hard subscription is found again.**
  `_create_subscription()` takes these keys out of the stored `__config__`,
  but the repeat check and `gobj_unsubscribe_event()` compared the kw with
  them still in it: a repeat was made a second time (every event arrived
  twice) and the same kw could not withdraw it. The kw is matched as it is
  stored, as in the C kernel since SDK 7.25.5. A repeat of a hard
  subscription returns the one there with a warning, and an unsubscribe that
  leaves a hard subscription says so.
- **`gobj_unsubscribe_list()` removes the subscription it is given.** Up to
  7.25.8 the entry removed was the first one whose fields matched, so a stale
  plain subscription took a live one with it (a filtered subscription of the
  same event and subscriber). The object itself is looked up now, and one no
  longer there is logged (a warning) and not passed to
  `mt_subscription_deleted()`.

## 7.25.8

- **security: a subscription that rewrites the kw gets its own.**
  `gobj_publish_event()` gave every subscriber the SAME kw and applied each
  subscription's `__local__` (`kw_pop`) and `__global__`
  (`json_object_update`) to it. So one subscription forged or stripped the
  event of every subscriber after it, and of the publisher, and the
  `__filter__` of a later subscription was evaluated on the altered kw (a
  filtered subscriber lost events it should get, or got events it should
  not). The C kernel had the same defect and fixed it after SDK 7.25.4; this is
  the port. A subscription with a non-empty `__local__` or `__global__` now
  gets a **twin**: a new top-level object with the nested values shared, and
  `__global__` goes in as a copy, so a receiver that changes it does not
  change the subscription. Every other subscriber still gets the publisher's
  kw, with no copy. `__filter__` and `mt_publication_filter` see the
  publisher's kw.

  ```js
  gobj_subscribe_event(pub, "EV_X", {__global__: {tag: "a"}}, sub_a); // {v: 1, secret: "s", tag: "a"}
  gobj_subscribe_event(pub, "EV_X", {__local__: {secret: 0}}, sub_b); // {v: 1} (was: tag "a" too)
  gobj_subscribe_event(pub, "EV_X", {__filter__: {v: 1}}, sub_c);     // {v: 1, secret: "s"}
  gobj_publish_event(pub, "EV_X", {v: 1, secret: "s"});               // kw unchanged (was: {v: 1, tag: "a"})
  ```

- **fix: `C_IEVENT_CLI`'s `mt_inject_event()` changes a copy.** It pushed its
  ievent stack into the kw it got, set `__md_iev__.__msg_type__` and deleted
  `__service__`. A published kw is shared, so a local subscriber after the
  transport received the transport's `__md_iev__`, and the publisher's kw
  kept it. It now works on a shallow copy, with `__md_iev__` copied deep.

  No JS consumer relies on the shared-kw mutation: gobj-ui, the yunetas
  `yunos/js/*` yunos and the consumer apps set no `__global__` or
  `__local__` in a subscription.

## 7.25.7

- **fix: `KW_CREATE` over a null or scalar middle segment answers the
  default instead of throwing.** 7.25.6 said a null middle segment gives the
  default as in C; that held only without `KW_CREATE`. With it, the reader
  found nothing and asked `kw_set_dict_value()` to create the path, which
  stepped into the null (or the scalar) and assigned a property on it:
  `TypeError: Cannot set properties of null`. `kw_set_dict_value()` now logs
  *"kw_set_dict_value(): segment '<key>' is not a dict or a list: '<path>'"*
  and answers `-1`, leaving the kw as it was, and so every reader answers its
  default, as C does (`kwid.c` stops at the scalar and logs "long path").

  ```js
  kw_get_int(null, {a: null}, "a`b", 5, kw_flag_t.KW_CREATE); // 5 (was a TypeError), logged
  kw_get_str(null, {a: 5}, "a`b", "d", kw_flag_t.KW_CREATE);  // "d" (was a TypeError), logged
  kw_set_dict_value(null, {a: null}, "a`b", 1);               // -1, logged
  ```

  Latent: the only `KW_CREATE` reader calls in gobj-ui, the yunetas yunos
  and the consumer apps read single-segment paths.

## 7.25.6

- **fix: `kw_find_path()` answers as the C one, and so every typed reader
  handed a bad kw answers its default.** A kw that is not a dict or a list
  answered `0` where C answers NULL, and the readers took that `0` for a
  value found: `kw_get_int()` and `kw_get_real()` answered `0` instead of
  the default, and `kw_get_str()` / `kw_get_bool()` logged a second line
  (*"path MUST BE a json str/boolean"*). It now answers `undefined`, logged
  once as *"kw must be list or dict: '<path>'"*. That line also went through
  `gobj_short_name(null)` with no gobj, which logged the *"gobj bad type"*
  7.25.5 said was gone and printed *"null: ..."*; it now names the gobj only
  when there is one.

  A path whose MIDDLE segment is `null` threw a `TypeError` ("Cannot read
  properties of null"); C answers the default. Now an absent or null middle
  segment answers `undefined` (logged only when `verbose`), and a scalar one
  is logged *"kw must be list or dict"*, as C's recursion does. `KW_CREATE`
  in `kw_get_bool/int/real/str` no longer tries to write into a null kw, as
  C guards it (`&& kw`).

  ```js
  kw_get_int(null, null, "x", 5, 0);          // 5 (was 0), one line logged
  kw_get_str(null, {a: null}, "a`b", "d", 0); // "d" (was a TypeError), silent
  kw_get_str(null, {a: 5}, "a`b", "d", 0);    // "d", logged: kw must be list or dict
  ```

  Latent: no caller in gobj-js, gobj-ui, the yunetas yunos or the consumer
  apps passes a bad kw or reads through a null segment today.

## 7.25.5

- **fix: `kw_get_str()` logs what the C reader logs.** A value that is there
  and is not a string (a number, a boolean, a dict, a list) gives the default
  back and now logs *"path MUST BE a json str"* with or without
  `KW_REQUIRED`, as C does; before, it was silent unless the caller passed
  `KW_REQUIRED`. A `null` value (the key is there and says "no string") is
  never logged -- before, `KW_REQUIRED` logged it. `KW_REQUIRED` still logs a
  path that is not there at all.

  ```js
  kw_get_str(gobj, {name: 5}, "name", "none", 0);                         // "none", logged
  kw_get_str(gobj, {name: null}, "name", "none", kw_flag_t.KW_REQUIRED);  // "none", not logged
  kw_get_str(gobj, {}, "name", "none", kw_flag_t.KW_REQUIRED);            // "none", logged: path not found
  ```

  Every caller in gobj-js, gobj-ui (v2 and v1), the yunetas yunos and the
  consumer apps was checked: none reads a
  value that is not a string or null in normal operation. Two latent ones
  are named in the audit: `kwid_collect()` / `kwid_get_ids()` on a list of
  records with INTEGER ids now log once per record (C does the same), and
  gobj-ui's `C_YUI_UPLOT` read a series `stroke`/`fill` with `kw_get_str()`
  although uPlot takes a function there (fixed in gobj-ui 7.25.19).
- **fix: `kw_get_dict()`, `kw_get_list()` and `kw_get_str()` with no gobj
  logged a false "gobj bad type"** before their own message, which then began
  with "null: ". The message is now the reader's alone, as in `kw_get_bool/
  int/real`, and in C's words: *"path MUST BE a json dict"* / *"... a json
  list"* / *"... a json str"*, with the kw dumped by `trace_json()`.
- **fix: `kw_get_bool()` with `KW_WILD_NUMBER` read a string with
  `parseInt()` and no base**, which reads hex: `{on: "0x1F"}` was `true`. C
  reads it with `atoi()`, decimal only, so `"0x1F"` is `0`, `false`. It is
  `parseInt(s, 10)` now (leading spaces and a sign, then decimal digits, as
  `atoi()`). No caller passes `KW_WILD_NUMBER` today.

Tests: `tests/kw_get_str_default.test.js` and `tests/kw_typed_readers.test.js`
assert the EXACT log lines now (they checked for one message and then cleared
the list, which hid the extra "gobj bad type"); red on 7 of 41 against 7.25.4.

## 7.25.4

- **fix: `kw_get_int()` and `kw_get_real()` answer like the C readers.**
  - `KW_EXTRACT` deleted the value BEFORE its type was looked at: a value
    that was not a number was taken out of the kw and lost, and the caller
    got the default. Now only a value the reader answers with is taken out,
    as in C and as `kw_get_bool/dict/list` do since 7.25.2.
  - A value that is not a number gave the default back with no word unless
    the caller passed `KW_REQUIRED`. C logs *"path MUST BE a json integer"*
    (or *"... a json real"*) in every case, and now so does JS, with the kw
    dumped by `trace_json()`, still giving the default back.
  - `KW_WILD_NUMBER` was ignored. Now it reads a boolean (`1`/`0`), a
    string (`kw_get_int()` as `strtoll()` with base 0: `"0x1F"` is 31,
    `"017"` is 15, `"12abc"` is 12, `"abc"` is 0; `kw_get_real()` as
    `parseFloat()`, 0 when it does not start with a number) and `null`
    (0); a list or a dict answers `0` and logs *"path MUST BE a simple json
    element"*, as in C.
  - `kw_get_int()` truncated a number through `parseInt()`, which reads it
    as its string: `1e-7` gave `1` and `1e21` gave `1`. It truncates toward
    zero now (`Math.trunc()`), as the C cast does.
- **fix: `kw_get_str()` with `KW_EXTRACT` took out a value that was not a
  string**, and answered the default. It takes out only a string now. (C
  refuses to extract a string at all, because its answer would point into
  the freed json; a JS string outlives the kw.)

  No caller in gobj-js, gobj-ui, the yunetas yunos or the project SPAs
  passes `KW_EXTRACT` or `KW_WILD_NUMBER` to these readers, and every
  `kw_get_int()` of them reads a number that the code itself wrote
  (`subs_flag`, `result`, a command's `round`/`write`/`form_write` tag, a
  node's `x`/`y`).

Tests: `tests/kw_typed_readers.test.js`, red on 9 of 32 against 7.25.3;
`tests/kw_get_str_default.test.js`, red on 1 of 7.

## 7.25.3

- **fix: `kw_get_bool()` logs a value that is not a boolean, as the C reader
  does.** Without `KW_WILD_NUMBER`, a value of another type (`1`, `"true"`,
  `null`, a dict) gave the default back with no word unless the caller passed
  `KW_REQUIRED`; a flag written as `1` was simply not set. C logs *"path MUST
  BE a json boolean"* in every case, and now so does JS (with the kw dumped by
  `trace_json()`), still giving the default back. With `KW_WILD_NUMBER`, a
  list or a dict gave the default back; C answers `false` and logs *"path
  MUST BE a simple json element"*, and now so does JS.

  No caller in gobj-js, gobj-ui, the yunetas yunos or the project SPAs passes
  anything but a boolean (`__hard_subscription__`, `__own_event__`,
  `options.create`).

Tests: `tests/kw_typed_readers.test.js`, red on 3 of 18 against 7.25.2.

## 7.25.2

- **fix: `kw_get_list()`, `kw_get_dict()` and `kw_get_bool()` answer like
  the C readers.** A value of the reader's type is the answer; any other
  value, or an absent key, gives the default back **as given**.
  - `kw_get_list()` returned `Array(v)`, and `Array()` WRAPS its argument:
    a list found came back as `[list]` (`{x: [1, 2]}` gave `[[1, 2]]`), a
    default of `[]` as `[[]]` and a default of `null` as `[null]`.
  - `kw_get_dict()` returned `Object(default_value)`: a `null` default came
    back as `{}` and a default of `0` as a `Number` object.
  - `kw_get_bool()` returned `Boolean(v)`, so the string `"false"` was
    TRUE. Now only a boolean is read; with `KW_WILD_NUMBER` a number
    (`0` is false), a string (`"true"`/`"false"` in any case, else its
    integer) or `null` (false) is read, as in C.
  - `KW_CREATE` stores only a default of the right type (never a `null`),
    and `KW_EXTRACT` takes out only a value of the right type, as in C.
    `KW_REQUIRED` logs a value of the wrong type.
  - `kw_set_subdict_value()` asked `kw_get_dict()` for `KW_REQUIRED`
    (flag `true`) where it meant `KW_CREATE`: on a kw without the dict it
    logged *"path not found"* and wrote the key into a dict that nobody
    held. `msg_iev_set_msg_type()` goes through it.

  No caller in gobj-js, gobj-ui, the yunetas yunos or the project SPAs
  relied on the old answers: every `kw_get_dict()` of them reads a dict
  that is there or takes `{}`/`null` as the default and tests it with
  `json_size()` or `if()`; `kw_get_list()` had no caller; `kw_get_bool()`
  reads booleans only.
- **fix: `trace_json()` wrote through `window.console`**, which is not
  there in a worker or in node: a `KW_REQUIRED` miss threw
  *"window is not defined"* instead of logging. It uses the console the
  other log helpers use.

Tests: `tests/kw_typed_readers.test.js`, red on 14 of 17 against 7.25.1;
`tests/kw_get_str_default.test.js` now checks what was logged (it collected
the lines and never looked at them) and takes its log sink away at the end.

## 7.25.1

- **fix: `kw_get_str()` returns its default as given.** It returned
  `String(default_value)`, so a default of `0` or `null` came back as `"0"`
  or `"null"`, and those are TRUE. An `if(value)` on the answer then took an
  absent key for a present one. Two places in this package had that bug:
  `kwid_get_ids()` added the id `"0"` for a record with no `id`, and the
  ievent client sent `"null"` (stats) or `"0"` (an event without
  `__service__`) as the destination service instead of its
  `wanted_yuno_service`. The server did not find those services and used its
  main service, so the message still arrived there. Now the default comes
  back unchanged, as in the C `kw_get_str()`. `KW_CREATE` stores a string
  default, and `null` for any other default, as C does.

Tests: `tests/kw_get_str_default.test.js`; red on 4 of 5 against 7.25.0.

## 7.25.0

- **The version is back in line with the SDK: 7.25.0, as yunetas 7.25.x.**
  No runtime change since 7.22.2: `lib_treedb.js` says in its comment that
  `persistent` means stored on disk, not writable (as `tr_treedb.h` does),
  and `kwid_new_dict()` has a test for the record it leaves out for lacking
  an id. The first two numbers say which SDK the package belongs to; 7.23
  and 7.24 are skipped on purpose, the number does not count releases.

## 7.22.2

The browser console and a log monitor (gobj-ui's Developer window) showed
different things, for two reasons in the runtime -- neither was the monitor's.

- **fix: the kw was dumped without `ev_kw`.** A publication printed its payload
  under the `machine` trace alone -- once for the publication, once per
  subscriber -- and so did a subscription; while the compact `machine` format
  never printed an event's kw at all, because it still compared the old
  `tracing` integer (`tracea > 1`) with what is a boolean now. Every one asks
  `ev_kw` now, as the C kernel does: `machine` writes the transitions, `ev_kw`
  adds their payloads.
- **fix: a log sink missed every line written before it was installed.** The
  application installs it in its own startup, after `gobj_start_up()` and the
  first services have already logged, so a monitor began mid-way through what
  the console showed whole. The log helpers keep the last 600 lines, and a new
  sink is handed them first (the same sink installed again is not); a json line
  is kept as text, because the object it came from goes on changing.

Tests: `tests/log_backlog_and_ev_kw.test.js`; red on both against 7.22.1.
`console_log_filter.test.js` clears what a new sink is replayed before it
measures.

## 7.22.1

**fix: `current_timestamp()` wrote UTC time followed by the LOCAL offset.**
`toISOString()` is UTC, and the offset appended to it was `getTimezoneOffset()`'s:
at +0200 every log line said `11:05:34.370+0200` at 13:05 local, two hours
wrong for anyone reading it, and read back as an instant it was two hours off
too. It writes the local wall clock now, as the C kernel does; the offset's
hours are floored, so a half-hour zone no longer prints `5.5`. The function
takes an optional `Date`, for the test.

Tests: `tests/current_timestamp.test.js`, run in four time zones; red against
the previous code.

## 7.22.0

**BREAKING: the trace switches are the C kernel's, and the yuno persists them.**

The trace of this runtime was already the C one -- the same levels, the same
bits, `gobj_set_global_trace()` and its family -- but nobody drove it that way.
gobj-ui's Developer window wrote a zoo of yuno attrs (`tracing`, `trace_timer`,
`trace_inter_event`, `trace_creation`, `trace_start_stop`,
`trace_subscriptions`, `trace_i18n`, `no_poll`), kept each in its own
localStorage key, and the runtime read them BESIDE the levels: a
`legacy_yuno_trace_bits()` folded some in, the subscription trace read
`trace_subscriptions` instead of `TRACE_SUBSCRIPTIONS`, the command trace read
`tracing` instead of `TRACE_COMMANDS`, the traffic trace read
`trace_inter_event`, and `no_poll` was read by nothing at all.

- **removed: those eight yuno attrs, and `legacy_yuno_trace_bits()`.** A
  `gobj_create_yuno()` that still passes one logs *"GClass Attribute NOT
  FOUND"*; remove it. `trace_ievent_callback` stays: it is where the traffic
  trace GOES, not a switch.
- **every trace decision is a bit.** Subscriptions and unsubscriptions by
  `TRACE_SUBSCRIPTIONS`, publications as in C (`subscriptions` or `machine`,
  vetoed by the source's no-trace), commands by `TRACE_COMMANDS` or `machine`
  (the kw with `ev_kw`), the websocket traffic by `C_IEVENT_CLI`'s own levels
  `ievents` / `ievents2`, declared now as in the C gclass.
- **feat: `C_YUNO` persists the trace levels, as the C one.** Attrs
  `trace_levels` / `no_trace_levels` (`SDF_PERSIST`), restored in `mt_create`,
  and the C commands through `mt_command_parser`: `set-global-trace`,
  `set-global-no-trace`, `set-gclass-trace`, `set-gclass-no-trace` and their
  `get-` forms, same parameters. A command saves its scope WHOLE, from the
  levels in force, an empty one as `[]`; at start up a saved scope REPLACES
  what `main.js` set before creating the yuno, and a scope never saved keeps
  it. The rule went into the C `C_YUNO` at the same time.
- **feat: the getters of C.** `gobj_get_global_trace_level()`,
  `gobj_get_global_trace_no_level()`, `gobj_get_gclass_trace_level()` (with the
  global levels, as C), `gobj_get_gclass_trace_level2()` (the gclass's own),
  `gobj_get_gclass_trace_no_level()`, `gobj_global_trace_no_level()`, and the
  bitmask setters `gobj_set_global_trace2()` / `gobj_set_global_no_trace2()`.
  A gclass's own level names come from its `s_user_trace_level`, a list of
  `[name, description]` in bit order; `gobj_set_gclass_trace(gclass, null,
  false)` clears all of them.

Tests: `tests/trace_levels.test.js`, 10 cases -- the restore that replaces,
the empty scope, the default kept, each command and its refusals.

## 7.21.0

The SDK is at 7.21.0 and this package was at 7.16.6, which by the rule above
tells a consumer the wrong thing: the first two indices are the SDK's. 7.17
to 7.20 are skipped on purpose -- the number does not count releases of this
package, it names the SDK the package belongs to.

The `kwid_*` id helpers. They serve one rule -- **the key of a data record is its `id`, and the
rest of the record is value** -- and nothing covered them: `tests/kwid.test.js`
is new, 19 cases.

- **fix: `kwid_find_one_record()` crashed when there was no data.**
  `kwid_collect()` answers `null` -- not an empty list -- for a `kw` that is
  neither a list nor a dict, and this read `list.length` off it: a `TypeError`
  thrown at the caller. One caller hands it the `data` of a command answer,
  which is missing exactly when the command found nothing, so the shape that
  triggered it was the ordinary "nothing matched" and it took a view down with
  it.
- **fix: `kwid_new_dict()` dropped a record without `id` in silence.** The C
  twin passes `KW_REQUIRED` and logs it; this passed `0`. The dict came back
  short and nothing said which row had gone. Under the rule a record without an
  `id` is broken, and it says so now.
- **feat: `kwid_new_list()`, which only C had.** The normalizing function of
  the family: a dict of records becomes a list, and each record gets its KEY
  written as its `id`, overwriting one that disagrees -- which is the point,
  and is what the C `json_object_set_new(v, "id", ...)` does. A list comes back
  as itself. It is the shape a table indexed and sorted by `id` wants.
- **docs: three comments that described the C and not this.** `kwid_collect()`
  promised `JSON_INCREF` clones; javascript has no refcount, the LIST is new
  and its records are the same objects, so a write through a collected row
  writes into the source. `kwid_new_dict()` said "a new dict" and hands a dict
  input straight back, as C does, where "new" means a new REFERENCE. And
  `kwid_match_id()` had its comments in Spanish.

## 7.16.6

- **fix: `refresh_language()` never translated the element it was GIVEN.** It
  looks its four attributes up with `querySelectorAll`, which searches
  DESCENDANTS and never returns the node it is called on — so a caller that
  hands it the very element carrying the key got the children translated and
  that element's own `data-i18n` / `-title` / `-aria-label` / `-placeholder`
  left in the source language. It is invisible in English, where the key IS
  the text, and it bites exactly where a widget is built lazily and translated
  as a unit: measured on a deployed shell, the toolbar's language dropdown
  opened as `role="menu" aria-label="select language"` while its own trigger,
  a sibling, read *"Elegir idioma"*. The root is now included.

## 7.16.5

- **fix: the ORDER of the flags decided whether a `file` column was one.**
  `treedb_get_field_desc()` walks the flag array and every type word it meets
  OVERWRITES the answer, so `['fkey','file']` answered `file` and
  `['file','fkey']` answered `fkey` — the same column, drawn as a file picker
  or as a select depending on how the author happened to write the list. The C
  side asks for both words with `kw_has_word()` and does not care in which
  order they sit (`derive_file_hooks()`), so neither may this: `file` wins
  wherever it sits, and a new `is_file` says it without going through `type`
  at all. A `file` column is an fkey QUALIFIED by `file`, the way `enum`
  qualifies a string; it never replaces the `fkey`.

## 7.16.4

- **add: `file` as a treedb field type.** A col flagged `['fkey','file']` holds
  an fkey into the treedb's system topic `__assets__`: the bytes live on disk
  under the treedb, the index in memory, and the column names the asset by
  its sha256. Adding the word to `treedb_field_types` is what makes
  `treedb_get_field_desc()` see it; the form control that picks, hashes and
  attaches a file is gobj-ui's, still to come. The C side stores and checks
  (`tr_treedb.c`, SDK `## Unreleased`).

## 7.16.3

- **add: `icon` as a treedb field type.** A col flagged `icon` holds the NAME
  of an icon of the app's set (`yi-bolt`), not a file: `image` was the closest
  thing on the list and it is a different case, so the table built an `<img
  src="yi-bolt">` and drew a broken-image glyph. Adding it to
  `treedb_field_types` is what makes `treedb_get_field_desc()` answer
  `type: "icon"`; the drawing is gobj-ui's (7.23.53), and the C side carries
  the same word in `tr_treedb.h`, where the vocabulary is documented.

## 7.16.2

- **add: `empty_json()`, the question to ask over a json.** True for
  null/undefined, `{}`, `[]`, `""` and any scalar; false only when there is
  content. It is a wrapper over the `json_size()` that was already here, and
  it exists for **parity with the C runtime**, where the same name is now the
  guard that has to be written instead of `if(!jn)`: there an attr declared
  `DTP_JSON` with a null default holds `json_null()`, a valid pointer, so the
  pointer test is dead code. Here `if(!x)` happens to work, and that
  difference is what a port across the two runtimes gets wrong, in both
  directions — including a subscription's optional `__filter__`, which in C
  is never a C NULL. Write the same question in both.

  The other question — "absent or explicitly null", C's `json_absent()` — is
  `is_null()` here, since javascript has no second null to tell apart.

## 7.16.1

- **fix: an inter-event addressed to a service that is GONE is dropped, not
  published to everyone.** `C_IEVENT_CLI` looked the destination service up and,
  when it did not find one, fell through to the SERVICE subscription model:
  publish the message to every local subscriber of the transport. That fallback
  is right for a message that names NO destination and wrong for one that names
  a service — an addressed message belongs to its addressee or to nobody.

  The shape that hits it is the ordinary end of a view's life, not an edge case.
  A view mounted under a service name subscribes to a backend event; the user
  navigates away; the view is destroyed; the frames already on the wire keep
  arriving addressed to a name nobody answers to. They were then handed to every
  subscriber — in an SPA that means the application gobj, which subscribes to the
  transport with a **null** event (deliberately: naming `EV_ON_OPEN` in a
  subscription forwards it upstream and the remote rejects it) and a null
  subscription matches everything. Its FSM does not declare a device frame, so it
  said so, once per frame: **38 errors in a single 26 ms burst** on a node with 38
  devices, none of them actionable, and two per frame counting the lookup's own.

  Now: a named destination that is missing is **dropped with a warning** that
  says which service and which event were lost. A warning and not an error
  because it is a race and not a broken invariant — an unsubscribe cannot recall
  what is already on the wire — and the lookup no longer logs its own generic
  error on top (`gobj_find_service(..., false)`).

  **The unaddressed path is untouched**, and `tests/ievent_dispatch.test.js`
  pins all three cases together, because the fix is only correct if the third
  one still works: addressed to a live service → it alone; addressed to a dead
  one → dropped; addressed to nobody → published, as before.

  ⚠️ The **C side carries the same open question** (`c_ievent_cli.c` has the
  identical `TODO Shouldn't this event be rejected?`) and is deliberately left
  alone here: it is consolidated kernel code, and changing how a backend routes
  is not a JS decision. Until it moves, a C client and a JS client differ on
  what they do with an orphaned addressed event.

## 7.16.0

**Aligned with the C SDK, which is at 7.16.2.** From now on `gobj-js` is **never
ahead** of C except in the third index: the first two are the SDK's, and the
third is the package's own life between releases. 7.14 and 7.15 are skipped on
purpose: the number does not count releases of the package, it says **which
SDK it goes with**, which is what a consumer needs to know.


- **feat: the flat json — `json2flat`, `flat2json`, `flat_key_join`,
  `flat_key_split`, `flat_diff`, `flat_apply`.** A json seen as a table: one
  row per leaf, the id is the path of the item. To store, to compare and to
  diff it is a better form than the native one, and it is the only one a
  person reads when two configurations disagree.

  **The grammar is the same as the C side's** (`kwid.c`), and that is the
  point: a flat json is written by one side and read by the other. Separator
  `` ` ``; a `` ` `` inside a key is doubled, so **no key is forbidden**; an
  array index is the canonical `[N]`; a key that starts with `[` doubles the
  bracket; and **an empty container is a leaf**, because `{}` and `[]` have no
  leaves of their own and `"properties": {}` is everywhere in our configs.

  `flat2json()` **throws instead of guessing** when an id is a leaf and a
  container at once (the result would depend on the order of the keys), when
  an index is over the limit, or when the path is too deep.

  Index and key are **two types**: `flat_key_split()` answers the index as a
  number and the key as a string. As strings, the key `"[0]"` and the index `0`
  would be the same thing, which is the ambiguity `[N]` is there to remove.

  36 tests in `tests/json_flat.test.js`, pinning the same ids as the C test.

## 7.13.8

- **fix: the simpler machine trace leaked the LEGACY shape at four of its six
  sites.** 7.13.7 moved the default to format 1 and only two call sites knew
  about it — the transition and its return. The C kernel branches at six, so a
  browser yuno in the "simpler" shape still wrote `mach(…), st: …, ev: …` for
  the state change, the event injection, the publish and the subscriber
  forward: a mixed trace that looked like the default had not taken. The four
  now mirror the C kernel exactly:

  ```
  🔀🔀  (nothing — the transition line already carries the state)
  🔜 EV_ON_MESSAGE C_GATE^gate ST_IDLE
  🔝🔝 EV_STATE_CHANGED C_PROT_MQTT^input-2 ST_WAIT_FRAME_HEADER
  🔝🔄 EV_TX_READY (EV_TX_READY) C_PROT_TCP4H^output-0
  ```

- **fix: the publish path dumped an EMPTY kw.** `trace_json()` ran unguarded on
  both publish sites, so a bare `{}` was printed under every publication — in
  a yuno whose timer publishes, one empty line per tick, interleaved with the
  trace it is meant to annotate. Guarded by `json_object_size()`, the way the
  C kernel guards it and the way the other two sites in this file already did.

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
  the two in-repo JS yunos and every consumer app).

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
  picker and Raw JSON viewer, one consumer app's shell teardown).

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
