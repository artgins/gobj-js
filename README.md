# gobj-js

JavaScript/ES6 implementation of the [Yuneta](https://yuneta.io) GObject runtime (v7).

This package gives you:

- **GObjects** — lightweight, event-driven components organized in a parent-child tree.
- **Finite State Machines** — every component has an FSM that maps (state, event) pairs to action functions, enforcing clear lifecycle and communication rules.
- **Typed attributes** — schema-declared properties (`SDATA`) with access flags, defaults, and optional persistence to `localStorage`.
- **Pub/Sub event system** — components communicate exclusively through JSON events: direct sends, subscriptions, and publications. No direct method calls between components.
- **Inter-event client** (`C_IEVENT_CLI`) — a built-in WebSocket proxy that lets browser components talk to C-based Yuneta backend services as if they were local GObjects.

Yuneta is a **function-oriented** framework: components (GClasses) are defined by wiring together plain functions and data tables — not class hierarchies — making the architecture portable across languages. The reference implementation is in [C](https://github.com/artgins/yunetas) (~12 000 LOC); this package mirrors the same API and patterns for browser and Node.js environments.

Published as [`@yuneta/gobj-js`](https://www.npmjs.com/package/@yuneta/gobj-js).

## License

Licensed under the [MIT License](http://www.opensource.org/licenses/mit-license).

---

## Table of Contents

- [Function-Oriented & Language-Portable](#function-oriented--language-portable)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Build & Develop](#build--develop)
- [Publish](#publish)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Public API](#public-api)
- [Built-in GClasses](#built-in-gclasses)
- [TreeDB Helpers](#treedb-helpers)
- [Writing a Custom GClass](#writing-a-custom-gclass)
- [Source Layout](#source-layout)

---

## Function-Oriented & Language-Portable

Yuneta is designed around a **function-oriented paradigm**. Every component (GClass) is defined by wiring together plain functions and data tables:

- **Action functions** handle events: `function ac_connect(gobj, event, kw, src)`
- **Lifecycle methods** manage creation and teardown: `mt_create`, `mt_start`, `mt_stop`, `mt_destroy`
- **FSM tables** map (state, event) pairs to action functions and next-state transitions
- **Attribute schemas** (`SDATA`) declare typed, flagged fields as data — not getter/setter methods

There is no class inheritance, no method overriding, and no language-specific constructs at the core. A GClass is a bag of functions plus a data description, registered at startup.

### Why this matters

This design makes Yuneta **portable to any programming language** that supports functions, arrays, and structured data — which is virtually all of them. The reference implementation is in **C** (~12,000 LOC in `gobj.c`), and this JavaScript package mirrors the same API and patterns:

| Concept | C | JavaScript |
|---------|---|------------|
| Create an instance | `gobj_create(name, gclass, kw, parent)` | `gobj_create(name, gclass_name, attrs, parent)` |
| Send an event | `gobj_send_event(gobj, event, kw, src)` | `gobj_send_event(gobj, event, kw, src)` |
| Subscribe | `gobj_subscribe_event(pub, event, kw, sub)` | `gobj_subscribe_event(pub, event, kw, sub)` |
| Attribute schema | `SDATA(DTP_STRING, "url", SDF_RD, "", "desc")` | `SDATA(DTP_STRING, "url", SDF_RD, "", "desc")` |
| FSM action row | `{EV_CONNECT, ac_connect, "ST_CONNECTED"}` | `["EV_CONNECT", ac_connect, "ST_CONNECTED"]` |

The same GClass structure translates directly between languages. Different implementations can also **interoperate over the network** via the inter-event protocol: the built-in `C_IEVENT_CLI` GClass proxies a remote Yuneta service over WebSocket, so a JavaScript frontend can communicate with a C backend as if it were a local GObject.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                         Yuno                             │
│   (application root GObject)                             │
│                                                          │
│   ┌──────────────┐   ┌──────────────┐                    │
│   │   Service A  │   │   Service B  │                    │
│   │  (GObject)   │   │  (GObject)   │                    │
│   │              │   │              │                    │
│   │  ┌────────┐  │   │  ┌────────┐  │                    │
│   │  │Child 1 │  │   │  │Child 2 │  │                    │
│   │  └────────┘  │   │  └────────┘  │                    │
│   └──────────────┘   └──────────────┘                    │
└──────────────────────────────────────────────────────────┘
         │ events (JSON kw)  ↕  pub/sub
```

Every component is a **GObject** — an instance of a **GClass**. GClasses define:
- Typed **attributes** (schema via `SDATA`)
- A **Finite State Machine** (states + event-action table)
- **Lifecycle methods** (`mt_create`, `mt_start`, `mt_stop`, `mt_destroy`, …)

GObjects communicate exclusively via **events** carrying JSON key-value payloads (`kw`). There is no direct method calling between components — everything goes through the FSM event dispatcher.

---

## Installation

```bash
# From npm (published package)
npm install @yuneta/gobj-js

# From source (local)
npm install /path/to/kernel/js/gobj-js
```

Import in your project:

```javascript
import { gobj_start_up, gobj_create_yuno, register_c_yuno } from "@yuneta/gobj-js";
```

---

## Build & Develop

Requires Node.js LTS (v22+):

```bash
nvm install --lts
npm install -g vite
```

```bash
cd gobj-js/
npm install        # install dependencies

vite               # dev server
vite build         # build all output formats to dist/
npm test           # run tests (vitest)
npm run test:coverage
npx vitest --watch # watch mode
```

To update dependencies:

```bash
npm install -g npm-check-updates
ncu -u && npm install
```

### Output formats

`vite build` produces files in `dist/`:

| File | Format | Use |
|------|--------|-----|
| `gobj-js.es.js` | ES modules | bundlers, modern browsers |
| `gobj-js.cjs.js` | CommonJS | Node.js |
| `gobj-js.umd.js` | UMD | legacy bundlers |
| `gobj-js.iife.js` | IIFE | `<script>` tag |
| `*.min.js` | minified variants | production |

---

## Publish

To publish a new version of `@yuneta/gobj-js` to [npmjs.com](https://www.npmjs.com/package/@yuneta/gobj-js):

```bash
# 1. Configure your npm token (only once)
echo "//registry.npmjs.org/:_authToken=<your-token>" > ~/.npmrc

# 2. Update the version in package.json. The first two numbers are those
#    of the SDK (YUNETA_VERSION) the package belongs to; only the third
#    moves between SDK releases.
npm version patch

# 3. Publish (build runs automatically via prepublishOnly)
npm publish --access public
```

To create an npm token, go to [npmjs.com](https://www.npmjs.com) → Account → Access Tokens.

---

## Quick Start

```javascript
import {
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_service,
    gobj_start,
    gobj_play,
    gobj_yuno,
    db_load_persistent_attrs,
    db_save_persistent_attrs,
    db_remove_persistent_attrs,
    db_list_persistent_attrs,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
} from "@yuneta/gobj-js";

// 1. Register GClasses
register_c_yuno();
register_c_timer();
register_c_ievent_cli();

// 2. Initialize framework
gobj_start_up(
    null,                           // jn_global_settings (JSON)
    db_load_persistent_attrs,       // load  persistent attrs
    db_save_persistent_attrs,       // save  persistent attrs
    db_remove_persistent_attrs,     // remove persistent attrs
    db_list_persistent_attrs,       // list  persistent attrs
    null,                           // global command parser fn
    null                            // global stats parser fn
);

// 3. Create the Yuno (application root)
let yuno = gobj_create_yuno("yuno", "C_YUNO", {
    yuno_name: "my_app",
    yuno_role: "my_role",
    yuno_version: "1.0.0",
});

// 4. Create services under the yuno
gobj_create_service("main", "C_MY_SERVICE", {}, gobj_yuno());

// 5. Start everything
gobj_start(yuno);
gobj_play(yuno);   // triggers mt_play on the default service
```

---

## Core Concepts

### GClass & GObject

A **GClass** is a class definition — registered once at startup. A **GObject** is an instance of a GClass.

```javascript
// Register a GClass
gclass_create(name, event_types, states, gmt, lmt,
              attrs_table, private_data, authz_table,
              command_table, s_user_trace_level, gclass_flag);

// Create an instance
let gobj = gobj_create(name, gclass_name, attributes, parent);
```

### Finite State Machines

Each GClass defines:
- A list of **states** (strings, e.g. `"ST_IDLE"`, `"ST_CONNECTED"`)
- Per-state **event-action tables**: `[event_name, action_fn, next_state]`

When an event is sent to a GObject, the FSM looks up the current state → finds the matching event → calls the action function. `next_state` (or `null` to stay) controls state transitions.

```javascript
const st_idle = [
    ["EV_CONNECT",    ac_connect,    "ST_CONNECTED"],
    ["EV_TIMEOUT",    ac_timeout,    null],           // stay in ST_IDLE
];
const st_connected = [
    ["EV_DISCONNECT", ac_disconnect, "ST_IDLE"],
    ["EV_MESSAGE",    ac_message,    null],
];

const states = [
    ["ST_IDLE",      st_idle],
    ["ST_CONNECTED", st_connected],
];
```

### Attributes (SData)

Attributes are declared in a schema table using `SDATA()` macros. Each attribute has a type, name, flags, default value, and description.

```javascript
import { SDATA, SDATA_END, data_type_t, sdata_flag_t } from "@yuneta/gobj-js";

const attrs_table = [
    SDATA(data_type_t.DTP_STRING,  "url",        sdata_flag_t.SDF_RD,      "", "Server URL"),
    SDATA(data_type_t.DTP_INTEGER, "timeout",    sdata_flag_t.SDF_RD,       0, "Timeout ms"),
    SDATA(data_type_t.DTP_BOOLEAN, "connected",  sdata_flag_t.SDF_RD,   false, "Connection state"),
    SDATA(data_type_t.DTP_STRING,  "saved_key",  sdata_flag_t.SDF_PERSIST,  "", "Persisted value"),
    SDATA_END()
];
```

**Data types (`data_type_t`):** `DTP_STRING`, `DTP_BOOLEAN`, `DTP_INTEGER`, `DTP_REAL`, `DTP_LIST`, `DTP_DICT`, `DTP_JSON`, `DTP_POINTER`

**Flags (`sdata_flag_t`):** `SDF_RD`, `SDF_WR`, `SDF_PERSIST`, `SDF_STATS`, `SDF_AUTHZ_R`, `SDF_AUTHZ_W`, `SDF_REQUIRED`, `SDF_VOLATIL`, `SDF_SECRET`

**A value is read as the attribute's type, as in C** (`gobj_write_attr()`, the kw of `gobj_create()`, `gobj_write_attrs()`, the persistent attrs; 7.26.22+): a string for a boolean, integer, real, list or dict is read from its text by the C command parser's grammar (`command_parameter_from_json()`: `"yes"` is `true`, `"42"` is 42, `"007"` and `"12abc"` are refused), a number or a boolean as the exact type (`2.7` to an integer is refused). A refused value is not written: one `log_error` names the attr, its type, why and the value (masked, capped; a `SDF_SECRET` one never shown). A key of a kw whose value is `undefined` is an absent key; `gobj_write_attr()` of `undefined` to a typed attr is refused. The typed writers read the value as THEIR type by the same grammar (`gobj_write_integer_attr(g, "x", 2.5)` is refused, `gobj_write_bool_attr(g, "on", "yes")` is `true`), and `gobj_write_str_attr()` writes `null`/`undefined` as `""`, never the text `"null"`.

**A refused write keeps the value the attribute had** (BREAKING in 7.26.22, kept
by decision: the C kernel's `json2item()` does the same). `undefined`, `null`, an
empty text or a text that is not a boolean, given to `gobj_write_bool_attr()`, is
not `false`: the function returns -1, logs one ERROR, and the attribute does not
change. The same for `gobj_write_attr()` of `null` or `""` to a `DTP_REAL`.
Compute the value before the write when it can be absent:

```javascript
gobj_write_bool_attr(gobj, "selectable", true);
gobj_write_bool_attr(gobj, "selectable", kw.selectable);          // kw has none: -1, ERROR,
                                                                   // "selectable" is still true
gobj_write_bool_attr(gobj, "selectable", kw.selectable === true);  // false
```

A value with no json text (a circular object such as a gobj or a DOM node, a
`BigInt`) given to a string attribute is refused the same way, and is never
thrown (7.26.24). So is a value that is not json ALL THE WAY DOWN given to a
string, a `DTP_DICT` or a `DTP_LIST` (7.26.25): a cycle anywhere inside, a
`BigInt` inside (`[1n]`), a `Map`, a `Set`, a `Date`, a typed array, an instance
of a class. They were written, and burst (or turned into `"{}"`) when the value
was serialized, far from the write. And so is a value whose text would say
another value (7.26.26): an object with a `toJSON()`, `NaN` or `Infinity` inside
(the text says `null`; jansson holds no such real), a function, `undefined`, a
symbol or a hole inside an array (`[1, , 3]`: the text says `null`), and a value
nested deeper than 2048 levels (a scalar is a level too), which C would not read
back and which bursts `JSON.stringify()` a little further on. Every version
before 7.26.26 wrote them, so this is a BREAKING change for a caller that wrote
one. A getter or a `Proxy` trap that
throws is a refusal too, never an exception (7.26.26). A key whose value is
`undefined`, a function or a symbol is dropped, as `JSON.stringify()` drops it:
an absent key. A plain object of another realm (a `vm` context, an iframe) is a
plain object. A `Proxy` is read through its traps, as `JSON.stringify()` reads
it: JS cannot tell one from its target.

```javascript
gobj_write_attr(gobj, "settings", {a: 1, b: undefined});    // 0: b goes when serialized
gobj_write_attr(gobj, "settings", new Map([["a", 1]]));     // -1, ERROR "a value with no json text"
gobj_write_str_attr(gobj, "name", new Map());               // -1: it was the text "{}"
gobj_write_attr(gobj, "settings", {ratio: NaN});            // -1: it was the text {"ratio":null}
gobj_write_attr(gobj, "items", [1, undefined]);             // -1: it was the text [1,null]
gobj_write_attr(gobj, "items", [1, , 3]);                   // -1: a hole, it was the text [1,null,3]
gobj_write_str_attr(gobj, "name", NaN);                     // -1: it was the text "null"
```

The check walks the whole value on every write of a string, a dict or a list:
it costs about what a `JSON.stringify()` of the value costs (some 20-30 ms for a
dict of 50 000 records), once per write. It is not cached: an object found json
once can be changed into one that is not before its next write.

A `DTP_JSON` attribute is not checked: it takes any value, as before.

A json TEXT is read as the C parser reads it: one that C
refuses is refused in JS too -- an escaped NUL (`"\u0000"`), a lone surrogate,
an integer out of int64, a real that overflows (`1e309`; to a `DTP_JSON` it is
the text `"1e309"`, not `Infinity`), a text nested deeper than 2048 levels (a
scalar is a level too; 7.26.25). A number beyond int64 is "a real" to a dict,
as in C (`1e20`). Three differences remain, because a JS number cannot carry
them: an integer beyond 2^53 is rounded; `2.0` (and `-0.0`) is the integer; and
the last 512 integers of int64 round up to 2^63, which is OUT of int64, so an
integer attr refuses them, as text or as a number (`"9223372036854775807"`,
the int64 maximum C takes, is "a number out of its range" in JS: its JS number
is 2^63, whose text C refuses as "too big integer"; 7.26.26, 7.26.25 took it).
See `tests/fixtures/attr_types_parity.json`, which the C test
`tests/c/attr_types` of yunetas reads too.

### Events & Pub-Sub

GObjects communicate via events with JSON payloads:

```javascript
// Send directly to a specific GObject
gobj_send_event(target_gobj, "EV_CONNECT", { url: "ws://..." }, src_gobj);

// Publish to all subscribers
gobj_publish_event(gobj, "EV_DATA_READY", { data: [] });

// Subscribe to events from a source
gobj_subscribe_event(source_gobj, "EV_DATA_READY", {}, subscriber_gobj);

// Unsubscribe
gobj_unsubscribe_event(source_gobj, "EV_DATA_READY", {}, subscriber_gobj);
```

**Which kw a subscriber gets** (since 7.25.8, the same rule as the C kernel):

- A subscription with a non-empty `__local__` (keys removed) or `__global__`
  (keys added) gets a **twin** of the published kw: a new top-level object,
  with the nested values shared. `__global__` goes in as a copy. What one
  subscription removes or adds reaches only its own subscriber.
- Every other subscriber gets the **same** kw as the publisher. A receiver that
  changes the kw it got must change a copy of its own (`C_IEVENT_CLI`'s
  `mt_inject_event` does this before it writes its ievent stack).
- `__filter__` and `mt_publication_filter` see the publisher's kw.

```javascript
gobj_subscribe_event(pub, "EV_X", {__global__: {tag: "a"}}, sub_a); // gets {v: 1, tag: "a"}
gobj_subscribe_event(pub, "EV_X", {__local__: {secret: 0}}, sub_b); // gets {v: 1}
gobj_subscribe_event(pub, "EV_X", {__filter__: {v: 1}}, sub_c);     // gets the publisher's kw
gobj_publish_event(pub, "EV_X", {v: 1, secret: "s"});               // the kw stays {v: 1, secret: "s"}
```

**A renamed event** (since 7.25.9, the same rule as the C kernel):
`{__config__: {__rename_event_name__: "EV_A"}}` sends the subscriber `EV_A`
instead of the published event, with `__original_event_name__` in the kw, when
some gclass declares `EV_A` (a rename nobody declares is logged and ignored).
The rename is part of what the subscription IS: a renamed subscription over a
plain one is a second one, while a plain kw is a wildcard, so a plain
subscription over a renamed one replaces it and a plain unsubscribe removes
both.

```javascript
gobj_subscribe_event(pub, "EV_ON_MESSAGE", {}, sub);                        // one
gobj_subscribe_event(pub, "EV_ON_MESSAGE",
    {__config__: {__rename_event_name__: "EV_A"}}, sub);                    // two
gobj_publish_event(pub, "EV_ON_MESSAGE", {});   // sub gets EV_ON_MESSAGE, and EV_A
gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", {}, sub);                      // none
```

### GObject Tree (Yuno)

GObjects form a parent-child tree. The root is the **Yuno**. Services live directly under the Yuno. Each GObject has exactly one parent (except the Yuno itself).

```
Yuno
 ├── Service "auth"     (C_IEVENT_CLI)
 ├── Service "main"     (C_MY_SERVICE)
 │    └── Child "sub"   (C_SOME_GCLASS)
 └── Service "timer"    (C_TIMER)
```

---

## Public API

### Framework Bootstrap

```javascript
gobj_start_up(
    jn_global_settings,         // JSON object or null
    load_persistent_attrs_fn,   // fn(gobj, keys)
    save_persistent_attrs_fn,   // fn(gobj, keys)
    remove_persistent_attrs_fn, // fn(gobj, keys)
    list_persistent_attrs_fn,   // fn(gobj, keys)
    global_command_parser_fn,   // fn or null
    global_stats_parser_fn      // fn or null
)
```

### GClass Registration

```javascript
gclass_create(name, event_types, states, gmt, lmt, attrs_table,
              private_data, authz_table, command_table,
              s_user_trace_level, gclass_flag)

gclass_find_by_name(name, verbose)   // → GClass or null
gclass_check_fsm(gclass)         // validate FSM (returns error count)
gclass_add_event_type(gclass, event_name, flag)
gclass_add_state(gclass, state_name)
gclass_add_ev_action(gclass, state_name, event_name, action_fn, next_state)
```

### GObject Lifecycle

```javascript
// Creation
gobj_create(name, gclass_name, attrs, parent)       // generic child
gobj_create_yuno(name, gclass_name, attrs)           // application root
gobj_create_service(name, gclass_name, attrs, yuno)  // named service
gobj_create_default_service(name, gclass_name, attrs, yuno)
gobj_create_volatil(name, gclass_name, attrs, parent)
gobj_create_pure_child(name, gclass_name, attrs, parent)

// Start / Stop
gobj_start(gobj)           // calls mt_start; -1 with an ERROR if a
                           // SDF_REQUIRED attr is empty, as in C
                           // (BREAKING in 7.26.28: "" string, empty_json()
                           // list/dict/json, null pointer)
gobj_stop(gobj)            // calls mt_stop
gobj_start_children(gobj)
gobj_stop_children(gobj)
gobj_start_tree(gobj)
gobj_stop_tree(gobj)

// Play / Pause (applied to default service)
gobj_play(gobj)
gobj_pause(gobj)

// Destroy
gobj_destroy(gobj)

// Status
gobj_is_running(gobj)      // → boolean
gobj_is_playing(gobj)      // → boolean
gobj_is_destroying(gobj)   // → boolean
gobj_is_volatil(gobj)      // → boolean
gobj_is_pure_child(gobj)   // → boolean
```

**A gobj is not destroyed under code that still runs on it** (7.26.22+, as the
C kernel since 7.26.10). `gobj_publish_event()` and `gobj_send_event()` run
synchronously, and the code of the publisher (or of the outer action) goes on
when they return. So `gobj_destroy()` logs an ERROR with the stack when it
destroys the publisher of a publication in progress, or one of its ancestors —
*"Destroying a gobj while its tree is publishing"* — or a gobj whose outer
action is still running — *"Destroying a gobj while one of its actions is
still running"*. The line names `destroying`, `publisher`/`running`, `event`,
`destroyer` and `inner_event`. The destroy is done all the same. A gobj that
destroys itself in its own action, and a host that destroys its transport in
the transport's `EV_STOPPED`, are not errors.

The fix is to leave the stack: post an event to yourself, and destroy in its
action. The event is an INPUT event of your gclass (FSM and `event_types`):

```javascript
// Wrong: EV_TIMEOUT comes from the C_TIMER child, inside its publication.
function ac_timeout(gobj, event, kw, src) {
    gobj_stop(src);
    gobj_destroy(src);
    return 0;
}

// Right: the destroy runs on the next turn, from a clean stack.
function ac_timeout(gobj, event, kw, src) {
    gobj_post_event(gobj, "EV_TIMER_DONE", {timer: gobj_name(src)}, gobj);
    return 0;
}
function ac_timer_done(gobj, event, kw, src) {
    let timer = gobj.priv.timer;    // resolve the identity the kw carries
    if(timer && gobj_name(timer) === kw.timer) {
        gobj_stop(timer);
        gobj_destroy(timer);
        gobj.priv.timer = null;
    }
    return 0;
}
```

### State Machine

```javascript
gobj_current_state(gobj)                         // → state name string
gobj_change_state(gobj, new_state)               // trigger FSM transition
gobj_has_event(gobj, event, event_flag)          // → boolean; pass 0 to ignore flag
gobj_has_output_event(gobj, event, event_flag)   // same; checks EVF_OUTPUT_EVENT
gobj_find_event_type(event, event_flag, verbose) // the event type in ANY registered gclass, or null
```

### Attribute Access

```javascript
// Generic read/write
// `path` accepts back-tick navigation to walk into child gobjs: "child`subattr"
gobj_read_attr (gobj, name, src)
gobj_write_attr(gobj, path, value, src)
gobj_read_attrs (gobj, include_flag, src)                // → JSON object of matching attrs
gobj_write_attrs(gobj, kw, include_flag, src)            // include_flag filters which are written
gobj_has_attr(gobj, name)                                // → boolean

// Typed reads — name only (no src)
gobj_read_bool_attr   (gobj, name)
gobj_read_integer_attr(gobj, name)
gobj_read_str_attr    (gobj, name)
gobj_read_pointer_attr(gobj, name)

// Typed writes — (name, value), no src
gobj_write_bool_attr   (gobj, name, value)
gobj_write_integer_attr(gobj, name, value)
gobj_write_str_attr    (gobj, name, value)
```

### Event System

```javascript
// Sending
gobj_send_event(gobj, event, kw, src)         // direct send
gobj_publish_event(gobj, event, kw)           // publish to subscribers
gobj_post_event(gobj, event, kw, src)         // post (deferred)

// Subscriptions
gobj_subscribe_event  (publisher, event, kw, subscriber)
gobj_unsubscribe_event(publisher, event, kw, subscriber)
gobj_unsubscribe_list (publisher, dl_subs, force)     // force=true also removes hard subs
gobj_find_subscriptions(publisher, event, kw, subscriber)
gobj_list_subscriptions(gobj)
gobj_find_subscribings (subscriber, event, kw, publisher)

// Commands & Stats
gobj_command(gobj, command, kw, src)          // → response JSON
gobj_stats(gobj, stats, kw, src)              // → response JSON
build_command_response(gobj, result, comment, schema, data)
build_stats_response(gobj, result, comment, schema, data)
```

### Hierarchy & Navigation

```javascript
gobj_parent(gobj)
gobj_yuno()                        // → the Yuno root
gobj_default_service()             // → default service under yuno

gobj_name(gobj)
gobj_short_name(gobj)
gobj_full_name(gobj)
gobj_gclass_name(gobj)
gobj_yuno_name()                   // no argument: there is one yuno
gobj_yuno_role()
gobj_yuno_id()

gobj_find_child(gobj, kw_filter)
gobj_find_service(name, verbose)
gobj_find_gobj(gobj, path)
gobj_search_path(gobj, path)

gobj_walk_gobj_children(gobj, walk_type, cb_walking, user_data, user_data2)
gobj_walk_gobj_children_tree(gobj, walk_type, cb_walking, user_data, user_data2)
// A callback may destroy or move (gobj_change_parent()) any gobj: a
// destroyed one is never handed, a moved one is handed where the walk
// finds it now, and no gobj is handed twice in one walk (7.26.28).
```

### Persistence

Backed by `localStorage` (browser) via `dbsimple.js`:

```javascript
// Low-level (dbsimple)
db_load_persistent_attrs(gobj, keys)
db_save_persistent_attrs(gobj, keys)
db_remove_persistent_attrs(gobj, keys)
db_list_persistent_attrs(gobj, keys)

// Via gobj (delegates to registered persistence fns)
gobj_load_persistent_attrs(gobj, keys)
gobj_save_persistent_attrs(gobj, keys)
gobj_remove_persistent_attrs(gobj, keys)
gobj_list_persistent_attrs(gobj, keys)
```

Attributes marked `SDF_PERSIST` are automatically saved/loaded.

**Always name what you save**: `gobj_save_persistent_attrs(gobj, "attr_name")`
(a string, or a list/dict of names). The bare call saves every `SDF_PERSIST`
attr, which is wasteful and can clobber attrs the caller never touched.

**Check the result.** `db_save_persistent_attrs()` / `gobj_save_persistent_attrs()`
return **`0` on success, `-1` on failure**, and a failure is logged through
`log_error`. `localStorage` can *refuse* a write (quota exceeded, private mode,
storage blocked): treating that as saved leaves the in-memory attr and the UI
showing a value the store rejected, which the next reload silently loses.

### Helpers & Utilities

```javascript
// JSON / Object operations
json_deep_copy(obj)
json_is_identical(a, b)
json_object_update(dst, src)            // merge src into dst
json_object_update_existing(dst, src)   // only existing keys
json_object_update_missing(dst, src)    // only missing keys
json_object_get(obj, key)
json_object_set(obj, key, value)
json_object_del(obj, key)
json_array_append(arr, value)
json_array_remove(arr, index)
json_array_extend(dst, src)
json_object_size(obj)
json_array_size(arr)

// Type checking
is_object(v), is_array(v), is_string(v), is_number(v),
is_boolean(v), is_null(v), is_date(v), is_function(v), is_gobj(v)

// Keyword (kw) operations
//
// Most kw_* helpers take `gobj` as first argument (for error logging)
// and a dot/back-tick path instead of a single key. Exceptions that do
// NOT take gobj: kw_has_key, kw_pop, kw_match_simple.

kw_has_key(kw, key)                                      // → boolean
kw_pop(kw1, kw2)                                         // delete from kw1 the keys listed in kw2
kw_delete(gobj, kw, path)
kw_find_path(gobj, kw, path, verbose)                    // back-tick path: "a`b`c"
// kw_find_path() answers undefined for a path that is not there, as C
// answers NULL. A kw that is not a dict or a list, or a scalar in the
// middle of the path, is logged ("kw must be list or dict"); an absent
// or null middle segment is logged only when verbose. So a typed reader
// handed a bad kw answers its DEFAULT:
//   kw_get_int(gobj, null, "x", 5, 0)            → 5  (logged: kw must be list or dict)
//   kw_get_str(gobj, {a: null}, "a`b", "d", 0)   → "d" (not logged)

kw_get_bool(gobj, kw, path, default_value, flag)
kw_get_int (gobj, kw, path, default_value, flag)
kw_get_real(gobj, kw, path, default_value, flag)
kw_get_str (gobj, kw, path, default_value, flag)
kw_get_dict(gobj, kw, path, default_value, flag)
kw_get_list(gobj, kw, path, default_value, flag)
kw_get_dict_value(gobj, kw, path, default_value, flag)
// A typed reader answers the value when it has the reader's type, and
// the default AS GIVEN otherwise (absent key or other type), as in C:
//   kw_get_list(gobj, {x: [1, 2]}, "x", [], 0)   → [1, 2]  (the same array)
//   kw_get_dict(gobj, {}, "x", null, 0)          → null
//   kw_get_bool(gobj, {x: "false"}, "x", true, 0) → true   (not a boolean: logged)
//   kw_get_bool(gobj, {x: "false"}, "x", true, KW_WILD_NUMBER) → false
// kw_get_bool() logs a value that is not a boolean even without
// KW_REQUIRED ("path MUST BE a json boolean"), as the C reader does,
// and so do kw_get_int() / kw_get_real() for a value that is not a
// number ("path MUST BE a json integer" / "... a json real"):
//   kw_get_int(gobj, {x: 3.9}, "x", 0, 0)               → 3  (truncated, as C)
//   kw_get_int(gobj, {x: "12"}, "x", 5, 0)              → 5  (not a number: logged)
//   kw_get_int(gobj, {x: "0x1F"}, "x", 5, KW_WILD_NUMBER) → 31 (strtoll base 0)
//   kw_get_bool(gobj, {x: "0x1F"}, "x", true, KW_WILD_NUMBER) → false (atoi: decimal)
// kw_get_str() logs as C too: a value that is there and is not a
// string, required or not ("path MUST BE a json str"), never a null
// value, and with KW_REQUIRED a path that is not there:
//   kw_get_str(gobj, {x: 5}, "x", "d", 0)              → "d" (logged)
//   kw_get_str(gobj, {x: null}, "x", "d", KW_REQUIRED) → "d" (not logged)
// kw_get_dict() / kw_get_list() log a value of another type only with
// KW_REQUIRED ("path MUST BE a json dict" / "... a json list"), as C.
// KW_EXTRACT takes out only a value the reader answers with: a value
// of another type stays in the kw.

kw_set_dict_value(gobj, kw, path, value)                 // 0, or -1 logged
// A middle segment that is null or a scalar cannot hold the path:
// kw_set_dict_value() logs and answers -1, the kw is left as it was,
// and a reader with KW_CREATE answers its default (as C):
//   kw_get_int(gobj, {a: null}, "a`b", 5, KW_CREATE) → 5, kw unchanged
kw_set_subdict_value(gobj, kw, path, key, value)

kw_match_simple(kw, filter)                              // → boolean
kw_select (gobj, kw, jn_filter, match_fn)                // filter list
kw_collect(gobj, kw, jn_filter, match_fn)                // extract subset
kw_clone_by_keys    (gobj, kw, keys, verbose)
kw_clone_by_not_keys(gobj, kw, keys, verbose)
// A filter value is compared as a value: {online: false}, {channel: 0}
// and {name: ""} match (up to 7.25.9 a false value never did):
//   kw_select(null, [{id: "a", online: false}], {online: false})  → [{id: "a", ...}]
// A key is read only when the kw OWNS it ("toString" or "constructor" on
// a plain {} are not there) and written as its own key, "__proto__"
// included, as in C: never into a prototype. The helpers that copy
// (json_object_update(), kw_clone_by_*(), flat_apply()...) do the same.

// Flags: KW_REQUIRED, KW_CREATE, KW_EXTRACT, KW_RECURSIVE, KW_WILD_NUMBER

// Local storage helpers (browser localStorage, no "store" parameter)
kw_get_local_storage_value(key, default_value, create)   // create=false
kw_set_local_storage_value(key, value)                   // 0, or -1 logged
kw_remove_local_storage_value(key)
// BREAKING in 7.26.26: kw_get_local_storage_value() answers default_value
// where it answered null (an absent entry, a json null) or undefined (no
// browser), and an entry that is not json is REMOVED, with one WARNING
// that never shows its text. A store the browser blocks (cookies blocked,
// a sandboxed iframe: reading window.localStorage throws) answers the
// default, warned once per key, and a write to it is -1 (7.26.27: before,
// every helper and node_uuid() threw). A value with no json text is
// refused by the writer, -1 with an ERROR, as a typed writer refuses it
// (7.26.27; a function was stored as the text "undefined"):
//   kw_set_local_storage_value("k", () => 1)     → -1
//   kw_set_local_storage_value("k", {w: NaN})    → -1 (it was {"w":null})
//   kw_set_local_storage_value("k", [1, , 3])    → -1 (a hole: [1,null,3])
// A full store (read, not written) with `create`: the default, warned
// once per key (7.26.28: an ERROR on every read).

// Misc utilities
current_timestamp()          // ISO string
get_now()                    // Date object
node_uuid()                  // uuid of this browser, the SAME for the
                             // life of the page (kept in localStorage
                             // "host_uuid"; a page uuid if the store
                             // cannot keep it; never null: 7.26.28)
parseBoolean(v)              // coerce to boolean
empty_string(s)              // true if null/undefined/""
str_in_list(list, str, ci)   // case-insensitive optional
index_in_list(list, value)
delete_from_list(list, value)
jwtDecode(token)             // → header/payload/signature
jwt2json(token, what)        // → payload JSON (what: optional part)
debounce(fn, wait, immediate)
timeTracker()

// Inter-event message stack
msg_iev_push_stack  (gobj, kw, stack, jn_data)    // push jn_data onto named stack
msg_iev_get_stack   (gobj, kw, stack, verbose)    // peek top of named stack
msg_iev_set_msg_type(gobj, kw, msg_type)          // "" to delete
msg_iev_get_msg_type(gobj, kw)
msg_iev_write_key(kw, key, value)                 // no gobj
msg_iev_read_key (kw, key)                        // no gobj
```

### A json as a table: `json2flat` / `flat2json`

The same grammar as the C kernel (`kwid.h`): one row per leaf, the id being
the path joined by `` ` ``, an array index written `[N]`, an empty container
a leaf of its own.

```javascript
json2flat({a: {b: 1, c: [true]}, d: {}})
// → {"a`b": 1, "a`c`[0]": true, "d": {}}
flat2json({"a`b": 1, "a`c`[0]": true, "d": {}})
// → {a: {b: 1, c: [true]}, d: {}}

flat_diff({a: 1, b: 2}, {a: 1, b: 3, c: 4})
// → {added: {c: 4}, removed: {}, changed: {b: {from: 2, to: 3}}}
flat_apply(flat, diff)      // → flat with that diff applied
```

`flat2json()` throws on the first id that does not fit (a leaf and a
container at once) instead of guessing.

### Secrets in traces and logs

```javascript
is_secret_name("password")                // → true ("token", "jwt", "apikey"...)
is_secret_name("sim_pin")                 // → true (pass, pin, otp: whole segments)
is_secret_name("mapping")                 // → false (pin inside a word)
is_secret_name("token_endpoint")          // → false (names something ABOUT one)
mask_secrets_inline("login user=a passw=x")  // → "login user=a passw=********"
mask_secrets_inline("curl -H 'Authorization: Bearer abc' u")
                                          // → "curl -H 'Authorization: ********' u"
mask_secrets_inline("sent Bearer mF_9.B5f-4.1JqM")  // → "sent Bearer ********"
mask_secrets_inline("the bearer of this letter")    // → null: prose
mask_secrets_inline("\"password\": hunter2")        // → "\"password\": ********"
mask_secrets_inline("GET https://h/get?token=abc&x=1")  // → "GET https://h/get?token=********&x=1"
mask_secrets_inline("a=1&user%5Bpassword%5D=x")     // → "a=1&user%5Bpassword%5D=********"
mask_secrets_inline("https://bob:hunter2@host/x")   // → "https://bob:********@host/x"
json_mask_secrets({user: "a", password: "x"})  // → {user: "a", password: "********"}
json_mask_secrets({note: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln"})
                                          // → {note: "********"}: a JWT under any key
trace_json_masked(kw, "sent")            // trace_json() of the masked copy
```

As the C kernel's: the same names, the same rules. By name: the value of a
`name=value` and of a `name: value` (`"password": x`, `Authorization: Basic x`,
`bearer: tok`, `{\"password\":\"x\"}` of a json inside a json) whose name is
a secret's, whole. By value: a JWT or a JWE (`eyJ`, base64url and a `.`: also
one a cap cut), and after `Bearer` or `Basic` the word that can be a credential
-- quoted, after the scheme doubled, or not a word of prose (a digit, a symbol,
a character that is no ASCII, its case mixed, 24 characters or more; for
`Bearer` 8 at least, for `Basic` a run of base64 that decodes to a
`user:password`). The name of a `name=value` is also the run of name
characters before the `=`, as in a query string (`https://h/get?token=x`). A
name is judged by its last 128 bytes of UTF-8 and its case folded in ASCII, as
C judges it. Each rule judges the text as it came, and a run of characters to
mask is one `********`: nothing that 7.26.19 or 7.26.20 masked is shown, but
the word after a bare `Bearer` that cannot be a credential, and a name that C
judges otherwise (over 128 bytes, or with a letter that is no ASCII). A key
is judged as a name, never as a value: a key that is itself a credential (a
dict keyed by tokens, `{"eyJ...": 1}`) is shown as it is. A NUL in a string is
read as a blank; linear and bounded (a text over 4 MB is not shown at all).
`key` and `cert` are not secrets' names.

### Logging

All log functions take a `format` and its arguments, with `printf`-style
substitution (`%s`, `%d`, `%i`, `%f`, `%o`/`%O`); arguments left over are
appended. A message with no arguments (a template literal, the usual case)
is printed as it is, so a `%s` in its data is not touched. There is no
`gobj` or error-code argument (that's the C API — the JS runtime is simpler).

```javascript
log_error("Command not found: %s", command);    // → "Command not found: open"
log_error(`Command not found: ${command}`);     // the same line
```

(Up to 7.25.9 the arguments were dropped: the first line printed
`Command not found: undefined`.)

```javascript
log_error(format, ...args)       // red, prefixed "ERROR"
log_warning(format, ...args)     // yellow, prefixed "WARNING"
log_info(format, ...args)        // cyan, prefixed "INFO"
log_debug(format, ...args)       // silver, prefixed "DEBUG"
trace_msg(format, ...args)       // cyan, prefixed "MSG"
trace_json(json, msg)            // dir-dump a JSON object

// Redirect error/warning output to a single remote handler
set_remote_log_functions(remote_log_fn)   // fn(message) — single function

// Receive every log record (any level) in your own sink
set_log_callback(fn)                      // fn(level, message)

// Gate the DIRECT browser-console writes of all the functions above
set_console_log_enabled(enabled)          // default: true (unchanged behaviour)

// ...and a per-LINE say over them, on top of that switch (7.13.6)
set_console_log_filter(fn)                // fn(level, msg) -> true to print
set_console_log_filter(null)              // default: everything prints
```

**Three independent output paths.** `set_console_log_enabled(false)` silences
only the `console.*` writes: the log-sink callback (`set_log_callback`) and the
remote log functions (`set_remote_log_functions`) still fire. That is what lets
a GUI route framework output — **including the automata/FSM trace, which arrives
as `debug`** — into its own monitor window while keeping the browser console
clean (gobj-ui's dev-window "Output" selector does exactly this).

**Why a filter and not just the switch.** The console write happens **before**
the sink is called, so nothing downstream can un-print a line: a consumer that
wants one CLASS of lines kept off the console — the dev monitor hiding the
`machine` trace's timer traffic, two `EV_TIMEOUT` lines a second for ever — can
only say so here. The filter decides the **console alone**: the sink still
receives every line, so a monitor keeps a complete record and decides
separately what to show. The master switch still wins, and a filter that
**throws** is ignored — a broken one must never be able to silence the log.

### Tracing: the `machine` trace, and the levels around it

The FSM is where things happen, so the trace of the FSM **is** the execution
log. The level model is the C kernel's — same names, same bits — so a level
means one thing on both sides and a habit learned on a node transfers here.

```javascript
gobj_set_global_trace("machine", true)     // everything
gobj_set_gclass_trace("C_MY_VIEW", "machine", true)
gobj_set_gobj_trace(gobj, "ev_kw", true)   // + the kw of each event
gobj_set_gobj_no_trace(noisy, "machine", true)   // veto, by the SOURCE gobj

gobj_global_trace_level()                  // the mask in force
gobj_trace_level(gobj)                     // global | gclass | gobj, combined
gobj_repr_global_trace_levels()            // [{name, bit, description, set}]
gobj_set_deep_trace(1)                     // everything, everywhere
gobj_set_trace_machine_format(1)           // 1 = simpler (DEFAULT), 0 = legacy
```

**Two shapes for the machine trace**, the C kernel's two, and the same default
(`1`, since 7.13.7):

```
1  🔄 EV_TIMEOUT C_TIMER^t ST_IDLE from C_TIMER^t
0  🔄 mach(C_TIMER^t), st: ST_IDLE, ev: EV_TIMEOUT, ac: fi(), from(C_TIMER^t)
   🔀🔀 mach(C_TIMER^t), new st(ST_IDLE), prev st(ST_IDLE)
   <- mach(C_TIMER^t), st: ST_IDLE, ev: EV_TIMEOUT, ret: 0
```

One line per transition against three. Both name the event, so anything that
reads the trace back by event name works across the switch. Every line is
prefixed by its nesting depth (two spaces per level of `__inside__`), so an
event sent from inside another one's action is indented under it — **keep that
indentation when you render the line somewhere else**; it is the only thing
that says a transition happened *during* another.

Levels: `machine`, `create_delete`, `create_delete2`, `subscriptions`,
`start_stop`, `ev_kw`, `authzs`, `states`, `gbuffers`, `timer`, `fs`,
`liburing`, `timer_periodic`, `liburing_timer`, `commands`. The ones that only
exist on a node keep their bit rather than being dropped — removing them would
shift every bit above and break that alignment.

A gobj's effective level is the **union** of global, gclass and gobj.
`timer` / `timer_periodic` light up for their own event only. And the veto is
asked of the **source**, so one noisy sender can be silenced without turning
the destination off.

The trace arrives as `debug`, so **`set_log_callback()` is how you read it** —
that is how a dev panel shows the machine inside the app, and how
`doc.yuneta.io/navigation` feeds the panel under each of its demos.

**The yuno persists the levels a user sets**, as a C yuno does: `C_YUNO` has the
trace commands of the C kernel (`set-global-trace`, `set-global-no-trace`,
`set-gclass-trace`, `set-gclass-no-trace` and their `get-` forms) and saves
each scope whole in `trace_levels` / `no_trace_levels`. At start up a saved
scope **replaces** what `main.js` set before creating the yuno:

```javascript
gobj_set_global_no_trace("timer_periodic", true);           // main.js default
let yuno = gobj_create_yuno("app_yuno", "C_YUNO", {...});    // restores the saved scopes
gobj_command(yuno, "set-global-no-trace", {level: "timer_periodic", set: 0}, yuno);
// no_trace_levels.__global_no_trace__ = [] -- stays off after a reload
```

`set` is read as the C kernel reads it: a boolean, an integer, or text --
`set`/`reset`, a JSON integer (`"1"`, `"-1"`, `"0"`), `true`/`false`,
`yes`/`no`, `on`/`off` in any case. Anything else answers `-1` *"bitmask set
or re-set?"*: a real (`2.5`), `" 1"`, `"0x1"`, `"1e3"`, `"+5"`, `"007"`.

The traffic of the websocket is `C_IEVENT_CLI`'s own level `ievents`; its lines
go to the yuno attr `trace_ievent_callback`, or to the console.

> The old yuno attrs `tracing`, `trace_timer`, `trace_inter_event`,
> `trace_creation`, `trace_start_stop`, `trace_subscriptions`, `trace_i18n` and
> `no_poll` are gone (7.22.0). A `gobj_create_yuno()` that still passes them
> logs *"GClass Attribute NOT FOUND"* for each: remove them, and turn traces on
> with the commands above.

### i18n: `refresh_language` and the `data-i18n-*` family

The runtime does not translate anything itself — the **app** owns the
translator (i18next, typically) and passes it in as `t`. What the runtime
provides is the mechanism to **re-translate live DOM** when the language
changes:

```javascript
refresh_language(element, t)     // element defaults to `document`
```

It only re-translates a node that **carries its key**, so passing a string
through `t()` once at build time is not enough — that text is frozen in the
mount-time language for the life of the view. Tag the DOM instead:

| Attribute | Re-translates |
|---|---|
| `data-i18n` | the element's first text node |
| `data-i18n-title` | the `title` attribute (hover tooltip) |
| `data-i18n-aria-label` | the `aria-label` (assistive-tech name) |
| `data-i18n-placeholder` | the `placeholder` of an input/textarea |

The three attribute variants exist because `data-i18n` walks **text nodes**,
which cannot reach an attribute. Anything a third-party **widget** draws is
reachable by none of them — re-render it from the language-change handler
instead.

**A missing key is invisible**: i18next answers an unknown key with the key
itself, so it renders as lower-case English and never changes language. Do not
compose data into a key either (`` `${key} · ${t(mode)}` ``) — split it so each
translatable half carries its own key.

### String Formatting

```javascript
sprintf(format, ...args)    // printf-style
vsprintf(fmt, argv)         // variadic version
```

Format specifiers: `%s` `%d` `%i` `%f` `%e` `%g` `%o` `%x` `%X` `%b` `%c` `%j` (JSON) `%t` (boolean) `%T` (type) `%v` (value) `%u` (unsigned)

---

## Built-in GClasses

### C_YUNO

The application root. Always the first GClass registered.

```javascript
import { register_c_yuno } from "@yuneta/gobj-js";
register_c_yuno();
```

Key attributes: `yuno_name`, `yuno_role`, `yuno_id`, `yuno_version`, `yuno_release`, `yuneta_version`, `required_services`, `tracing`, `start_date`, `node_uuid`, `__username__`

The yuno's `required_services` is the **fallback** for links that declare none
of their own. A multi-link yuno should set the list on each `C_IEVENT_CLI`
instead — see [C_IEVENT_CLI](#c_ievent_cli) below.

### C_TIMER

Manages timeouts and periodic timers.

```javascript
import { register_c_timer, set_timeout, set_timeout_periodic, clear_timeout } from "@yuneta/gobj-js";
register_c_timer();

// One-shot timeout (ms)
set_timeout(timer_gobj, 5000);

// Periodic timeout
set_timeout_periodic(timer_gobj, 1000);

// Cancel
clear_timeout(timer_gobj);
```

Events published: `EV_TIMEOUT`, `EV_TIMEOUT_PERIODIC`. They go to the
`subscriber` attr, else, for a pure child, to its parent, which the timer
subscribes in `mt_create` — the C timer's rule. Up to 7.26.21 a pure child
SENT the timeout to its parent instead of publishing it (and to its parent
even when it had a `subscriber`). BREAKING in 7.26.22: the parent's
`EV_TIMEOUT` action now runs inside the timer's publication, so destroying
the timer or the parent there is the ERROR *"Destroying a gobj while its tree
is publishing"*. Defer it with `gobj_post_event()` to yourself; re-arming or
clearing the timer in the action is fine.

Attributes: `subscriber`, `periodic`, `msec`

### C_IEVENT_CLI

Inter-event client — proxies a remote Yuneta service over WebSocket so it looks like a local GObject. Used to communicate with backend yunos.

```javascript
import { register_c_ievent_cli } from "@yuneta/gobj-js";
register_c_ievent_cli();

let remote = gobj_create_service("backend", "C_IEVENT_CLI", {
    url: "ws://localhost:1991",
    wanted_yuno_role: "agent",
    wanted_yuno_service: "agent",
    jwt: "...",
}, gobj_yuno());
```

Key attributes: `url`, `jwt`, `wanted_yuno_role`, `wanted_yuno_name`, `wanted_yuno_service`, `remote_yuno_role`, `remote_yuno_name`, `remote_yuno_service`, `required_services`, `timeout_retry`, `timeout_retry_max`

Its events (`EV_ON_OPEN`, `EV_ON_CLOSE`, `EV_ON_OPEN_ERROR`, `EV_ON_ID_NAK` and every message that names no service) are PUBLISHED: to the `subscriber` attr, else, for a pure child, to its parent, which it subscribes in `mt_create` — one subscription, as the C transport. Up to 7.26.21 a pure child SENT three of them to its parent and subscribed nobody, so its parent never heard `EV_ON_CLOSE` / `EV_ON_OPEN_ERROR`: a host of a pure child must declare both in its FSM (BREAKING in 7.26.22).

A message that names no service is published only when its event is declared PUBLIC by some registered gclass (`gobj_find_event_type(name, EVF_PUBLIC_EVENT)`, as C's `gclass_find_public_event()`; 7.26.24 took any declaration, 7.26.25 requires it public); any other is dropped with a WARNING, its name masked. The events the transport says itself (`EV_ON_OPEN`, `EV_ON_CLOSE`, `EV_ON_OPEN_ERROR`, `EV_ON_ID_NAK`, `EV_TIMEOUT`, `EV_ON_MESSAGE`, and `EV_IDENTITY_CARD_ACK` in session) are never taken from the server, in any case of letters and whatever service the message names: a WARNING, dropped (7.26.25). A backend event an app receives must therefore be declared `EVF_PUBLIC_EVENT` in the gclass that receives it:

```javascript
const event_types = [
    ["EV_MT_COMMAND_ANSWER",    event_flag_t.EVF_PUBLIC_EVENT],
    ["EV_REALTIME_ALARM",       event_flag_t.EVF_PUBLIC_EVENT],
];
```

What the server gets wrong is a WARNING, never an ERROR. Before the session only `EV_IDENTITY_CARD_ACK` is taken; a `dst_role` or `dst_yuno` that is not this yuno's closes the channel too (an empty one is legal: anybody's), as the C transport does; an event that the named service does not take as public is dropped (7.26.24). A channel closed for a fault of the server is closed with **4002**, not 1000 (a browser may send only 1000 or 3000-4999, so 1002 cannot be used), so `EV_ON_CLOSE` says the session was cut (7.26.25).

`EV_ON_CLOSE` carries `code`, `reason` (masked) and `was_clean`, and so does `EV_ON_OPEN_ERROR` (7.26.24). A session that ends cleanly (a stop, a logout, the server closing with 1000 or 1001) is logged by nobody; a session CUT -- not clean, or any other code (1006, 1008, 1011) -- is one WARNING with the code and the reason masked:

```javascript
// in the subscriber's EV_ON_CLOSE action
if(!kw.was_clean || (kw.code !== 1000 && kw.code !== 1001)) {
    show_banner(t("connection lost"));      // the WARNING is already logged
}
```

**`required_services`** (default `[]`) is the list this link advertises in its
identity_card, which the remote's `C_AUTHZ` uses to authorize commands. It is
**per link**: empty falls back to the yuno's own `required_services`, so a
single-link yuno needs nothing. A **multi-link** yuno must set it per link — a
yuno-wide list can only be the union of every backend's services, so each
backend would be handed the service names of all the others, and get a card
naming services it does not host.

**Reconnect backoff.** A dropped link retries after `timeout_retry` (5s), then
**doubles** up to `timeout_retry_max` (60s), with ±20% jitter. The jitter is
what breaks lockstep, so N links that dropped together do not stampede a backend
that is just coming back. The backoff resets when a session is actually reached,
and on `mt_start` — a deliberate reconnect never inherits a previous run's
penalty. A session the transport closes for a fault of the server (4002) does not
count as reached: the backoff goes on from where it was (7.26.25), so a server
that breaks every session is not reconnected at the first delay for ever -- unless
the session outlived `timeout_retry_max`: a session that long was served, and its
fault starts the backoff over, as a clean end does (7.26.26). For the old fixed-interval behaviour set `timeout_retry_max` equal to
`timeout_retry`. The BASE of the first delay is **at least 1000 ms** (7.26.27;
the ±20% jitter puts the first delay itself between 800 and 1200 ms): a lower
`timeout_retry` is raised to 1000 with one WARNING, because 0 never doubled
away from 0 and a server that closes before the ack was reconnected in a loop
with no wait, hundreds of times a second.

**A refused identity card** (`result < 0` in its ack) publishes `EV_ON_ID_NAK`
and closes the channel with 1000; no session was reached, so the close is then
`EV_ON_OPEN_ERROR` (one WARNING), and the link retries -- as the C transport.
A subscriber that shows the refusal on `EV_ON_ID_NAK` should not show a second
error on the `EV_ON_OPEN_ERROR` that follows it.

**Stats and commands the server asks of this client** (`EV_MT_STATS`,
`EV_MT_COMMAND`) are not served: the C client runs them on the service named and
answers, a browser client does not run what its server asks. Each is one WARNING
naming what was asked (masked), and the session goes on (7.26.26; up to 7.26.25
they were dropped without a trace).

---

## TreeDB Helpers

Utilities for interacting with the Yuneta TreeDB (schema-driven graph database):

```javascript
import {
    treedb_hook_data_size,
    treedb_decoder_fkey,
    treedb_encoder_fkey,
    treedb_decoder_hook,
    treedb_get_field_desc,
    template_get_field_desc,
    create_template_record,
} from "@yuneta/gobj-js";

treedb_hook_data_size(value)                // count with caching
treedb_decoder_fkey(col, fkey)              // parse foreign key reference
treedb_encoder_fkey(col, fkey)              // build fkey string "topic^id^hook"
treedb_decoder_hook(col, hook)              // parse hook reference
treedb_get_field_desc(col)                  // build field descriptor from column
template_get_field_desc(key, value)         // build field descriptor from template
create_template_record(template, kw)        // instantiate from template
```

---

## Writing a Custom GClass

```javascript
import {
    SDATA, SDATA_END,
    data_type_t, sdata_flag_t,
    gclass_create,
    gobj_subscribe_event, gobj_yuno, gobj_parent,
    gobj_read_pointer_attr,
    trace_msg,
} from "@yuneta/gobj-js";

const GCLASS_NAME = "C_MY_CLASS";

// 1. Attribute schema
const attrs_table = [
    SDATA(data_type_t.DTP_STRING,  "url",        sdata_flag_t.SDF_RD, "", "Remote URL"),
    SDATA(data_type_t.DTP_INTEGER, "retries",    sdata_flag_t.SDF_RD,  3, "Max retries"),
    SDATA(data_type_t.DTP_POINTER, "subscriber", 0, null, "Subscriber of the output events"),
    SDATA_END()
];

// 2. Private data (per-instance, copied from this template)
const PRIVATE_DATA = {
    retry_count: 0,
};

// 3. Lifecycle methods
function mt_create(gobj) {
    // The attrs already hold their values: defaults + the kw of the create.

    /*
     *  CHILD subscription model (a SERVICE uses the other one, see the
     *  skeletons of yuno-skeleton)
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);
}
function mt_start(gobj) {
    // subscribe to events OF OTHER gobjs here
    gobj_subscribe_event(gobj_yuno(), "EV_TIMEOUT_PERIODIC", {}, gobj);
}
function mt_stop(gobj) { }
function mt_destroy(gobj) { }

// 4. Action functions
function ac_timeout(gobj, event, kw, src) {
    trace_msg(`Tick! retry_count=${gobj.priv.retry_count}`);
    gobj.priv.retry_count++;
    return 0;  // kw consumed
}

// 5. FSM
const st_idle = [
    ["EV_TIMEOUT_PERIODIC", ac_timeout, null],
];
const states = [
    ["ST_IDLE", st_idle],
];
const event_types = [
    ["EV_TIMEOUT_PERIODIC", 0],
];

// 6. Methods table
const gmt = { mt_create, mt_start, mt_stop, mt_destroy };

// 7. Register
function register_c_my_class() {
    return gclass_create(
        GCLASS_NAME,
        event_types,
        states,
        gmt,
        0,              // lmt (low-level methods)
        attrs_table,
        PRIVATE_DATA,
        0,              // authz_table
        0,              // command_table
        0,              // s_user_trace_level
        0               // gclass_flag
    );
}

export { register_c_my_class };
```

---

## Source Layout

```
kernel/js/gobj-js/
├── README.md                          ← this file
├── package.json
├── vite.config.js
├── dist/                              ← compiled outputs (ES, CJS, UMD, IIFE)
├── tests/                             ← vitest suite, one file per contract (npm test)
└── src/
    ├── index.js                       ← public API entry point (barrel export)
    ├── gobj.js                        ← GObject/FSM runtime      (~5 600 LOC)
    ├── helpers.js                     ← utilities, JSON, logging (~4 700 LOC)
    ├── c_ievent_cli.js                ← remote service proxy     (~1 600 LOC)
    ├── lib_treedb.js                  ← TreeDB helpers           (~  580 LOC)
    ├── c_timer.js                     ← Timer GClass             (~  390 LOC)
    ├── c_yuno.js                      ← Yuno GClass              (~  530 LOC)
    ├── dbsimple.js                    ← localStorage persistence (~  140 LOC)
    ├── sprintf.js                     ← printf-style formatting  (~  210 LOC)
    ├── command_parser.js              ← command parsing
    └── stats_parser.js                ← stats parsing
```
