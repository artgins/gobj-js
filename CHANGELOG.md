# Changelog

`@yuneta/gobj-js` — the GObject-JS runtime (JavaScript port of the C GObject
kernel). **Versioned to track `YUNETA_VERSION`, and never ahead of it except in
the third index**: the first two are the SDK's, the third is this package's own
life between SDK releases. Rule set on 2026-08-28; before it the line had
drifted to 7.13.x while the SDK was at 7.16.2, which told a consumer nothing
about which SDK it was built against.

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
  `yunos/js/*` yunos, wattyzer, the yunovatios GUIs, estadodelaire and
  hidraulia set no `__global__` or `__local__` in a subscription.

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

  Latent: the only `KW_CREATE` reader calls in gobj-ui, the yunetas yunos,
  wattyzer and the yunovatios GUIs read single-segment paths.

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

  Latent: no caller in gobj-js, gobj-ui, the yunetas yunos, wattyzer or the
  yunovatios GUIs passes a bad kw or reads through a null segment today.

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

  Every caller in gobj-js, gobj-ui (v2 and v1), the yunetas yunos, wattyzer,
  the yunovatios GUIs, estadodelaire and hidraulia was checked: none reads a
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
  it. The rule went into the C `C_YUNO` in the same round.
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

The `kwid_*` id helpers, reviewed 2026-09-10 and carried in yunetas' `TODO.md`
since. They serve one rule -- **the key of a data record is its `id`, and the
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

**Alineada con el SDK de C, que va por 7.16.2.** Desde ahora `gobj-js` **no
adelanta** al C salvo en el tercer índice: los dos primeros son los del SDK y el
tercero es la vida propia del paquete entre releases. Se saltan las 7.14 y 7.15
a propósito: el número no cuenta releases del paquete, dice **contra qué SDK
está**, que es lo que un consumidor necesita saber.


- **feat: el json plano — `json2flat`, `flat2json`, `flat_key_join`,
  `flat_key_split`, `flat_diff`, `flat_apply`.** Un json visto como tabla: una
  fila por hoja, el id es la ruta del item. Para guardar, comparar y hacer diff
  es mejor forma que la nativa, y es la única que se lee cuando dos
  configuraciones no coinciden.

  **La gramática es la misma que la del lado C** (`kwid.c`), y ése es el punto:
  un json plano lo escribe uno y lo lee el otro. Separador `` ` ``; un `` ` ``
  dentro de una clave se duplica, así que **no hay claves prohibidas**; un
  índice de array es `[N]` canónico; una clave que empieza por `[` duplica el
  corchete; y **un contenedor vacío es una hoja**, porque `{}` y `[]` no tienen
  hojas propias y `"properties": {}` está por todas partes en nuestras configs.

  `flat2json()` **lanza en vez de adivinar** cuando un id es hoja y contenedor a
  la vez —el resultado dependería del orden de las claves—, cuando un índice se
  pasa del tope o cuando la ruta es demasiado profunda.

  Índice y clave son **dos tipos**: `flat_key_split()` devuelve el índice como
  número y la clave como cadena. Como cadenas, la clave `"[0]"` y el índice `0`
  serían la misma cosa, que es la ambigüedad que el `[N]` viene a quitar.

  36 tests en `tests/json_flat.test.js`, fijando los mismos ids que el test de C.

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
