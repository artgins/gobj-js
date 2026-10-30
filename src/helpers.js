/*********************************************************************************
 *      Helper functions
 *
 *      Licence: MIT (http://www.opensource.org/licenses/mit-license)
 *      Copyright (c) 2014,2024 Niyamaka.
 *      Copyright (c) 2025-2026, ArtGins.
 *********************************************************************************/
import {
    GObj,
    gobj_short_name,
    json_text_of,
} from "./gobj.js";

import {sprintf} from "./sprintf.js";

const kw_flag_t = Object.freeze({
    KW_REQUIRED     : 0x0001,   // Log error message if not exist.
    KW_CREATE       : 0x0002,   // Create if not exist
    KW_WILD_NUMBER  : 0x0004,   // For numbers work with real/int/bool/string without error logging
    KW_EXTRACT      : 0x0008,   // Extract (delete) the key on read from dictionary.
    KW_BACKWARD     : 0x0010,   // Search backward in lists or arrays
    KW_VERBOSE      : 0x0020,   //
    KW_LOWER        : 0x0040,   //
    KW_RECURSIVE    : 0x0080,   //
});

const json_type = Object.freeze({
    JSON_OBJECT:    1,
    JSON_ARRAY:     2,
    JSON_STRING:    3,
    JSON_INTEGER:   4,
    JSON_REAL:      5,
    JSON_TRUE:      6,
    JSON_FALSE:     7,
    JSON_NULL:      8
});

/************************************************************
 *          log function
 ************************************************************/

/********************************************
 *  Log functions
 ********************************************/
/* jshint node: true */
const _console = typeof window !== "undefined" ? window.console : console;
let f_error = _console.error;
let f_warning = _console.warn;
let f_info = _console.info;
let f_debug = _console.debug;

/*  Optional sink that mirrors every framework log line (error / warning /
 *  info / debug / msg) somewhere else — e.g. a GUI dev monitor that shows the
 *  browser console inside the app. It runs IN ADDITION to the console; null
 *  (default) leaves behaviour unchanged. Called as (level, msg, hora).
 *  CONTRACT: `msg` is a string for every text level, EXCEPT level "json"
 *  (trace_json payloads), where it is the raw object so the sink can
 *  pretty-print it — a sink must handle both. */
let __log_callback__ = null;

/*  The lines the log helpers wrote since the page loaded, bounded. A sink is
 *  installed by application code, well after the first lines are written
 *  (gobj_start_up, the yuno, the first services): without this, a monitor
 *  would start mid-way through what the browser console shows whole. A new
 *  sink is handed this backlog first, so both show the same session. A json
 *  line is kept as text, because the object it came from goes on changing. */
const LOG_BACKLOG_MAX = 600;
const __log_backlog__ = [];

function keep_in_backlog(level, msg, hora)
{
    let m = msg;
    if(level === "json") {
        m = log_stringify(msg);     // String() threw too (no prototype, a revoked Proxy)
    }
    __log_backlog__.push([level, m, hora]);
    if(__log_backlog__.length > LOG_BACKLOG_MAX) {
        __log_backlog__.shift();
    }
}

function set_log_callback(fn)
{
    fn = (typeof fn === "function") ? fn : null;
    if(fn && fn !== __log_callback__) {
        /*  The same sink installed again (an app that re-applies its dev
         *  setup) is not replayed to, or it would see every line twice.  */
        __log_callback__ = fn;
        for(const [level, m, hora] of __log_backlog__.slice()) {
            let msg = m;
            if(level === "json") {
                try {
                    msg = JSON.parse(m);
                } catch(e) {
                    msg = m;
                }
            }
            __deliver_log__(level, msg, hora);
        }
        return;
    }
    __log_callback__ = fn;
}

/*  Master switch for the DIRECT browser-console writes of the log helpers
 *  (log_error/log_warning/log_info/log_debug, trace_msg, trace_json).
 *  Default on: the framework logs to the console as it always has. A GUI dev
 *  monitor can turn it off to route output to its own window only (see
 *  gobj-ui's yui_dev.js "Output" selector). Orthogonal to everything else:
 *  the log-sink callback (set_log_callback) still fires — so the monitor keeps
 *  receiving lines while the console stays clean — and remote log functions
 *  (set_remote_log_functions) still fire too. */
let __console_output_enabled__ = true;

function set_console_log_enabled(enabled)
{
    __console_output_enabled__ = enabled ? true : false;
}

/*  A per-LINE say over the console writes, on top of the master switch above.
 *  `fn(level, msg)` returns true to let the line through; null (default)
 *  lets everything through, which is the behaviour there has always been.
 *
 *  It exists because the console write happens BEFORE the log sink is
 *  called, so nothing downstream can un-print a line: a consumer that wants
 *  to silence a class of lines on the console -- gobj-ui's dev monitor
 *  silencing the timer traffic of the `machine` trace, which is two lines a
 *  second for ever -- has no way to do it except here. The alternative was
 *  for the monitor to turn this console off entirely and reprint everything
 *  itself, which duplicates the format of every helper below.
 *
 *  It filters the CONSOLE only. The log sink still receives every line, so a
 *  monitor keeps its own complete record and decides separately what to show. */
let __console_log_filter__ = null;

function set_console_log_filter(fn)
{
    __console_log_filter__ = (typeof fn === "function") ? fn : null;
}

/*  Does the console want this line? A filter that throws is ignored: a
 *  broken one must never be able to silence the log. */
function console_wants(level, msg)
{
    if(!__console_output_enabled__) {
        return false;
    }
    if(!__console_log_filter__) {
        return true;
    }
    try {
        return __console_log_filter__(level, msg) ? true : false;
    } catch(e) {
        return true;
    }
}

let __in_log_callback__ = false;

function emit_log_callback(level, msg, hora)
{
    if(__in_log_callback__) {
        return;     /*  a line logged BY the sink is not part of the session  */
    }
    keep_in_backlog(level, msg, hora);
    __deliver_log__(level, msg, hora);
}

function __deliver_log__(level, msg, hora)
{
    if(__log_callback__ && !__in_log_callback__) {
        /*  Re-entrancy guard: a sink that itself logs (directly or through any
         *  framework helper) must not loop back into itself. */
        __in_log_callback__ = true;
        try {
            /*  Pass msg as-is: text levels already send a string; "json" sends
             *  the raw object so the sink can pretty-print it. */
            __log_callback__(level, msg, hora);
        } catch(e) {
            /*  A broken sink must never break the framework's own logging. */
        } finally {
            __in_log_callback__ = false;
        }
    }
}

function set_remote_log_functions(remote_log_fn)
{
    if(remote_log_fn) {
        f_error = remote_log_fn;
        f_warning = remote_log_fn;
    } else {
        f_error = _console.error;
        f_warning = _console.warn;
    }
}

/************************************************************
 *  JSON.stringify for a log line: a circular object (a gobj,
 *  a DOM node), a BigInt or a toJSON() that throws must not make
 *  the log call itself throw -- and neither must the fallback:
 *  String() throws too, on an object with no prototype or with a
 *  toString() that throws.
 ************************************************************/
function log_stringify(v)
{
    try {
        /*  A BigInt has no json: as text, all its digits (JSON.stringify
         *  threw, and a replayed backlog lost the value).  */
        return JSON.stringify(v, (k, x) => (typeof x === "bigint") ? x.toString() : x);
    } catch(e) {
        try {
            return String(v);
        } catch(e2) {
            return `<${typeof v}: not printable>`;
        }
    }
}

/*
 *  String() throws for an object with no prototype, a toString that throws
 *  or a revoked Proxy; a log line must print whatever it is given.
 */
function log_string(v)
{
    try {
        return String(v);
    } catch(e) {
        return log_stringify(v);
    }
}

function log_number(parse, v)
{
    try {
        return parse(v);
    } catch(e) {
        return log_string(v);
    }
}

function format_log(format)
{
    const args = Array.prototype.slice.call(arguments);
    let output = "";

    if (typeof format === 'string') {
        if(args.length === 1) {
            /*  A message already composed (a template literal, the usual
             *  case) is not a format: a '%s' in its data stays as it is. */
            return format;
        }
        let i = 1;
        output = format.replace(/%[sdifoOj%]/g, match => {
            if(match === '%%') {
                return '%';     // takes no argument
            }
            const val = args[i++];
            switch (match) {
                case '%s': return log_string(val);
                case '%d':
                case '%i':
                    if(typeof val === 'bigint') {
                        return val.toString();  // parseInt() lost its precision
                    }
                    return log_number(parseInt, val);
                case '%f':
                    if(typeof val === 'bigint') {
                        return val.toString();
                    }
                    return log_number(parseFloat, val);
                case '%j': return log_stringify(val);
                case '%o':
                case '%O':
                    return typeof val === 'object' ? log_stringify(val) : log_string(val);
                default: return match;
            }
        });

        // Append any remaining arguments (e.g. raw objects or extra messages)
        const rest = args.slice(i).map(arg =>
            typeof arg === 'object' ? log_stringify(arg) : log_string(arg)
        );

        if (rest.length > 0) {
            output += " " + rest.join(" ");
        }
    } else {
        // If no format string, join all args
        output = args.map(arg =>
            typeof arg === 'object' ? log_stringify(arg) : log_string(arg)
        ).join(" ");
    }

    return output;
}

/*
 *  A log function can throw -- a remote one (set_remote_log_functions())
 *  over a socket that is gone, an app's handler with a bug -- and a log line
 *  must never take its caller with it. What it threw goes to the console.
 */
function call_log_function(fn, ...args)
{
    try {
        fn(...args);
    } catch(e) {
        try {
            _console.error("a log function threw:", e);
        } catch(e2) {
            /*  the console itself is gone: nothing is left to say it with  */
        }
    }
}

/*
 *  The REMOTE log function (set_remote_log_functions()) is not called again
 *  from inside itself: one whose socket logs as it fails recursed until the
 *  stack overflowed. Only the remote call is dropped -- the inner line still
 *  reaches the console and the sink. The console functions are not guarded:
 *  a guard shared with them swallowed the console line of any level the
 *  remote one logged. Synchronous recursion only: a remote
 *  function that logs from a timer still loops, so unwire it first on a
 *  teardown (set_remote_log_functions(null)).
 */
let __in_remote_log__ = false;

function call_remote_log_function(fn, ...args)
{
    if(__in_remote_log__) {
        return;
    }
    __in_remote_log__ = true;
    try {
        call_log_function(fn, ...args);
    } finally {
        __in_remote_log__ = false;
    }
}

function log_error(format, ...args)
{
    let msg = format_log(format, ...args);
    let hora = current_timestamp();

    if(f_error) {
        if(f_error === _console.error) {
            if(console_wants("error", msg)) {
                call_log_function(f_error, "%c" + hora + " ERROR: " + String(msg), "color:red");
            }
        } else {
            if(console_wants("error", msg)) {
                _console.error("%c" + hora + " ERROR: " + String(msg), "color:red");
            }
            call_remote_log_function(f_error, `${hora} ERROR: ${String(msg)}`);
        }
    }
    emit_log_callback("error", msg, hora);
}

function log_warning(format, ...args)
{
    let msg = format_log(format, ...args);
    let hora = current_timestamp();

    if(f_warning) {
        if(f_warning === _console.warn) {
            if(console_wants("warning", msg)) {
                call_log_function(f_warning, "%c" + hora + " WARNING: " + String(msg), "color:yellow");
            }
        } else {
            if(console_wants("warning", msg)) {
                _console.warn("%c" + hora + " WARNING: " + String(msg), "color:yellow");
            }
            call_remote_log_function(f_warning, `${hora} WARNING: ${String(msg)}`);
        }
    }
    emit_log_callback("warning", msg, hora);
}

function log_info(format, ...args)
{
    let msg = format_log(format, ...args);
    let hora = current_timestamp();

    if(f_info) {
        if(console_wants("info", msg)) {
            call_log_function(f_info, "%c" + hora + " INFO: " + String(msg), "color:cyan");
        }
    }
    emit_log_callback("info", msg, hora);
}

function log_debug(format, ...args)
{
    let msg = format_log(format, ...args);
    let hora = current_timestamp();

    if(f_debug) {
        if(console_wants("debug", msg)) {
            call_log_function(f_debug, "%c" + hora + " DEBUG: " + String(msg), "color:silver");
        }
    }
    emit_log_callback("debug", msg, hora);
}

function trace_msg(format, ...args)
{
    let msg = format_log(format, ...args);
    let hora = current_timestamp();

    if(f_debug) {
        if(console_wants("msg", msg)) {
            call_log_function(f_debug, "%c" + hora + " MSG: " + String(msg), "color:cyan");
        }
    }
    emit_log_callback("msg", msg, hora);
}

function trace_json(jn, msg)
{
    if(console_wants("json", msg)) {
        if(msg) {
            call_log_function(_console.warn, "=====> " + log_string(msg));
        }
        call_log_function(_console.dir, jn);
    }
    /*  Also mirror it to the log sink (e.g. the dev monitor) so the payload
     *  shows next to the trace that dumped it — console.dir stays in the
     *  browser console only. */
    emit_log_callback("json", jn, current_timestamp());
}

/************************************************************
 *  The names of the secrets (is_secret_name()). The same lists
 *  as the C kernel's helpers.c: a name that holds one of these
 *  (any case) is a secret.
 ************************************************************/
const SECRET_NAME_PARTS = [
    "passw", "pwd", "passphrase", "secret", "token", "jwt", "bearer",
    "authorization", "cookie", "credential", "salt"
];
/*
 *  ... or one of these, once '_', '-', '.' and blanks are taken out
 */
const SECRET_NAME_JOINED = ["apikey", "sessionid", "sessionkey", "authdata"];
/*
 *  ... or one of these as a WHOLE segment, a run of letters and digits
 *  (pass, db_pass, user-pin, sim_pin, otp, user[pin]): inside a word they
 *  are other words (passive, bypass, compass, ping, mapping, spinner,
 *  otpx). Up to 7.26.19 they were no names (NAMES_7_26_9).
 */
const SECRET_NAME_SEGMENTS = ["pass", "pin", "otp"];
/*
 *  A name with one of these SEGMENTS (split by '_', '-', '.' and blanks)
 *  is not a secret: it names something ABOUT a credential (token_endpoint,
 *  cookie_domain, jwt_public_keys, refresh_token_count, pin_count). `key`
 *  and `cert` are no parts: a key is the key of a record as often as a
 *  credential, and a certificate is public.
 */
const NOT_SECRET_SEGMENTS = [
    "endpoint", "url", "uri", "domain", "path", "file", "public", "pub",
    "count", "counts", "type", "name", "len", "length", "size", "max", "min",
    "ttl", "timeout", "expiry", "expires", "mode"
];

/*
 *  Each list by the letter its words begin with: at a character of a
 *  name only the words that begin with it are compared
 */
function words_by_letter(list)
{
    const by_letter = new Array(128).fill(null);
    for(const word of list) {
        const c = word.charCodeAt(0);
        if(!by_letter[c]) {
            by_letter[c] = [];
        }
        by_letter[c].push(word);
    }
    return by_letter;
}
const SECRET_PARTS_BY_LETTER = words_by_letter(SECRET_NAME_PARTS);
const SECRET_JOINED_BY_LETTER = words_by_letter(SECRET_NAME_JOINED);
const SECRET_SEGMENTS_BY_LETTER = words_by_letter(SECRET_NAME_SEGMENTS);
const NOT_SECRET_BY_LETTER = words_by_letter(NOT_SECRET_SEGMENTS);

/*
 *  The case is folded in ASCII only, as the C kernel folds it: a
 *  character that is no ASCII is no letter of a name (the Kelvin sign is
 *  no 'k', whatever toLowerCase() makes of it)
 */
function ascii_lower_code(code)
{
    return (code >= 65 && code <= 90)? code + 32 : code;
}

function is_name_joiner_code(code)
{
    return code === 95 || code === 45 || code === 46 || code === 32 || code === 9;  // _ - . blank tab
}

/*
 *  Is the run of `str` from `from` to `to` one of the words of
 *  `by_letter` (words_by_letter(), any case)?
 */
function name_segment_in(str, from, to, by_letter)
{
    const n = to - from;
    if(n === 0) {
        return false;
    }
    const c0 = ascii_lower_code(str.charCodeAt(from));
    const words = (c0 < 128)? by_letter[c0] : null;
    if(!words) {
        return false;
    }
    for(let w = 0; w < words.length; w++) {
        const word = words[w];
        if(word.length !== n) {
            continue;
        }
        let i = 1;
        while(i < n && ascii_lower_code(str.charCodeAt(from + i)) === word.charCodeAt(i)) {
            i++;
        }
        if(i === n) {
            return true;
        }
    }
    return false;
}

/*
 *  Does `part` (lower case) begin at str[i], before `to`? For a joined
 *  part, '_', '-', '.' and blanks after its first letter are skipped.
 */
function name_part_at(str, to, i, part, joined)
{
    let j = i;
    let k = 0;
    while(k < part.length) {
        if(j >= to) {
            return false;
        }
        const code = str.charCodeAt(j);
        if(joined && k > 0 && is_name_joiner_code(code)) {
            j++;
            continue;
        }
        if(ascii_lower_code(code) !== part.charCodeAt(k)) {
            return false;
        }
        j++;
        k++;
    }
    return true;
}

/*
 *  Is the name from `from` to `to` of `str` a secret's? The C kernel's
 *  secret_name_check(), on the same rules: with `about_wins` a segment
 *  about a credential makes it no secret's, with `by_segments` pass, pin
 *  and otp as whole segments are names too.
 */
function secret_name_check(str, from, to, about_wins, by_segments)
{
    if(to - from < 3) {
        return false;   // the shortest part is three letters ("pwd", "jwt", "pin")
    }
    if(about_wins) {
        let seg = from;
        for(let i = from; i <= to; i++) {
            if(i < to && !is_name_joiner_code(str.charCodeAt(i))) {
                continue;
            }
            if(name_segment_in(str, seg, i, NOT_SECRET_BY_LETTER)) {
                return false;
            }
            seg = i + 1;
        }
    }
    if(by_segments) {
        let seg = from;
        for(let i = from; i <= to; i++) {
            if(i < to && is_ascii_alnum_code(str.charCodeAt(i))) {
                continue;
            }
            if(name_segment_in(str, seg, i, SECRET_SEGMENTS_BY_LETTER)) {
                return true;
            }
            seg = i + 1;
        }
    }
    let has_priv = false;
    let has_key = false;
    for(let i = from; i < to; i++) {
        const c = ascii_lower_code(str.charCodeAt(i));
        if(c >= 128) {
            continue;
        }
        const parts = SECRET_PARTS_BY_LETTER[c];
        for(let k = 0; parts && k < parts.length; k++) {
            if(name_part_at(str, to, i, parts[k], false)) {
                return true;
            }
        }
        const joined = SECRET_JOINED_BY_LETTER[c];
        for(let k = 0; joined && k < joined.length; k++) {
            if(name_part_at(str, to, i, joined[k], true)) {
                return true;
            }
        }
        if(c === 112 && !has_priv) {            // 'p'
            has_priv = name_part_at(str, to, i, "priv", false);
        } else if(c === 107 && !has_key) {     // 'k'
            has_key = name_part_at(str, to, i, "key", false);
        }
    }
    return has_priv && has_key;
}

/************************************************************
 *  TRUE if `name` is the name of a secret: a password, a token,
 *  a key... Any case. As the C kernel's is_secret_name().
 ************************************************************/
function is_secret_name(name)
{
    if(typeof name !== "string") {
        return false;
    }
    return secret_name_check(name, 0, name.length, true, true);
}

/*
 *  The names a reading judges by: the names of now, or the names of
 *  7.26.19 (the C kernel's 7.26.9) -- by their parts only, pass, pin
 *  and otp no names. As the C kernel's secret_names_t.
 */
const NAMES_NOW = 0;
const NAMES_7_26_9 = 1;

/*
 *  Is the name from `from` to `to` of `str` a secret's, judged by its
 *  LAST MASK_MAX_NAME bytes of UTF-8, as the C kernel judges it (the
 *  part that says what it is comes last: <130 x>_password)? A character
 *  the cut splits is, in C, bytes that are no letter and no joiner:
 *  "\u0080" stands for them.
 */
function is_secret_name_tail(str, from, to, names)
{
    const by_segments = (names === NAMES_NOW);
    if((to - from) * 3 <= MASK_MAX_NAME) {
        return secret_name_check(str, from, to, true, by_segments);   // no cut: 3 bytes a unit at most
    }
    let bytes = 0;
    let i = to;
    let partial = false;
    while(i > from) {
        const code = str.charCodeAt(i - 1);
        let n = 3;
        let units = 1;
        if(code < 0x80) {
            n = 1;
        } else if(code < 0x800) {
            n = 2;
        } else if(code >= 0xDC00 && code <= 0xDFFF && i - 2 >= from) {
            const high = str.charCodeAt(i - 2);
            if(high >= 0xD800 && high <= 0xDBFF) {
                n = 4;      // a pair of surrogates: one character of 4 bytes
                units = 2;
            }
        }
        if(bytes + n > MASK_MAX_NAME) {
            partial = (bytes < MASK_MAX_NAME);
            break;
        }
        bytes += n;
        i -= units;
    }
    if(partial) {
        const name = "\u0080" + str.substring(i, to);
        return secret_name_check(name, 0, name.length, true, by_segments);
    }
    return secret_name_check(str, i, to, true, by_segments);
}

/*
 *  Is the word from `from` to `to` of `str`, before a '=' or a ':', a
 *  secret's name, as `names` judges it (its last MASK_MAX_NAME bytes)?
 *  pass, pin and otp only in its part after its last '&', '?' or ';':
 *  before it they are words of the value of another parameter
 *  ("q=boarding+pass&lang=es" masked `es` in gobj-js 7.26.22 to 7.26.24).
 *  As the C kernel's is_param_name_secret().
 */
function param_name_tail_from(str, from, to)
{
    let bytes = 0;
    let i = to;
    while(i > from) {
        const code = str.charCodeAt(i - 1);
        let n = 3;
        let units = 1;
        if(code < 0x80) {
            n = 1;
        } else if(code < 0x800) {
            n = 2;
        } else if(code >= 0xDC00 && code <= 0xDFFF && i - 2 >= from) {
            const high = str.charCodeAt(i - 2);
            if(high >= 0xD800 && high <= 0xDBFF) {
                n = 4;
                units = 2;
            }
        }
        if(bytes + n > MASK_MAX_NAME) {
            return -1;      // before the bytes the C kernel judges
        }
        if(code === 38 || code === 63 || code === 59) {    // & ? ;
            return i;
        }
        bytes += n;
        i -= units;
    }
    return -1;
}

function is_param_name_secret(str, from, to, names)
{
    const tail = (names === NAMES_NOW)? param_name_tail_from(str, from, to) : -1;
    if(tail < 0) {
        return is_secret_name_tail(str, from, to, names);
    }
    if(is_secret_name_tail(str, from, to, NAMES_7_26_9)) {
        return true;
    }
    return is_secret_name_tail(str, from, to, NAMES_NOW) && secret_name_check(str, tail, to, false, true);
}

/************************************************************
 *  Where an unquoted secret value that begins at `p` ends: at
 *  the end, at the quote that closes an outer quoted value, or
 *  before the next "word=" -- a plain word after a blank is still
 *  part of it ("password=correct horse battery", "password=
 *  hunter2"). As the C kernel's inline_secret_value_end().
 ************************************************************/
function inline_secret_value_end(str, p, outer)
{
    const blank = (c) => (c === " " || c === "\t");
    const closes_outer = (i) => (outer && str[i] === outer &&
        (i+1 >= str.length || blank(str[i+1])));
    let end = p;
    while(true) {
        while(end < str.length && !blank(str[end])) {
            if(closes_outer(end)) {
                return end;
            }
            end++;
        }
        if(end >= str.length) {
            return end;
        }
        let w = end;
        while(w < str.length && blank(str[w])) {
            w++;
        }
        if(w >= str.length || closes_outer(w)) {
            return end;
        }
        for(let e = w; e < str.length && !blank(str[e]) && !closes_outer(e); e++) {
            if(str[e] === "=" && e > w) {
                return end;     // the next parameter
            }
        }
        end = w;                // a plain word: part of this value
    }
}

/************************************************************
 *  A credential by its SHAPE, whatever names it -- the C kernel's
 *  jwt_len() / scheme_credential(), the shapes the agent's audit
 *  record redacts, and the schemes of an HTTP Authorization:
 *    - a JWT or a JWE: "eyJ" (the base64url of '{"') at the start
 *      of a word, base64url, and a '.' of its own after it -- three
 *      parts joined by '.' (a JWS), five (a JWE), or fewer when a cap
 *      cut it; the dots at the end of the run are not its own (a JWT
 *      ends a sentence: "... eyJ.eyJ.sig."), so a run whose only
 *      dots end it is a header and no JWT ("eyJhIjoxfQ.");
 *    - the credential after the scheme word "Bearer" or "Basic"
 *      (any case, a word of its own): scheme_credential().
 ************************************************************/
const MASK_TOKEN_MIN = 8;       // a Bearer token is this long at least
const MASK_PROSE_MAX = 24;      // a word of prose is shorter

function is_ascii_alnum_code(code)
{
    return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function is_ascii_letter_code(code)
{
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function is_ascii_upper_code(code)
{
    return code >= 65 && code <= 90;
}

function is_base64url_code(code)
{
    return is_ascii_alnum_code(code) || code === 45 || code === 95;    // '-', '_'
}

/*
 *  The characters of `str` from `p` are `word` (lower case) in any
 *  case: ASCII only, as the C kernel compares them
 */
function ascii_case_equal(str, p, word)
{
    if(str.length - p < word.length) {
        return false;
    }
    for(let i=0; i<word.length; i++) {
        let code = str.charCodeAt(p + i);
        if(code >= 65 && code <= 90) {
            code += 32;
        }
        if(code !== word.charCodeAt(i)) {
            return false;
        }
    }
    return true;
}

/*
 *  The characters of the JWT that begins at `p`, 0 if none begins there
 */
function jwt_len(str, p)
{
    if(str.length - p < 3 || str[p] !== "e" || str[p+1] !== "y" || str[p+2] !== "J") {
        return 0;
    }
    if(p > 0 && (is_base64url_code(str.charCodeAt(p-1)) || str[p-1] === ".")) {
        return 0;   // inside a word, or a part of a dotted run
    }
    let e = p;
    let dotted = false;     // a '.' with a part after it: its own
    while(e < str.length && (is_base64url_code(str.charCodeAt(e)) || str[e] === ".")) {
        if(e > p && str[e] !== "." && str[e-1] === ".") {
            dotted = true;
        }
        e++;
    }
    if(!dotted) {
        return 0;   // base64url of a json, and no part after it
    }
    while(str[e-1] === ".") {
        e--;        // never before p: str[p] is 'e'
    }
    return e - p;
}

/*
 *  The scheme word that begins at `p` -- "bearer" or "basic", any
 *  case, a word of its own and a blank after it -- as its length, 0
 *  if none
 */
function scheme_word_len(str, p)
{
    if(p > 0 && is_ascii_alnum_code(str.charCodeAt(p-1))) {
        return 0;   // inside a word
    }
    for(const scheme of ["bearer", "basic"]) {
        const n = scheme.length;
        if(str.length - p > n && ascii_case_equal(str, p, scheme) &&
                (str[p+n] === " " || str[p+n] === "\t")) {
            return n;
        }
    }
    return 0;
}

/*
 *  The characters of the `n` units of `str` at `w`, as the C kernel
 *  counts them (the bytes of UTF-8 that begin one): code points
 */
function code_points(str, w, n)
{
    let count = 0;
    for(let i = w; i < w + n; i++) {
        const code = str.charCodeAt(i);
        if(code < 0xDC00 || code > 0xDFFF) {   // a low surrogate is the rest of one
            count++;
        }
    }
    return count;
}

/*
 *  Is the word of `n` characters at `w` a word of prose? ASCII
 *  letters only, in runs joined by one '-', '.' or '/' (self-service,
 *  e.g, and/or), each run in lower case, in upper case or capitalized
 *  (bond, Bond, BOND), and shorter than MASK_PROSE_MAX. As the C
 *  kernel's is_prose_word().
 */
function is_prose_word(str, w, n)
{
    if(n === 0 || n >= MASK_PROSE_MAX) {
        return false;
    }
    let i = w;
    const end = w + n;
    while(true) {
        let r = i;
        let upper_rest = true;
        let lower_rest = true;
        while(r < end && is_ascii_letter_code(str.charCodeAt(r))) {
            if(r > i) {
                if(is_ascii_upper_code(str.charCodeAt(r))) {
                    lower_rest = false;
                } else {
                    upper_rest = false;
                }
            }
            r++;
        }
        if(r === i) {
            return false;   // no letter where a run begins
        }
        if(!lower_rest && !(upper_rest && is_ascii_upper_code(str.charCodeAt(i)))) {
            return false;   // its case mixed
        }
        if(r === end) {
            return true;
        }
        if((str[r] !== "-" && str[r] !== "." && str[r] !== "/") || r + 1 === end) {
            return false;
        }
        i = r + 1;
    }
}

/*
 *  The value of a base64 digit, -1 for a character that is none
 */
function base64_digit(code)
{
    if(code >= 65 && code <= 90) {
        return code - 65;
    }
    if(code >= 97 && code <= 122) {
        return code - 97 + 26;
    }
    if(code >= 48 && code <= 57) {
        return code - 48 + 52;
    }
    if(code === 43) {
        return 62;
    }
    if(code === 47) {
        return 63;
    }
    return -1;
}

/*
 *  Does the word of `n` characters at `w` begin with the base64 of
 *  "user:password", the credentials of a Basic Authorization (RFC
 *  7617)? Its run of base64 digits decodes to bytes with a ':' -- the
 *  ones a cap left too, and whatever follows the run in the word
 *  ("(Basic dXNlcjpwYXNz)"). As the C kernel's is_basic_credential().
 */
function is_basic_credential(str, w, n)
{
    let bits = 0;
    let n_bits = 0;
    for(let i = 0; i < n; i++) {
        const v = base64_digit(str.charCodeAt(w + i));
        if(v < 0) {
            return false;
        }
        bits = ((bits << 6) | v) & 0x3FFF;
        n_bits += 6;
        if(n_bits >= 8) {
            n_bits -= 8;
            if(((bits >> n_bits) & 0xFF) === 58) {     // ':'
                return true;
            }
        }
    }
    return false;
}

/*
 *  Where the word after a scheme ends: a blank, an end of line, a
 *  quote, one of ,;}] (or a NUL, where C stops) -- where the token
 *  after "Bearer" ended in gobj-js 7.26.20
 */
const SCHEME_WORD_STOPS = " \t\r\n\"',;}]\u0000";

/*
 *  The credential after a scheme word that begins at `p`: [its
 *  offset from `p`, its length], [0, 0] when what follows the scheme
 *  is no credential. It is the word after the scheme's blanks, to a
 *  character of SCHEME_WORD_STOPS, masked whole: in quotes (the quotes
 *  too), or after the same scheme word again ("Bearer Bearer tok"),
 *  whatever its shape; else when it can be a credential, judged
 *  without the dots that end it: no word of prose, and for "Bearer"
 *  MASK_TOKEN_MIN characters at least, for "Basic" a run of base64
 *  that decodes to a "user:password". As the C kernel's
 *  scheme_credential(): "the bearer of this letter" and "basic plan"
 *  are left as they are.
 */
function scheme_credential(str, p)
{
    const n = scheme_word_len(str, p);
    if(!n) {
        return [0, 0];
    }
    const scheme = (n === 5)? "basic" : "bearer";
    let context = false;
    let t = p + n;
    while(t < str.length && (str[t] === " " || str[t] === "\t")) {
        t++;
    }
    // the scheme doubled, once, as in C: a loop over "Bearer Bearer ..." would be quadratic
    if(t < str.length && scheme_word_len(str, t) === n && ascii_case_equal(str, t, scheme)) {
        t += n;
        context = true;
        while(t < str.length && (str[t] === " " || str[t] === "\t")) {
            t++;
        }
    }
    if(t >= str.length) {
        return [0, 0];
    }

    if(str[t] === '"' || str[t] === "'") {
        let q = t + 1;
        while(q < str.length && str[q] !== str[t] && str[q] !== " " && str[q] !== "\t" &&
                str[q] !== "\r" && str[q] !== "\n" && str[q] !== "\u0000") {
            q++;
        }
        if(q < str.length && str[q] === str[t] && q > t + 1) {
            return [t - p, q + 1 - t];
        }
        return [0, 0];
    }

    let e = t;
    while(e < str.length && SCHEME_WORD_STOPS.indexOf(str[e]) < 0) {
        e++;
    }
    if(e === t) {
        return [0, 0];
    }
    if(!context) {
        let w_end = e;
        while(w_end > t && str[w_end-1] === ".") {
            w_end--;
        }
        const len = w_end - t;
        if(len === 0 || is_prose_word(str, t, len)) {
            return [0, 0];
        }
        if(n === 5) {
            if(!is_basic_credential(str, t, len)) {
                return [0, 0];
            }
        } else if(code_points(str, t, len) < MASK_TOKEN_MIN) {
            return [0, 0];
        }
    }
    return [t - p, e - t];
}

/*
 *  A credential by its shape that begins at `p`: [its offset from
 *  `p`, its length], [0, 0] if none. As the C kernel's shape_len().
 */
function shape_len(str, p)
{
    const c = str[p];
    if(c === "e") {
        return [0, jwt_len(str, p)];
    }
    if(c === "b" || c === "B") {
        return scheme_credential(str, p);
    }
    return [0, 0];
}

/*
 *  The shape at `p` as gobj-js 7.26.20 told it, the one its reading of
 *  the parameters jumps over: a JWT of exactly three parts, or the word
 *  after a "bearer" word, whatever it is (to a blank, an end of line, a
 *  quote or one of ,;}]). [its offset from `p`, its length], [0, 0] if
 *  none. As the C kernel's shape_len_js_7_26_20().
 */
function shape_len_js_7_26_20(str, p)
{
    const c = str[p];
    if(c === "e") {
        if(str.length - p < 3 || str[p+1] !== "y" || str[p+2] !== "J") {
            return [0, 0];
        }
        if(p > 0 && (is_base64url_code(str.charCodeAt(p-1)) || str[p-1] === ".")) {
            return [0, 0];
        }
        let e = p;
        let dots = 0;
        while(e < str.length && (is_base64url_code(str.charCodeAt(e)) || str[e] === ".")) {
            if(str[e] === ".") {
                dots++;
            }
            e++;
        }
        while(str[e-1] === ".") {
            e--;
            dots--;
        }
        return (dots === 2)? [0, e - p] : [0, 0];
    }
    if(c === "b" || c === "B") {
        if(str.length - p <= 6 || !ascii_case_equal(str, p, "bearer")) {
            return [0, 0];
        }
        if(p > 0 && is_ascii_alnum_code(str.charCodeAt(p-1))) {
            return [0, 0];
        }
        let t = p + 6;
        if(str[t] !== " " && str[t] !== "\t") {
            return [0, 0];
        }
        while(t < str.length && (str[t] === " " || str[t] === "\t")) {
            t++;
        }
        let e = t;
        while(e < str.length && " \t\r\n'\",;}]\u0000".indexOf(str[e]) < 0) {
            e++;
        }
        return [t - p, e - t];
    }
    return [0, 0];
}

/*
 *  Where the value of a "name: value" ends, the value beginning at
 *  `v` (its blanks skipped): a quoted text to its closing quote, a
 *  json object or list to its closing bracket (the texts in it
 *  skipped), the text of a json inside a json, its quote escaped
 *  (\"hunter2\"), to the quote escaped the same way, a scheme and the
 *  word after it ("Bearer abc": the WHOLE value), or one word, to a
 *  blank, an end of line or one of ,;&)]}<>"' (or a NUL, where C
 *  stops). As the C kernel's colon_value_end().
 */
const COLON_VALUE_STOPS = " \t\r\n,;&)]}<>\"'\u0000";

function colon_value_end(str, v)
{
    if(v >= str.length) {
        return v;
    }
    const c = str[v];
    if(c === '"' || c === "'") {
        let e = v + 1;
        while(e < str.length && str[e] !== c) {
            if(str[e] === "\\" && e + 1 < str.length) {
                e++;
            }
            e++;
        }
        return (e < str.length)? e + 1 : str.length;
    }
    if(c === "{" || c === "[") {
        let depth = 0;
        let in_string = false;
        for(let e = v; e < str.length; e++) {
            if(in_string) {
                if(str[e] === "\\" && e + 1 < str.length) {
                    e++;
                } else if(str[e] === '"') {
                    in_string = false;
                }
            } else if(str[e] === '"') {
                in_string = true;
            } else if(str[e] === "{" || str[e] === "[") {
                depth++;
            } else if(str[e] === "}" || str[e] === "]") {
                depth--;
                if(depth === 0) {
                    return e + 1;
                }
            }
        }
        return str.length;
    }
    if(c === "\\") {
        let q = v;
        while(q < str.length && str[q] === "\\") {
            q++;
        }
        if(q < str.length && (str[q] === '"' || str[q] === "'")) {
            const level = q - v;
            let run = 0;    // the backslashes before the character looked at
            for(let e = q + 1; e < str.length; e++) {
                if(str[e] === "\\") {
                    run++;
                    continue;
                }
                if(str[e] === str[q] && run === level) {
                    return e + 1;
                }
                run = 0;
            }
            return str.length;
        }
    }
    let e = v;
    const n = scheme_word_len(str, v);
    if(n) {
        e = v + n;
        while(e < str.length && (str[e] === " " || str[e] === "\t")) {
            e++;
        }
        if(e < str.length && (str[e] === '"' || str[e] === "'")) {
            return colon_value_end(str, e);
        }
    }
    while(e < str.length && COLON_VALUE_STOPS.indexOf(str[e]) < 0) {
        e++;
    }
    return e;
}

/*
 *  As the C kernel: masking is reachable from a peer, so it is linear and
 *  bounded. No more than MASK_MAX_NAME bytes of a name (in UTF-8, as C
 *  counts them) are asked about; a text, or the strings of one
 *  json_mask_secrets() call, longer than MASK_MAX_BYTES characters are
 *  not shown at all (they fail safe).
 */
const MASK_MAX_NAME = 128;
const MASK_MAX_BYTES = 4*1024*1024;
const MASK_TOO_LARGE = "<not shown: too large to mask>";

/*
 *  The characters to mask are MARKED (`marks`, one for each), and every
 *  rule judges the text as it came: what one rule masks hides from no
 *  other rule what it judges by. As the C kernel's
 *  mark_inline_secrets().
 */
function mark_range(marks, from, to)
{
    for(let i = from; i < to; i++) {
        marks[i] = 1;
    }
}

/*
 *  The readings of the name=value parameters, each one kept whole, as
 *  the C kernel's param_reading_t: as 7.26.19 read them (the C kernel's
 *  7.26.9: its names, no shape), as 7.26.20 read them (the names of now,
 *  jumping over its shapes), and with the names of now, jumping over no
 *  shape ("Bearer pwd=x")
 */
const READ_NOW = 0;
const READ_AS_GOBJ_JS_7_26_20 = 1;
const READ_AS_7_26_9 = 2;

/*
 *  The name=value secrets of `str`, marked as one reading reads them: a
 *  name=value is judged by the word before its '=' (since the last blank
 *  or '=', its last MASK_MAX_NAME bytes), and the `value` of a
 *  write-attr of a secret attribute too; its value, quoted or not, runs
 *  to the next "word=" (inline_secret_value_end()). Return true if a
 *  name it took for a secret's is none of 7.26.19's. As the C kernel's
 *  mark_params(). With `judged`, a '=' whose name is the same name that
 *  mark_query_params() would judge, is marked there with its verdict:
 *  that name is not asked about again.
 */
function mark_params(str, value_is_secret, reading, marks, judged)
{
    const names = (reading === READ_AS_7_26_9)? NAMES_7_26_9 : NAMES_NOW;
    let not_7_26_9 = false;
    const is_blank_or_end = (i) => (i >= str.length || str[i] === " " ||
        str[i] === "\t" || str[i] === "\u0000");
    let outer = "";     // the quote of an outer value open (command='...')
    let word = 0;       // where the current word begins
    let p = 0;
    while(p < str.length) {
        const c = str[p];
        if(c === " " || c === "\t" || c === "\u0000") {
            p++;
            word = p;
            continue;
        }
        if(c === '"' || c === "'") {
            if(!outer && (p === 0 || str[p-1] === " " || str[p-1] === "\t" || str[p-1] === "=")) {
                outer = c;      // opens a value
            } else if(c === outer && is_blank_or_end(p+1)) {
                outer = "";     // closes it
            }
        }
        if(reading === READ_AS_GOBJ_JS_7_26_20 && (c === "e" || c === "b" || c === "B")) {
            const [offset, n] = shape_len_js_7_26_20(str, p);
            if(n) {
                p += offset + n;
                word = p;
                continue;
            }
        }
        if(c !== "=") {
            p++;
            continue;
        }
        const name_from = word;
        word = p + 1;
        const secret = is_param_name_secret(str, name_from, p, names);
        if(secret && names === NAMES_NOW && !not_7_26_9 && !is_secret_name_tail(str, name_from, p, NAMES_7_26_9)) {
            not_7_26_9 = true;
        }
        if(!(secret || (value_is_secret && p - name_from === 5 &&
                ascii_case_equal(str, name_from, "value")))) {
            if(judged && query_name_from(str, p) === name_from) {
                judged[p] = JUDGED_NOT_SECRET;
            }
            p++;
            continue;
        }
        if(judged && secret && query_name_from(str, p) === name_from) {
            judged[p] = JUDGED_SECRET;
        }
        p++;    // the '='
        let end;
        const quote = (p < str.length && (str[p] === '"' || str[p] === "'"))? str[p] : "";
        if(quote) {
            end = p + 1;
            while(end < str.length && str[end] !== quote && str[end] !== "\u0000") {
                end++;
            }
            if(end < str.length && str[end] === quote) {
                end++;
            }
        } else {
            end = inline_secret_value_end(str, p, outer);
        }
        mark_range(marks, p, end);
        p = end;
        word = p;
    }
    return not_7_26_9;
}

/*
 *  Does a shape of 7.26.20 begin in `str`? Where none does, its reading
 *  reads as READ_NOW does.
 */
function has_shape_js_7_26_20(str)
{
    for(let p = 0; p < str.length; p++) {
        const code = str.charCodeAt(p);
        if((code === 101 || code === 98 || code === 66) && shape_len_js_7_26_20(str, p)[1]) {  // e b B
            return true;
        }
    }
    return false;
}

/*
 *  Where a run of mark_run() stops: a character of `chars`, a CR/LF or a
 *  NUL. The stops of a value of a query string are the C kernel's dump's.
 */
function stop_table(chars)
{
    const table = new Uint8Array(128);
    for(const c of chars + "\r\n\u0000") {
        table[c.charCodeAt(0)] = 1;
    }
    return table;
}
const PARAM_VALUE_STOPS = stop_table("&; \t,\"'<>");
const QUOTE_STOPS = {'"': stop_table('"'), "'": stop_table("'")};

/*
 *  Mark from `p` up to a stop of `stops` (stop_table()) or the end:
 *  return where it stopped
 */
function mark_run(str, p, stops, marks)
{
    let e = p;
    while(e < str.length) {
        const code = str.charCodeAt(e);
        if(code < 128 && stops[code]) {
            break;
        }
        e++;
    }
    mark_range(marks, p, e);
    return e;
}

/*
 *  The value at `v` is a scheme and its credential ("Bearer abc", under
 *  a secret's name): its WHOLE marked, the scheme, its blanks and the
 *  word after them (to a stop of `stops`; a quoted one to its quote).
 *  Return where it ends, -1 when `v` begins no scheme. As the C
 *  kernel's mark_scheme_value().
 */
function mark_scheme_value(str, v, stops, marks)
{
    const n = scheme_word_len(str, v);
    if(!n) {
        return -1;
    }
    let w = v + n;
    while(w < str.length && (str[w] === " " || str[w] === "\t")) {
        w++;
    }
    mark_range(marks, v, w);
    if(w < str.length && (str[w] === '"' || str[w] === "'")) {
        const e = colon_value_end(str, w);
        mark_range(marks, w, e);
        return e;
    }
    return mark_run(str, w, stops, marks);
}

function is_name_char_code(code)
{
    return is_ascii_alnum_code(code) || code === 95 || code === 45 || code === 46;    // _ - .
}

/*
 *  Where the name of the '=' at `eq` begins, for mark_query_params(): the
 *  run of name characters before it, its last MASK_MAX_NAME
 */
function query_name_from(str, eq)
{
    let n = eq;
    while(n > 0 && eq - n < MASK_MAX_NAME && is_name_char_code(str.charCodeAt(n - 1))) {
        n--;
    }
    return n;
}

/*
 *  What mark_params() judged of the name before a '=', when it is the
 *  name that mark_query_params() judges (`judged`): that name is not
 *  asked about again
 */
const JUDGED_NOT_SECRET = 1;
const JUDGED_SECRET = 2;

function hex_digit_value(code)
{
    if(code >= 48 && code <= 57) {          // 0-9
        return code - 48;
    }
    if(code >= 97 && code <= 102) {         // a-f
        return code - 87;
    }
    if(code >= 65 && code <= 70) {          // A-F
        return code - 55;
    }
    return -1;
}

function is_written_name_bracket_code(code)
{
    return code === 91 || code === 93 || code === 39 || code === 34;    // [ ] ' "
}

function is_written_name_code(code)
{
    return is_name_char_code(code) || code === 37 || is_written_name_bracket_code(code);   // %
}

/*
 *  The name before the '=' at `eq` as a form or a query writes it: the run
 *  of name characters, brackets, quotes and '%' before it (its last
 *  MASK_MAX_NAME), its %XX decoded -- user[password], user%5Bpassword%5D,
 *  t%6Fken, 'password'. Is one of its parts, between the brackets and the
 *  quotes, a secret's name? Not its last part when that is a run of name
 *  characters after a bracket or a quote (the "pin" of x"pin): that one is
 *  query_name_from()'s, and so is a name of name characters only. A %XX
 *  decodes to the byte it names, as in C: a byte over 0x7F is no letter of
 *  a name. As the C kernel's written_name_is_secret().
 */
function written_name_is_secret(str, eq)
{
    let n = eq;
    let plain = -1;     // where the run of name characters before `eq` begins
    while(n > 0 && eq - n < MASK_MAX_NAME && is_written_name_code(str.charCodeAt(n - 1))) {
        n--;
        if(plain < 0 && !is_name_char_code(str.charCodeAt(n))) {
            plain = n + 1;
        }
    }
    if(plain < 0) {
        return false;
    }
    const to = (str.charCodeAt(plain - 1) === 37)? eq : plain - 1;    // '%'
    let encoded = false;
    for(let s = n; s < to && !encoded; s++) {
        encoded = (str.charCodeAt(s) === 37);
    }
    let name = str;
    let from = n;
    let end = to;
    if(encoded) {
        name = "";
        for(let s = n; s < to; s++) {
            const hi = (str.charCodeAt(s) === 37 && to - s > 2)? hex_digit_value(str.charCodeAt(s + 1)) : -1;
            const lo = (hi >= 0)? hex_digit_value(str.charCodeAt(s + 2)) : -1;
            if(lo >= 0) {
                name += String.fromCharCode(hi*16 + lo);
                s += 2;
            } else {
                name += str[s];
            }
        }
        from = 0;
        end = name.length;
    }
    let seg = from;
    for(let i = from; i <= end; i++) {
        if(i < end && !is_written_name_bracket_code(name.charCodeAt(i))) {
            continue;
        }
        if(i - seg >= 3 && secret_name_check(name, seg, i, true, true)) {   // no name is shorter
            return true;
        }
        seg = i + 1;
    }
    return false;
}

/*
 *  The value of the name=value at `eq`, marked: inside its quotes, or to a
 *  character of PARAM_VALUE_STOPS (a scheme and its credential whole).
 *  Return where it ends.
 */
function mark_query_value(str, eq, marks)
{
    const v = eq + 1;
    if(v < str.length && (str[v] === '"' || str[v] === "'")) {
        return mark_run(str, v + 1, QUOTE_STOPS[str[v]], marks);
    }
    mark_scheme_value(str, v, PARAM_VALUE_STOPS, marks);
    return mark_run(str, v, PARAM_VALUE_STOPS, marks);
}

/*
 *  The value of a name=value whose name is a secret's, as in a query
 *  string or a form body, marked: inside its quotes, or to a character of
 *  PARAM_VALUE_STOPS. Two readings of the name, each with a frontier of
 *  its own, as if each were a pass of its own (the C kernel's
 *  mark_query_params() with NAME_PLAIN and with NAME_WRITTEN): the run of
 *  name characters (letters, digits, _ - .) before the '=', its last
 *  MASK_MAX_NAME; and the name as a form writes it
 *  (written_name_is_secret()). The word before the '=' can hold more than
 *  the name: in "GET https://my-file-server.com/get?token=x" it holds a
 *  segment about a credential ("file"). The names that mark_params()
 *  judged are not asked about again (`judged`).
 */
/*
 *  A text with none of these holds no name as a form writes it
 */
const WRITTEN_NAME_MARKS = /[[\]%'"]/;

function mark_query_params(str, marks, judged)
{
    let frontier = 0;           // of the plain reading
    let frontier_written = WRITTEN_NAME_MARKS.test(str)? 0 : str.length;    // of the written one
    let p = str.indexOf("=", 1);
    while(p > 0) {
        if(p >= frontier) {
            let secret = (judged[p] === JUDGED_SECRET);
            if(!judged[p]) {
                const n = query_name_from(str, p);
                secret = (n < p && secret_name_check(str, n, p, true, true));
            }
            if(secret) {
                frontier = mark_query_value(str, p, marks);
            }
        }
        if(p >= frontier_written && written_name_is_secret(str, p)) {
            frontier_written = mark_query_value(str, p, marks);
        }
        p = str.indexOf("=", p + 1);
    }
}

/*
 *  The password of the userinfo of a URL (scheme://user:password@host),
 *  marked: from the first ':' of the authority to its last '@'. The
 *  authority runs to a character of URL_AUTHORITY_STOPS. As the C
 *  kernel's mark_url_passwords().
 */
const URL_AUTHORITY_STOPS = stop_table("/?#\"'<> \t");

function mark_url_passwords(str, marks)
{
    let p = str.indexOf("://", 1);
    while(p > 0) {
        let next = p + 1;
        if(is_ascii_alnum_code(str.charCodeAt(p - 1))) {
            let colon = -1;
            let at = -1;
            let e = p + 3;
            while(e < str.length) {
                const code = str.charCodeAt(e);
                if(code < 128 && URL_AUTHORITY_STOPS[code]) {
                    break;
                }
                if(code === 64) {               // '@'
                    at = e;
                } else if(code === 58 && colon < 0) {   // ':'
                    colon = e;
                }
                e++;
            }
            if(colon >= 0 && at > colon) {
                mark_range(marks, colon + 1, at);
            }
            next = e - 1;   // the ':' of the next "://" may be the last character scanned
        }
        p = str.indexOf("://", next);
    }
}

/*
 *  A JWT, the credential after "Bearer" or "Basic" (shape_len()),
 *  wherever they begin, marked
 */
function mark_shapes(str, marks)
{
    for(let p = 0; p < str.length; p++) {
        const code = str.charCodeAt(p);
        if(code !== 101 && code !== 98 && code !== 66) {   // e b B
            continue;
        }
        const [offset, n] = shape_len(str, p);
        if(n) {
            mark_range(marks, p + offset, p + offset + n);
        }
    }
}

/*
 *  The "name: value" secrets of `str` (a json member, a header, a
 *  label), marked: the name is the word before the ':' since a blank,
 *  a '=' or a ':', judged by its last MASK_MAX_NAME bytes; the value is
 *  colon_value_end()'s. As the C kernel's mark_labels().
 */
function mark_labels(str, marks)
{
    let word = 0;
    let p = 0;
    while(p < str.length) {
        const code = str.charCodeAt(p);
        if(code === 32 || code === 9 || code === 0 || code === 61) {    // blank tab NUL =
            p++;
            word = p;
            continue;
        }
        if(code !== 58) {   // ':'
            p++;
            continue;
        }
        if(!is_param_name_secret(str, word, p, NAMES_NOW)) {
            p++;
            word = p;
            continue;
        }
        let v = p + 1;
        while(v < str.length && (str[v] === " " || str[v] === "\t")) {
            v++;
        }
        const e = colon_value_end(str, v);
        mark_range(marks, v, e);
        const n_scheme = scheme_word_len(str, v);
        if(n_scheme) {
            p = v + n_scheme;   // a scheme taken whole hides no name after it
        } else {
            p = (e > v)? e : p + 1;
        }
        word = p;
    }
}

/*
 *  Does `str` (a command line) carry "attribute=<a secret's name>"?
 *  Then its "value" is that secret (write-attr attribute=password
 *  value=...), judged by the names of `names`. As the C kernel's
 *  inline_value_is_secret().
 */
function inline_value_is_secret(str, names)
{
    let p = str.indexOf("attribute=");
    while(p >= 0) {
        if(p === 0 || str[p-1] === " " || str[p-1] === "\t") {
            let v = p + "attribute=".length;
            if(v < str.length && (str[v] === '"' || str[v] === "'")) {
                v++;
            }
            let e = v;
            while(e < str.length && " \t\"'\u0000".indexOf(str[e]) < 0) {
                e++;
            }
            if(is_secret_name_tail(str, v, e, names)) {
                return true;
            }
        }
        p = str.indexOf("attribute=", p + 1);
    }
    return false;
}

/*
 *  The rules of now of mask_secrets_inline() -- not the readings of
 *  released versions --: what a decoded view of the text is judged by
 *  (mark_decoded_view())
 */
function mark_inline_rules_of_now(str, marks)
{
    const value_is_secret = inline_value_is_secret(str, NAMES_NOW);
    const judged = new Uint8Array(str.length);
    mark_params(str, value_is_secret, READ_NOW, marks, judged);
    mark_query_params(str, marks, judged);
    mark_url_passwords(str, marks);
    mark_shapes(str, marks);
    mark_labels(str, marks);
}

/*
 *  A URL or a query %-encoded inside the value of a parameter
 *  (redirect_uri=, next=, url=: "next=%2Flogin%3Fpassword%3Dx") is read
 *  decoded too: a view of `str` with each %XX of an ASCII character (no
 *  NUL) decoded is judged by the rules of now, and what they mark in it is
 *  marked on the characters it came from, a %XX whole. Decoded
 *  MASK_MAX_DECODINGS times at most -- once, and once more for a value
 *  encoded inside an encoded value ("%253D") --: a bound keeps it linear.
 *  As the C kernel's mark_decoded_view(). The view is built as character
 *  codes and made a string VIEW_CHUNK codes at a time: two strings for
 *  each %XX (up to gobj-js 7.26.25) were enough garbage to bend the time
 *  of a large text, and made it twice as slow ("%25253D": 57 ms for 1 MB,
 *  28 ms now).
 */
const MASK_MAX_DECODINGS = 2;
const VIEW_CHUNK = 8192;     // the arguments of one String.fromCharCode()

function encoded_ascii_at(str, p)
{
    if(p + 3 > str.length || str.charCodeAt(p) !== 37) {   // '%'
        return -1;
    }
    const hi = hex_digit_value(str.charCodeAt(p + 1));
    const lo = (hi >= 0)? hex_digit_value(str.charCodeAt(p + 2)) : -1;
    if(lo < 0) {
        return -1;
    }
    const c = hi*16 + lo;
    return (c > 0 && c < 0x80)? c : -1;
}

function mark_decoded_view(str, marks, decodings)
{
    if(decodings >= MASK_MAX_DECODINGS) {
        return;
    }
    let first = str.indexOf("%");
    while(first >= 0 && encoded_ascii_at(str, first) < 0) {
        first = str.indexOf("%", first + 1);
    }
    if(first < 0) {
        return;     // nothing encoded
    }

    const codes = new Uint16Array(str.length - first);
    let n = 0;
    for(let p = first; p < str.length; p++) {
        const code = str.charCodeAt(p);
        const c = (code === 37)? encoded_ascii_at(str, p) : -1;    // '%'
        if(c >= 0) {
            codes[n++] = c;
            p += 2;
        } else {
            codes[n++] = code;
        }
    }
    const chunks = [str.substring(0, first)];
    for(let k = 0; k < n; k += VIEW_CHUNK) {
        chunks.push(String.fromCharCode.apply(null, codes.subarray(k, Math.min(n, k + VIEW_CHUNK))));
    }
    const view = chunks.join("");

    const view_marks = new Uint8Array(view.length);
    mark_inline_rules_of_now(view, view_marks);
    mark_decoded_view(view, view_marks, decodings + 1);

    let q = 0;
    for(let i = 0; i < view.length; i++) {
        const n_from = (encoded_ascii_at(str, q) >= 0)? 3 : 1;
        if(view_marks[i]) {
            mark_range(marks, q, q + n_from);
        }
        q += n_from;
    }
}

/*
 *  The characters of `str` that mask_secrets_inline() masks, marked: each
 *  rule on the text as it came, and the readings of 7.26.19 and of
 *  7.26.20 whole, each one where it can differ from READ_NOW; and a view
 *  of it decoded (mark_decoded_view()). As the C kernel's
 *  mark_inline_secrets().
 */
function mark_inline_secrets(str, marks)
{
    const value_is_secret = inline_value_is_secret(str, NAMES_NOW);
    const value_is_secret_7_26_9 = inline_value_is_secret(str, NAMES_7_26_9);
    const judged = new Uint8Array(str.length);
    const not_7_26_9 = mark_params(str, value_is_secret, READ_NOW, marks, judged);
    if(not_7_26_9 || value_is_secret !== value_is_secret_7_26_9) {
        mark_params(str, value_is_secret_7_26_9, READ_AS_7_26_9, marks, null);
    }
    if(has_shape_js_7_26_20(str)) {
        mark_params(str, value_is_secret, READ_AS_GOBJ_JS_7_26_20, marks, null);
    }
    mark_query_params(str, marks, judged);
    mark_url_passwords(str, marks);
    mark_shapes(str, marks);
    mark_labels(str, marks);
    mark_decoded_view(str, marks, 0);
}

/************************************************************
 *  A text (a command line) with the secrets that can be told
 *  written as "********" (each run of them as one), the rest as it
 *  is: the value of every "name=value" whose name is a secret's,
 *  quoted or not (and the "value" of a write-attr whose attribute
 *  names a secret) -- the name is the word before the '=', and also
 *  the run of name characters before it, as in a query string; the
 *  same for a "name: value", its name in quotes or not (a json, a
 *  header, a label: "password": x, Authorization: Basic x, bearer:
 *  tok); and a JWT or the credential after "Bearer " or "Basic ",
 *  wherever they are, whatever names them; in a URL or a query
 *  %-encoded inside a value, the same read decoded (mark_decoded_view()).
 *  Each rule judges the text as it came. Return null when there was
 *  nothing to mask. As the C kernel's mask_secrets_inline().
 ************************************************************/
function mask_secrets_inline(str)
{
    if(typeof str !== "string") {
        return null;
    }
    if(str.indexOf("=") < 0 && str.indexOf(":") < 0 && str.indexOf("%") < 0 &&
            str.indexOf("eyJ") < 0 && !/bearer|basic/i.test(str)) {
        return null;    // nothing a secret can begin with
    }
    if(str.length > MASK_MAX_BYTES) {
        return MASK_TOO_LARGE;
    }
    const marks = new Uint8Array(str.length);
    mark_inline_secrets(str, marks);

    let parts = [];
    let changed = false;
    let i = 0;
    while(i < str.length) {
        let j = i;
        if(marks[i]) {
            while(j < str.length && marks[j]) {
                j++;
            }
            parts.push("********");
            changed = true;
        } else {
            while(j < str.length && !marks[j]) {
                j++;
            }
            parts.push(str.substring(i, j));
        }
        i = j;
    }
    return changed? parts.join("") : null;
}

/************************************************************
 *  A json as a log or a trace may show it: at any depth, the
 *  value of a key with a secret's name is "********", whatever
 *  its type (not an absent one, a null or an empty string); so is
 *  the "value" of a dict whose "attribute" names a secret; and a
 *  string, under any key, is masked as mask_secrets_inline() (a
 *  JWT, a "Bearer" token, a secret name=value). Return a masked
 *  copy, or `jn` itself when there was nothing to mask. As the C
 *  kernel's json_mask_secrets().
 *
 *  Only JSON is walked: plain objects (their prototype is
 *  Object.prototype or null) and arrays. Anything else -- a gobj,
 *  a DOM node, a class instance, a typed array, a function -- is
 *  passed as it is, never walked, as trace_json() always showed it
 *  (a kw may carry a gobj: its parent and children make a cycle).
 *  A plain object met twice is masked once, the same everywhere; a
 *  cycle back to one is "<cycle>"; below MASK_MAX_DEPTH levels
 *  (64, as in C) nothing is shown.
 *  It never throws: a failure is the placeholder below.
 ************************************************************/
const MASK_MAX_DEPTH = 64;
const MASK_FAILED = "<not shown: the masking failed>";

function is_plain_object(value)
{
    if(value === null || typeof value !== "object") {
        return false;
    }
    let proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

const MASK_IN_PROGRESS = Symbol("mask-in-progress");

function _json_mask_secrets(jn, memo, depth, budget)
{
    if(typeof jn === "string") {
        if(jn.length > budget.left) {
            budget.left = 0;
            return MASK_TOO_LARGE;      // fails safe: not shown, never in clear
        }
        budget.left -= jn.length;
        /*
         *  A NUL inside is read as a blank, as the C kernel reads it (a peer's
         *  frame carries one): when something is masked, the NULs are shown
         *  as blanks
         */
        let text = (jn.indexOf("\u0000") >= 0)? jn.replace(/\u0000/g, " ") : jn;
        let masked = mask_secrets_inline(text);
        return masked !== null? masked : jn;
    }
    let is_array = Array.isArray(jn);
    if(!is_array && !is_plain_object(jn)) {
        return jn;      // not json: shown as it is, never walked
    }
    if(budget.left <= 0) {
        return MASK_TOO_LARGE;
    }
    if(memo.has(jn)) {
        /*
         *  Seen: a shared object is masked once, the same everywhere; one
         *  still in progress is a cycle back to it
         */
        let seen = memo.get(jn);
        return seen === MASK_IN_PROGRESS? "<cycle>" : seen;
    }
    if(depth >= MASK_MAX_DEPTH) {
        return "<deeper not shown>";
    }
    budget.left -= 1;   // every node costs one, and its key or string bytes
    memo.set(jn, MASK_IN_PROGRESS);

    /*
     *  The result is built as the children are walked: once the budget is
     *  spent the walk STOPS, and one placeholder stands for the rest
     */
    let changed = false;
    let truncated = false;
    let result;
    if(is_array) {
        result = [];
        for(let i=0; i<jn.length; i++) {
            if(budget.left <= 0) {
                truncated = true;
                break;
            }
            budget.left -= 1;
            let shown = _json_mask_secrets(jn[i], memo, depth+1, budget);
            if(shown !== jn[i]) {
                changed = true;
            }
            result.push(shown);
        }
        if(truncated) {
            result.push(MASK_TOO_LARGE);
        }
    } else {
        result = Object.create(Object.getPrototypeOf(jn));
        let value_is_secret = false;
        if(typeof jn.attribute === "string") {
            let nul = jn.attribute.indexOf("\u0000");     // C reads it up to a NUL
            let attribute = (nul >= 0)? jn.attribute.substring(0, nul) : jn.attribute;
            value_is_secret = is_secret_name_tail(attribute, 0, attribute.length, NAMES_NOW);
        }
        for(const key in jn) {
            if(!Object.prototype.hasOwnProperty.call(jn, key)) {
                continue;
            }
            if(budget.left <= 0) {
                truncated = true;
                break;
            }
            budget.left -= 1 + key.length;
            let value = jn[key];
            let shown;
            let secret = is_secret_name_tail(key, 0, key.length, NAMES_NOW) ||
                (value_is_secret && key === "value");
            if(secret && value !== undefined && value !== null && value !== "") {
                shown = "********";
            } else {
                shown = _json_mask_secrets(value, memo, depth+1, budget);
            }
            if(shown !== value) {
                changed = true;
            }
            set_own_key(result, key, shown);
        }
        if(truncated) {
            result["<more>"] = MASK_TOO_LARGE;
        }
    }
    if(!changed && !truncated) {
        result = jn;
    }
    memo.set(jn, result);
    return result;
}

function json_mask_secrets(jn)
{
    try {
        return _json_mask_secrets(jn, new WeakMap(), 0, {left: MASK_MAX_BYTES});
    } catch(e) {
        return MASK_FAILED;     // a trace or a log never throws for its masking
    }
}

/************************************************************
 *  trace_json() of a json that can hold a credential: what
 *  json_mask_secrets() masks is shown masked
 ************************************************************/
function trace_json_masked(jn, msg)
{
    trace_json(json_mask_secrets(jn), msg);     // json_mask_secrets() never throws
}

/************************************************************
 *  Duplicate an object (new references)
 *  using the modern structuredClone (Deep copy of a single object)
 ************************************************************/
function json_deep_copy(obj) // old __duplicate__,
{
    return structuredClone(obj); // jshint ignore:line
}

/************************************************************
 *  Duplicate objects (new references) in a new object
 *  using the modern structuredClone
 ************************************************************/
function duplicate_objects(...sourceObjects)
{
    const result = {};
    for (const obj of sourceObjects) {
        const clonedObj = structuredClone(obj); // jshint ignore:line
        json_object_update(result, clonedObj); // own keys, never the __proto__ setter
    }
    return result;
}

/************************************************************
 *
 ************************************************************/
function json_is_identical(kw1, kw2)
{
    if(kw1 === kw2) {
        return true;
    }
    if(kw1 === null || kw2 === null) {
        return kw1 === kw2;
    }
    if(typeof kw1 !== typeof kw2) {
        return false;
    }
    if(Array.isArray(kw1) !== Array.isArray(kw2)) {
        return false;
    }
    if(Array.isArray(kw1)) {
        if(kw1.length !== kw2.length) {
            return false;
        }
        for(let i = 0; i < kw1.length; i++) {
            if(!json_is_identical(kw1[i], kw2[i])) {
                return false;
            }
        }
        return true;
    }
    if(typeof kw1 === "object") {
        let keys1 = Object.keys(kw1).sort();
        let keys2 = Object.keys(kw2).sort();
        if(keys1.length !== keys2.length) {
            return false;
        }
        for(let i = 0; i < keys1.length; i++) {
            if(keys1[i] !== keys2[i]) {
                return false;
            }
            if(!json_is_identical(kw1[keys1[i]], kw2[keys2[i]])) {
                return false;
            }
        }
        return true;
    }
    return kw1 === kw2;
}

/************************************************************
 *  Extend a dict with another dict (NOT recursive),
 *  adding new keys and overwriting existing keys.
 ************************************************************/
function json_object_update(destination, source) // old __extend_dict__
{
    if(!source) {
        return destination;
    }
    for (let property of Object.keys(source)) {
        set_own_key(destination, property, source[property]);
    }
    return destination;
}

/************************************************************
 *  Update a dict with another dict:
 *  ONLY existing items!! (NOT recursive)
 ************************************************************/
function json_object_update_existing(destination, source) // old __update_dict__
{
    if(!source) {
        return destination;
    }
    for (let property in source) {
        if(Object.prototype.hasOwnProperty.call(source, property) && Object.prototype.hasOwnProperty.call(destination, property)) {
            set_own_key(destination, property, source[property]);
        }
    }
    return destination;
}

/************************************************************
 *  Update a dict with another dict:
 *  ONLY missing items!! (NOT recursive)
 ************************************************************/
function json_object_update_missing(destination, source)
{
    if(!source) {
        return destination;
    }
    for (let property in source) {
        if(Object.prototype.hasOwnProperty.call(source, property) && !Object.prototype.hasOwnProperty.call(destination, property)) {
            set_own_key(destination, property, source[property]);
        }
    }
    return destination;
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_object_get(o, key)
{
    if(o && Object.prototype.hasOwnProperty.call(o, key)) {
        return o[key];
    }
    return undefined;
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_object_del(o, k)
{
    if(o && Object.prototype.hasOwnProperty.call(o, k)) {
        delete o[k];
    }
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_object_set(o, k, v)
{
    set_own_key(o, k, v);
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_object_set_new(o, k, v)
{
    set_own_key(o, k, v);
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_array_get(a, i)
{
    if(!is_array(a)) {
        return undefined;
    }
    return a[i];
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_array_append(a, v)
{
    a.push(v);
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_array_append_new(a, v)
{
    a.push(v);
}

/************************************************************
 *  Simulate jansson function
 ************************************************************/
function json_array_remove(a, idx)
{
    a.splice(idx, 1);
}

/************************************************************
 *  Extend array
 ************************************************************/
function json_array_extend(destination, source)  // old  __extend_list__
{
    if(!source) {
        return destination;
    }
    Array.prototype.push.apply(destination, source);
    return destination;
}

/************************************************************
 *
 ************************************************************/
function json_object_size(a)
{
    if(is_object(a)) {
        return Object.keys(a).length;
    }
    return 0;
}

/************************************************************
 *
 ************************************************************/
function json_array_size(a)
{
    if(is_array(a)) {
        return a.length;
    }
    return 0;
}

/************************************************************
 *  How much content a json carries: elements of a container,
 *  1 for a non-empty string, 0 for everything else
 *  (null/undefined, scalars). C twin: json_size() in helpers.h.
 ************************************************************/
function json_size(a)
{
    if(is_object(a)) {
        return Object.keys(a).length;
    } else if(is_array(a)) {
        return a.length;
    } else if(is_string(a) && a.length > 0) {
        return 1;
    } else {
        return 0;
    }
}

/************************************************************
 *  "There is nothing usable here": null/undefined, {}, [],
 *  "" and any scalar. C twin: empty_json() in helpers.h,
 *  where it is the guard to write instead of `if(!jn)` --
 *  there an absent DTP_JSON is json_null(), a valid pointer.
 *  Here `if(!x)` happens to work, and that difference is what
 *  a port across the two runtimes gets wrong: write the same
 *  question in both.
 *
 *  The other question -- "absent or explicitly null", C's
 *  json_absent() -- is is_null() here, since javascript has
 *  no second null to tell apart.
 ************************************************************/
function empty_json(a)
{
    return json_size(a) === 0;
}

/************************************************************
 *  json_equal (like jansson library)
 *  Returns 1 if value1 and value2 are equal.
 *  Returns 0 if they are unequal
 ************************************************************/
function json_equal(json1, json2)
{
    if (!json1 || !json2) {
        return 0;
    }

    if (json_typeof(json1) !== json_typeof(json2)) {
        return 0;
    }

    /* this covers true, false and null as they are singletons */
    if (json1 === json2) {
        return 1;
    }

    switch (json_typeof(json1)) {
        case json_type.JSON_OBJECT:
            return json_object_equal(json1, json2);
        case json_type.JSON_ARRAY:
            return json_array_equal(json1, json2);
        case json_type.JSON_STRING:
            return json_string_equal(json1, json2);
        case json_type.JSON_INTEGER:
            return json_integer_equal(json1, json2);
        case json_type.JSON_REAL:
            return json_real_equal(json1, json2);
        default:
            return 0;
    }
}

function json_object_equal(object1, object2) {
    let value2;

    if (json_object_size(object1) !== json_object_size(object2)) {
        return 0;
    }

    //json_object_foreach((json_t *)object1, key, value1) {
    for (const [key, value1] of Object.entries(object1)) {
        value2 = json_object_get(object2, key);

        if (!json_equal(value1, value2)) {
            return 0;
        }
    }

    return 1;
}

function json_array_equal(array1, array2) {
    let i, size;

    size = json_array_size(array1);
    if (size !== json_array_size(array2)) {
        return 0;
    }

    for (i = 0; i < size; i++) {
        let value1, value2;

        value1 = json_array_get(array1, i);
        value2 = json_array_get(array2, i);

        if (!json_equal(value1, value2)) {
            return 0;
        }
    }

    return 1;
}

function json_string_equal(string1, string2) {
    return string1 === string2?1:0;
}

function json_integer_equal(integer1, integer2) {
    return integer1 === integer2?1:0;
}

function json_real_equal(real1, real2) {
    return real1 === real2?1:0;
}

function json_typeof(jn)
{
    if(is_object(jn)) {
        return json_type.JSON_OBJECT;
    }
    if(is_array(jn)) {
        return json_type.JSON_ARRAY;
    }
    if(is_string(jn)) {
        return json_type.JSON_STRING;
    }
    if(is_pure_number(jn)) {
        return json_type.JSON_INTEGER;
    }
    if(is_number(jn)) {
        return json_type.JSON_REAL;
    }
    if(is_boolean(jn)) {
        if(Boolean(jn)===true) {
            return json_type.JSON_TRUE;
        } else {
            return json_type.JSON_FALSE;
        }
    }
    if(is_null(jn)) {
        return json_type.JSON_NULL;
    }

    log_error(`Not a json type`);
    return 0;
}

/************************************************************
 *  Return if a value is an object (excluding arrays & null)
 ************************************************************/
function is_object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/************************************************************
 *  Return if a value is an array
 ************************************************************/
function is_array(value) {
    return Array.isArray(value);
}

/************************************************************
 *  Return if a value is a string
 ************************************************************/
function is_string(value) {
    return typeof value === "string";
}

/************************************************************
 *  Return if a value is a number (excluding NaN & Infinity)
 ************************************************************/
function is_number(value) {
    return typeof value === "number" && Number.isFinite(value);
}

/************************************************************
 *  Return if a value is a boolean
 ************************************************************/
function is_boolean(value) {
    return typeof value === "boolean";
}

/************************************************************
 *  Return if a value is null or undefined
 ************************************************************/
function is_null(value) {
    return value == null;  // Covers both `null` and `undefined`
}

/************************************************************
 *  Check if a string is a number
 *  The function correctly identifies both integer and floating-point numbers.
 *  It handles special cases like scientific notation (e.g., "1.2e3"),
 *  positive/negative numbers, and fractional numbers without leading digits.
 *  It returns false for non-numeric strings, empty strings,
 *  and strings with only whitespace.
 ************************************************************/
function is_pure_number(str)
{
    if(is_number(str)) {
        return true;
    }
    if(!is_string(str)) {
        return false;
    }

    // Convert the string to a number
    const num = Number(str);

    // Check if the result is NaN (Not-a-Number)
    if (isNaN(num)) {
        return false; // The string is not a number
    }

    // Optionally, you can check if the input is exactly equal to the parsed number
    // This ensures that the input is a valid number string
    return str.trim() !== '' && !isNaN(num);
}

/************************************************************
 *  Return if a value is a Date object
 ************************************************************/
function is_date(value) {
    return value instanceof Date && !isNaN(value);
}

/************************************************************
 *  Return if a value is a function
 ************************************************************/
function is_function(value) {
    return typeof value === "function";
}

/************************************************************
 *  Return if a value is an instance of GObj
 ************************************************************/
function is_gobj(value) {
    return value instanceof GObj;
}

/************************************************************
 *  Return if a value is an empty string or not a string
 ************************************************************/
function empty_string(value) {
    return !is_string(value) || value.length === 0;
}

/*
 * Converts a string to a bool.
 *
 * This conversion will:
 *
 *  - match 'true', 'on', or '1' as true.
 *  - ignore all white-space padding
 *  - ignore capitalization (case).
 *
 * '  tRue  ','ON', and '1   ' will all evaluate as true.
 *
 */
function parseBoolean(s)
{
    if(is_number(s)) {
        return Boolean(s);
    }

    // will match one and only one of the string 'true','1', or 'on' rerardless
    // of capitalization and regardless off surrounding white-space.
    //
    let regex=/^\s*(true|1|on)\s*$/i;

    return regex.test(s);
}

/************************************************************
 *      Like C functions
 ************************************************************/
function strncmp(str1, str2, lgth)
{
    // Binary safe string comparison
    //
    // version: 909.322
    // discuss at: http://phpjs.org/functions/strncmp
    // +      original by: Waldo Malqui Silva
    // +         input by: Steve Hilder
    // +      improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +       revised by: gorthaur
    // + reimplemented by: Brett Zamir (http://brett-zamir.me)
    // *     example 1: strncmp("aaa", "aab", 2);
    // *     returns 1: 0
    // *     example 2: strncmp("aaa", "aab", 3 );
    // *     returns 2: -1
    var s1 = (str1+"").substring(0, lgth);
    var s2 = (str2+"").substring(0, lgth);

    return ( ( s1 === s2 ) ? 0 : ( ( s1 > s2 ) ? 1 : -1 ) );
}

/************************************************************
 *
 ************************************************************/
function strcmp(str1, str2)
{
    // http://kevin.vanzonneveld.net
    // +   original by: Waldo Malqui Silva
    // +      input by: Steve Hilder
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +    revised by: gorthaur
    // *     example 1: strcmp( "waldo", "owald" );
    // *     returns 1: 1
    // *     example 2: strcmp( "owald", "waldo" );
    // *     returns 2: -1

    return ( ( str1 === str2 ) ? 0 : ( ( str1 > str2 ) ? 1 : -1 ) );
}

/************************************************************
 *
 ************************************************************/
function strcasecmp(str1, str2)
{
    // http://kevin.vanzonneveld.net
    // +   original by: Waldo Malqui Silva
    // +      input by: Steve Hilder
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +    revised by: gorthaur
    // *     example 1: strcmp( "waldo", "owald" );
    // *     returns 1: 1
    // *     example 2: strcmp( "owald", "waldo" );
    // *     returns 2: -1
    let s1 = str1.toLowerCase();
    let s2 = str2.toLowerCase();

    return ( ( s1 === s2 ) ? 0 : ( ( s1 > s2 ) ? 1 : -1 ) );
}

/***************************************************************************
    Only compare str/int/real/bool items
    Complex types are done as matched
    Return lower, iqual, higher (-1, 0, 1), like strcmp
***************************************************************************/
function cmp_two_simple_json(jn_var1, jn_var2)
{
    /*
     *  Discard complex types, done as matched
     */
    if(is_object(jn_var1) ||
            is_object(jn_var2) ||
            is_array(jn_var1) ||
            is_array(jn_var2)) {
        return 0;
    }

    /*
     *  First try number
     */
    if(is_number(jn_var1) || is_number(jn_var2)) {
        /*  A string that is not a number reads 0, as jn2integer()/jn2real()
         *  do in C: NaN compares neither lower nor higher, so it was "equal"
         *  to every number and {n: 5} matched {n: "abc"}. */
        let val1 = Number(jn_var1);
        let val2 = Number(jn_var2);
        if(Number.isNaN(val1)) {
            val1 = 0;
        }
        if(Number.isNaN(val2)) {
            val2 = 0;
        }
        if(val1 > val2) {
            return 1;
        } else if(val1 < val2) {
            return -1;
        } else {
            return 0;
        }
    }

    /*
     *  Try boolean
     */
    if(is_boolean(jn_var1) || is_boolean(jn_var2)) {
        let val1 = Number(jn_var1);
        let val2 = Number(jn_var2);
        if(val1 > val2) {
            return 1;
        } else if(val1 < val2) {
            return -1;
        } else {
            return 0;
        }
    }

    /*
     *  Try string
     */
    let val1 = String(jn_var1);
    let val2 = String(jn_var2);
    return strcmp(val1, val2);
}

/************************************************************
 *
 ************************************************************/
function strstr(haystack, needle, bool)
{
    // Finds first occurrence of a string within another
    //
    // version: 1103.1210
    // discuss at: http://phpjs.org/functions/strstr
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   bugfixed by: Onno Marsman
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // *     example 1: strstr(‘Kevin van Zonneveld’, ‘van’);
    // *     returns 1: ‘van Zonneveld’
    // *     example 2: strstr(‘Kevin van Zonneveld’, ‘van’, true);
    // *     returns 2: ‘Kevin ‘
    // *     example 3: strstr(‘name@example.com’, ‘@’);
    // *     returns 3: ‘@example.com’
    // *     example 4: strstr(‘name@example.com’, ‘@’, true);
    // *     returns 4: ‘name’
    var pos = 0;

    haystack += "";
    pos = haystack.indexOf(needle);
    if (pos === -1) {
        return false;
    } else {
        if (bool) {
            return haystack.substring(0, pos);
        } else {
            return haystack.slice(pos);
        }
    }
}

/***************************************************************************
 *  Metadata key (variable) has a prefix of 2 underscore
 ***************************************************************************/
function is_metadata_key(key)
{
    if(!is_string(key)) {
        return false;
    }
    let i;
    for(i = 0; i < key.length; i++) {
        if (key[i] !== '_') {
            break;
        }
        if(i > 2) {
            break;
        }
    }
    return (i === 2);
}

/***************************************************************************
 *  Private key (variable) has a prefix of 1 underscore
 ***************************************************************************/
function is_private_key(key)
{
    if(!is_string(key)) {
        return false;
    }
    let i;
    for(i = 0; i < key.length; i++) {
        if (key[i] !== '_') {
            break;
        }
        if(i > 2) {
            break;
        }
    }
    return (i === 1);
}

/************************************************************
 * Remove from `kw1` all keys in `kw2`.
 * `kw2` can be a string, object, or array.
 ************************************************************/
function kw_pop(kw1, kw2)
{
    if (typeof kw2 === "object" && !Array.isArray(kw2)) {
        // If kw2 is an object, remove its keys from kw1
        for (const key of Object.keys(kw2)) {
            delete kw1[key];
        }
    } else if (Array.isArray(kw2)) {
        // If kw2 is an array, recursively remove each element from kw1
        for (const item of kw2) {
            kw_pop(kw1, item);
        }
    } else if (typeof kw2 === "string") {
        // If kw2 is a string, remove it as a key from kw1
        delete kw1[kw2];
    }
}

/************************************************************
 *
 ************************************************************/
function kw_has_key(kw, key)
{
    if(key in kw) {
        if (Object.prototype.hasOwnProperty.call(kw, key)) {
            return true;
        }
    }
    return false;
}

/************************************************************
 *  A key that reaches the prototype chain instead of the data:
 *  any key the object does not hold as its OWN key. A walk through one of them
 *  read, or WROTE, Object.prototype: the flat id
 *  "__proto__`polluted" set a key on every object of the page.
 *  In C they are keys like any other, so here too: read them
 *  only as own keys, and write "__proto__" as an own key.
 ************************************************************/
function is_prototype_segment(obj, key)
{
    /*  ANY key the object does not own: "__proto__" and "constructor",
     *  but also "toString" or "valueOf", which a plain object answers
     *  with an inherited function.  */
    return !Object.prototype.hasOwnProperty.call(obj, key);
}

function set_own_key(obj, key, value)
{
    if(key === "__proto__") {
        Object.defineProperty(obj, key, {
            value: value, writable: true, enumerable: true, configurable: true
        });
    } else {
        obj[key] = value;
    }
}

/************************************************************
 *  The value at `path` (keys joined by a backtick), as the C
 *  kw_find_path() finds it: undefined when it is not there.
 *  A kw that is not a dict or a list is LOGGED ("kw must be list
 *  or dict") and answers undefined, as C answers NULL; so does a
 *  segment in the middle of the path whose value is a scalar. A
 *  middle segment that is absent or null answers undefined, logged
 *  only when `verbose`. Before gobj-js 7.25.6 a bad kw answered 0,
 *  which the typed readers took for a value found (kw_get_int() and
 *  kw_get_real() answered 0 instead of the default, kw_get_str() and
 *  kw_get_bool() logged a second line), the log named no path and
 *  called gobj_short_name() on a null gobj ("gobj bad type"), and a
 *  null middle segment threw a TypeError.
 ************************************************************/
/*
 *  A segment of a path that walks a LIST is an index: digits only (read
 *  as C's atoi() reads them) and inside the list. -1 when it is not one.
 *  "length" is an own key of a javascript array, but it is not an item.
 */
function list_segment_index(list, seg)
{
    if(!/^[0-9]+$/.test(seg)) {
        return -1;
    }
    const idx = Number(seg);
    if(idx >= list.length) {
        return -1;
    }
    return idx;
}

function kw_find_path(gobj, kw, path, verbose)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    const prefix = gobj? `${gobj_short_name(gobj)}: ` : "";

    if(!(is_object(kw) || is_array(kw))) {
        log_error(`${prefix}kw must be list or dict: '${String(path)}'`);
        return undefined;
    }
    if(!is_string(path)) {
        log_error(`${prefix}path must be a string: ${String(path)}`);
        return undefined;
    }
    let ss = path.split('`');
    let len = ss.length;
    for(let i=0; i<len; i++) {
        if(is_array(kw)) {
            const idx = list_segment_index(kw, ss[i]);
            if(idx < 0) {
                if(verbose) {
                    log_error(`${prefix}path not found: '${path}'`);
                }
                return undefined;
            }
            ss[i] = String(idx);
        }
        if(is_prototype_segment(kw, ss[i])) {
            if(verbose) {
                log_error(`${prefix}path not found: '${path}'`);
            }
            return undefined;
        }
        if(i === len-1) {
            break;
        }
        kw = kw[ss[i]];
        if(kw === undefined || kw === null) {
            if(verbose) {
                log_error(`${prefix}path not found: '${path}'`);
            }
            return undefined;
        }
        if(!(is_object(kw) || is_array(kw))) {
            log_error(`${prefix}kw must be list or dict: '${path}'`);
            return undefined;
        }
    }
    let value = kw[ss[len-1]];
    if(value === undefined && verbose) {
        log_error(`${prefix}path not found: '${path}'`);
    }
    return value;
}

/************************************************************
 *
 ************************************************************/
function strrchr_split(str, char)
{
    let index = str.lastIndexOf(char);
    if(index === -1) {
        return [str, ""]; // If char is not found, return whole string as first part and empty second part
    }
    return [str.substring(0, index), str.substring(index + 1)];
}

/************************************************************
 *
 ************************************************************/
function kw_delete(gobj, kw, path)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    /*
     *  As C: only a key of a dict is deleted, and a path that is not
     *  there is an error (-1, logged). A delete of "length" threw a
     *  TypeError here, and a missing key or parent answered 0 in silence.
     */
    const prefix = gobj ? gobj_short_name(gobj) + ": " : "";
    if(!is_string(path)) {
        log_error(`${prefix}kw_delete(): path must be a string: ${String(path)}`);
        return -1;
    }
    let [path_, k] = strrchr_split(path, '`');
    let v = kw;
    if(!empty_string(k)) {
        v = kw_find_path(gobj, kw, path_, true);
        if(v === undefined) {
            return -1;      // Error already logged
        }
    } else {
        k = path;
    }
    if(is_array(v)) {
        log_error(`${prefix}kw_delete(): cannot delete an item of a list: '${path}'`);
        return -1;
    }
    if(!is_object(v) || !Object.prototype.hasOwnProperty.call(v, k)) {
        log_error(`${prefix}kw_delete(): path not found: '${path}'`);
        return -1;
    }
    delete v[k];
    return 0;
}

/************************************************************
 *  As the C kw_get_bool(): a boolean found is the answer, and
 *  anything else gives the default back, LOGGED ("path MUST BE a
 *  json boolean", required or not) -- unless KW_WILD_NUMBER asks
 *  to read a number (0 is false), a string ("true"/"false" in any
 *  case, else its decimal integer as atoi() reads it: "0x1F" is 0,
 *  so false) or null (false); a list or a dict is then false,
 *  logged too. Before gobj-js 7.25.2 the value went through
 *  Boolean(), so "false" was TRUE; before 7.25.3 a value of the
 *  wrong type gave the default back in silence; before 7.25.5 the
 *  string went through parseInt() with no base, which reads hex:
 *  "0x1F" was TRUE.
 ************************************************************/
function kw_get_bool(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    let b = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);
    const wild = flag && (flag & kw_flag_t.KW_WILD_NUMBER);

    if(b === undefined) {
        if(create && kw) {
            let v = Boolean(default_value);
            kw_set_dict_value(gobj, kw, path, v);
            return v;

        } else if(required) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return Boolean(default_value);
    }

    let value;
    if(is_boolean(b)) {
        value = b;
    } else if(wild && is_number(b)) {
        value = (b !== 0);
    } else if(wild && is_string(b)) {
        if(b.toLowerCase() === "true") {
            value = true;
        } else if(b.toLowerCase() === "false") {
            value = false;
        } else {
            value = (parseInt(b, 10) || 0) !== 0;
        }
    } else if(wild && b === null) {
        value = false;
    } else if(wild) {
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `path MUST BE a simple json element: '${path}'`);
        trace_json_masked(kw);
        return false;
    } else {
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `path MUST BE a json boolean: '${path}'`);
        trace_json_masked(kw);
        return Boolean(default_value);
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }
    return value;
}

/************************************************************
 *  The integer at the start of a string, as C's strtoll(s, 0, 0)
 *  reads it: leading spaces, a sign, then "0x" for hex, "0" for
 *  octal, else decimal, up to the first character that is not a
 *  digit of that base. 0 when there is no digit.
 ************************************************************/
function strtoll_base0(s)
{
    const m = /^\s*([+-]?)(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)/.exec(s);
    if(!m) {
        return 0;
    }
    let digits = m[2];
    let value;
    if(digits.length > 1 && (digits[1] === "x" || digits[1] === "X")) {
        value = parseInt(digits.substring(2), 16);
    } else if(digits[0] === "0") {
        value = parseInt(digits, 8);
    } else {
        value = parseInt(digits, 10);
    }
    return (m[1] === "-")? -value : value;
}

/************************************************************
 *  As the C kw_get_int(): a number found is the answer,
 *  truncated toward zero as C casts a real, and anything else
 *  gives the default back (as an integer), LOGGED ("path MUST BE
 *  a json integer", required or not) -- unless KW_WILD_NUMBER
 *  asks to read a boolean (1/0), a string (as strtoll() with base
 *  0: "0x1F" is 31, "017" is 15, "12abc" is 12, "abc" is 0) or
 *  null (0); a list or a dict is then 0, logged too. KW_EXTRACT
 *  takes out only a value the reader answers with.
 *  Before gobj-js 7.25.4 KW_EXTRACT deleted the value before its
 *  type was looked at, a value of another type was logged only
 *  with KW_REQUIRED, KW_WILD_NUMBER was ignored, and a number went
 *  through parseInt(), which reads it as a string: 1e-7 gave 1.
 ************************************************************/
function kw_get_int(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    let v = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);
    const wild = flag && (flag & kw_flag_t.KW_WILD_NUMBER);

    if(v === undefined) {
        if(create && kw) {
            let v = parseInt(default_value);
            kw_set_dict_value(gobj, kw, path, v);
            return v;

        } else if(required) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return parseInt(default_value);
    }

    let value;
    if(is_number(v)) {
        value = Math.trunc(v);
    } else if(!wild) {
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `path MUST BE a json integer: '${path}'`);
        trace_json_masked(kw);
        return parseInt(default_value);
    } else if(is_boolean(v)) {
        value = v? 1 : 0;
    } else if(is_string(v)) {
        value = strtoll_base0(v);
    } else if(v === null) {
        value = 0;
    } else {
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `path MUST BE a simple json element: '${path}'`);
        trace_json_masked(kw);
        return 0;
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }
    return value;
}

/************************************************************
 *  As the C kw_get_real(): a number found is the answer, and
 *  anything else gives the default back (as a number), LOGGED
 *  ("path MUST BE a json real", required or not) -- unless
 *  KW_WILD_NUMBER asks to read a boolean (1/0), a string (as
 *  parseFloat() reads it, 0 when it does not start with a number)
 *  or null (0); a list or a dict is then 0, logged too.
 *  KW_EXTRACT takes out only a value the reader answers with.
 *  Before gobj-js 7.25.4 KW_EXTRACT deleted the value before its
 *  type was looked at, a value of another type was logged only
 *  with KW_REQUIRED, and KW_WILD_NUMBER was ignored.
 ************************************************************/
function kw_get_real(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    let v = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);
    const wild = flag && (flag & kw_flag_t.KW_WILD_NUMBER);

    if(v === undefined) {
        if(create && kw) {
            let v = Number(default_value);
            kw_set_dict_value(gobj, kw, path, v);
            return v;

        } else if(required) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return Number(default_value);
    }

    let value;
    if(is_number(v)) {
        value = v;
    } else if(!wild) {
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `path MUST BE a json real: '${path}'`);
        trace_json_masked(kw);
        return Number(default_value);
    } else if(is_boolean(v)) {
        value = v? 1 : 0;
    } else if(is_string(v)) {
        value = parseFloat(v);
        if(Number.isNaN(value)) {
            value = 0;
        }
    } else if(v === null) {
        value = 0;
    } else {
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `path MUST BE a simple json element: '${path}'`);
        trace_json_masked(kw);
        return 0;
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }
    return value;
}

/************************************************************
 *  TRUE when the last key of `path` is a key of its dict, whatever
 *  its value: kw_find_path() answers undefined both for a key that
 *  is not there and for one whose value is undefined.
 ************************************************************/
function kw_path_holds_key(kw, path)
{
    let ss = is_string(path)? path.split('`') : [];
    let parent = kw;
    for(let i=0; i<ss.length-1; i++) {
        if(!(is_object(parent) || is_array(parent))) {
            return false;
        }
        parent = parent[ss[i]];
    }
    if(!(is_object(parent) || is_array(parent)) || ss.length === 0) {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(parent, ss[ss.length-1]);
}

/************************************************************
 *  The default comes back AS GIVEN, as in the C kw_get_str()
 *  (`const char *default_value`, where 0 is NULL). Turned into
 *  a string, a default of 0 or null was "0" or "null", which is
 *  TRUE: an `if(value)` on the answer took an absent key for a
 *  present one. KW_CREATE stores a string default, and null for
 *  any other, as C stores json_null() for a NULL default.
 *  KW_EXTRACT takes out only a string (before gobj-js 7.25.4 it
 *  deleted any value, and a value that was not a string was lost).
 *  C refuses to extract a string at all ("Cannot extract a
 *  string": its answer would point into the freed json); a JS
 *  string outlives the kw, so here it is taken out.
 *  A value that is there and is not a string gives the default
 *  back, LOGGED ("path MUST BE a json str", required or not), as
 *  C does; a null value is the key saying "no string" and is not
 *  logged, and KW_REQUIRED logs only a path that is not there at
 *  all. Before gobj-js 7.25.5 a value of another type was logged
 *  only with KW_REQUIRED, and then a null one too.
 ************************************************************/
function kw_get_str(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    let v = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);

    if(v === undefined) {
        if(create && kw) {
            kw_set_dict_value(gobj, kw, path,
                is_string(default_value)? default_value : null);
            return default_value;

        } else if(required && !kw_path_holds_key(kw, path)) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(!is_string(v)) {
        if(v !== null) {
            log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
                `path MUST BE a json str: '${path}'`);
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }

    return v;
}

/************************************************************
 *
 ************************************************************/
function kw_get_pointer(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    let v = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);

    if(v === undefined) {
        if(create) {
            let v = default_value;
            kw_set_dict_value(gobj, kw, path, v);
            return v;

        } else if(required) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }

    return v;
}

/************************************************************
 *  As the C kw_get_dict(): a dict found is the answer, and
 *  anything else gives the default back AS GIVEN (null stays
 *  null). KW_CREATE stores a dict default, never a null one, and
 *  replaces a null at the path; over another type it logs and
 *  gives the default back unwritten (C returns NULL there, SDK
 *  7.26.9). Before gobj-js 7.25.2 the answer went through Object(), so a
 *  null default came back as {} and a 0 as a Number object.
 ************************************************************/
function kw_get_dict(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    let v = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);

    if(v === undefined) {
        if(create && is_object(default_value) && kw) {
            kw_set_dict_value(gobj, kw, path, default_value);
            return default_value;
        }
        if(required) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(!is_object(v)) {
        if(create && v === null && is_object(default_value)) {
            /*  A null is "no value", as in C (SDK 7.26.9): a create
             *  replaces it, as a missing key.  */
            kw_set_dict_value(gobj, kw, path, default_value);
            return default_value;
        }
        if(create && v === null) {
            /*  A null with no dict default: as a missing key, and said
             *  as one only when it is required (as C).  */
            if(required) {
                log_error(`path not found: '${path}'`);
                trace_json_masked(kw);
            }
            return default_value;
        }
        if(required || create) {
            /*  With KW_CREATE the caller means to write inside what it
             *  gets: the default it gets back is held by nobody, so say
             *  it. (C returns NULL here; JS frees nothing, and gives the
             *  default back.)  */
            log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
                `path MUST BE a json dict: '${path}'` +
                (create? ", cannot create" : ""));
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }

    return v;
}

/************************************************************
 *
 ************************************************************/
function kw_get_dict_value(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    let v = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);

    if(v === undefined) {
        if(create) {
            let v = default_value;
            kw_set_dict_value(gobj, kw, path, v);
            return v;

        } else if(required) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }

    return v;
}

/************************************************************
 *  As the C kw_get_list(): a list found is the answer, and
 *  anything else gives the default back AS GIVEN. KW_CREATE
 *  stores a list default, never a null one, and replaces a null
 *  at the path; over another type it logs and gives the default
 *  back unwritten (C returns NULL there, SDK 7.26.9). Before gobj-js
 *  7.25.2 the answer went through Array(), which WRAPS its
 *  argument: a list found came back as [list], a default of []
 *  as [[]] and a null one as [null].
 ************************************************************/
function kw_get_list(gobj, kw, path, default_value, flag)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    let v = kw_find_path(gobj, kw, path, false);

    const required = flag && (flag & kw_flag_t.KW_REQUIRED);
    const create = flag && (flag & kw_flag_t.KW_CREATE);
    const extract = flag && (flag & kw_flag_t.KW_EXTRACT);

    if(v === undefined) {
        if(create && is_array(default_value) && kw) {
            kw_set_dict_value(gobj, kw, path, default_value);
            return default_value;
        }
        if(required) {
            log_error(`path not found: '${path}'`);
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(!is_array(v)) {
        if(create && v === null && is_array(default_value)) {
            /*  A null is "no value", as in C (SDK 7.26.9): a create
             *  replaces it, as a missing key.  */
            kw_set_dict_value(gobj, kw, path, default_value);
            return default_value;
        }
        if(create && v === null) {
            /*  A null with no list default: as a missing key, and said
             *  as one only when it is required (as C).  */
            if(required) {
                log_error(`path not found: '${path}'`);
                trace_json_masked(kw);
            }
            return default_value;
        }
        if(required || create) {
            /*  With KW_CREATE the caller means to write inside what it
             *  gets: the default it gets back is held by nobody, so say
             *  it. (C returns NULL here; JS frees nothing, and gives the
             *  default back.)  */
            log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
                `path MUST BE a json list: '${path}'` +
                (create? ", cannot create" : ""));
            trace_json_masked(kw);
        }
        return default_value;
    }

    if(extract) {
        kw_delete(gobj, kw, path);
    }

    return v;
}

/************************************************************
 *
 ************************************************************/
function kw_set_dict_value(gobj, kw, path, value)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    if(!is_object(kw)) {
        log_error("kw is not an object");
        return -1;
    }
    if(!is_string(path)) {
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `kw_set_dict_value(): path must be a string: ${String(path)}`);
        return -1;
    }
    if(path === "") {
        /*  As C: an empty path names no key (it wrote kw[""]).  */
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `kw_set_dict_value(): path empty`);
        return -1;
    }
    if(path.split('`').includes("")) {
        /*  As C (SDK 7.26.9+): an empty SEGMENT names no key either.
         *  This wrote the key "" ("a`" -> {a: {"": v}}), while C's writer
         *  dropped it and wrote over `a`.  */
        log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
            `kw_set_dict_value(): empty segment in path: '${path}'`);
        return -1;
    }

    let ss = path.split('`');
    let len = ss.length;
    for(let i=0; i<len; i++) {
        let key = ss[i];
        if(is_array(kw)) {
            /*  A list is walked, never grown: the segment is an index
             *  inside it, as C (and as kw_find_path() reads it).  */
            const idx = list_segment_index(kw, key);
            if(idx < 0) {
                log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
                    `kw_set_dict_value(): segment '${key}' is not an index ` +
                    `of its list: '${path}'`);
                return -1;
            }
            key = String(idx);
        }
        if(i === len-1) {
            /* last segment */
            set_own_key(kw, key, value);

        } else {
            let seg = is_prototype_segment(kw, key)? undefined : kw[key];
            if(seg === undefined) {
                set_own_key(kw, key, {});
            } else if(!is_object(seg) && !is_array(seg)) {
                /*  C stops here too (kwid.c, "long path"): nothing can be
                 *  created inside a null or a scalar.  */
                log_error(`${gobj ? gobj_short_name(gobj) + ": " : ""}` +
                    `kw_set_dict_value(): segment '${key}' is not a dict ` +
                    `or a list: '${path}'`);
                return -1;
            }
            kw = kw[key];
        }
    }
    return 0;
}

/************************************************************
 *  Whether walking `path` meets a value that is neither a dict nor
 *  a list BEFORE its last segment: kw_find_path() logs that one
 *  even when it is not verbose, so a writer that goes on to
 *  kw_set_dict_value() would log it a second time.
 ************************************************************/
function path_crosses_a_scalar(kw, path)
{
    let ss = path.split('`');
    let v = kw;
    for(let i=0; i<ss.length-1; i++) {
        if(is_array(v)) {
            const idx = list_segment_index(v, ss[i]);
            if(idx < 0) {
                return false;
            }
            v = v[idx];
        } else {
            v = Object.prototype.hasOwnProperty.call(v, ss[i])? v[ss[i]] : undefined;
        }
        if(v === undefined || v === null) {
            return false;
        }
        if(!(is_object(v) || is_array(v))) {
            return true;
        }
    }
    return false;
}

/************************************************************
 *
 ************************************************************/
function kw_set_subdict_value(gobj, kw, path, key, value)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }

    if(!is_object(kw)) {
        log_error("kw is not an object");
        return -1;
    }

    /*  Not kw_get_dict(KW_CREATE): when the path cannot be written it
     *  hands back its default anyway, and the value went into a dict
     *  that belongs to nobody while this answered 0.  */
    let subdict = kw_find_path(gobj, kw, path, false);
    if(subdict === undefined) {
        if(!is_string(path) || path_crosses_a_scalar(kw, path)) {
            return -1;  // Error already logged, by kw_find_path()
        }
        subdict = {};
        if(kw_set_dict_value(gobj, kw, path, subdict) < 0) {
            return -1;  // Error already logged
        }
    }
    if(!is_object(subdict)) {
        log_error(`subdict is not an object: '${path}'`);
        return -1;
    }
    set_own_key(subdict, key, value);

    return 0;
}

/***************************************************************************
    Match a json dict with a json filter (only compare str/number)
 ***************************************************************************/
function _kw_match_simple(
    kw,         // not owned
    jn_filter,  // owned
    prefix_path
)
{
    let path = "";
    let matched = false;

    if(is_array(jn_filter)) {
        // Empty array evaluate as false, until a match condition occurs.
        matched = false;
        for(let idx = 0; idx < jn_filter.length; idx++) {
            let jn_filter_value = jn_filter[idx];
            /*
             *  Complex variable, recursive
             */
            if(empty_string(prefix_path)) {
                path = sprintf("%s", prefix_path);
            } else {
                path = sprintf("%s`%d", prefix_path, idx);
            }

            matched = _kw_match_simple(
                kw,                 // not owned
                jn_filter_value,    // owned
                path
            );
            if(matched) {
                break;
            }
        }

    } else if(is_object(jn_filter)) {
        // Object evaluate as true, until a NOT match condition occurs.
        matched = true;
        let keys = Object.keys(jn_filter);
        for(let i=0; i<keys.length; i++) {
            let key = keys[i];
            let jn_filter_value = jn_filter[key];
            if(empty_string(prefix_path)) {
                path = sprintf("%s", key);
            } else {
                path = sprintf("%s`%s", prefix_path, key);
            }

            if(is_array(jn_filter_value) || is_object(jn_filter_value)) {
                /*
                 *  Complex variable, recursive
                 */
                matched = _kw_match_simple(
                    kw, // not owned
                    jn_filter_value,  // owned
                    path
                );
                if(!matched) {
                    break;
                }
                continue;
            }

            /*
             *  Get the record value, firstly by path else by name
             */
            // Firstly try the key as pointers
            /*  undefined, not falsy: 0, false and "" are values to compare
             *  (C tests a NULL pointer; a json false is not one). */
            let jn_record_value = kw_get_dict_value(0, kw, path, undefined, 0);
            if(jn_record_value === undefined) {
                // Secondly try the key with points (.) as full key
                jn_record_value = json_object_get(kw, path);
            }
            if(jn_record_value === undefined) {
                matched = false;
                break;
            }

            /*
             *  Do simple operation
             */
            let cmp = cmp_two_simple_json(jn_record_value, jn_filter_value);
            if(cmp!==0) {
                matched = false;
                break;
            }
        }
    }

    return matched;
}

/***************************************************************************
    Match a json dict with a json filter (only compare str/number)
 ***************************************************************************/
function kw_match_simple(
    kw,         // not owned
    jn_filter   // owned
)
{
    if(json_size(jn_filter)===0) {
        // No filter, or an empty object or empty array evaluates as true.
        return true;
    }

    return _kw_match_simple(kw, jn_filter, "");
}

/***************************************************************************
    Get a the idx of simple json item in a json list.
    Return -1 if not found
 ***************************************************************************/
function kw_find_json_in_list(
    gobj,
    kw_list,
    item,
    flag
)
{
    if(!item || !is_array(kw_list)) {
        if(flag) {
            log_error(`item NULL or kw_list is not a list`);
        }
        return -1;
    }

    for(let i=0; i<kw_list.length; i++) {
        let jn_item = kw_list[i];
        if(json_is_identical(item, jn_item)) {
            return i;
        }
    }

    if(flag) {
        log_error(`item not found in this list`);
    }
    return -1;
}

/*************************************************************
    Being `kw` a row's list or list of dicts [{},...],
    return a new list of **duplicated** kw filtering the rows by `jn_filter` (where),
    If match_fn is 0 then kw_match_simple is used.
 *************************************************************/
function kw_select(gobj, kw, jn_filter, match_fn)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    if(!kw) {
        return null;
    }
    if(!match_fn) {
        match_fn = kw_match_simple;
    }
    let kw_new = [];

    if(is_array(kw)) {
        for(let i=0; i<kw.length; i++) {
            let jn_value = kw[i];
            if(match_fn(jn_value, jn_filter)) {
                kw_new.push(json_deep_copy(jn_value));
            }
        }
    } else if(is_object(kw)) {
        if(match_fn(kw, jn_filter)) {
            kw_new.push(json_deep_copy(kw));
        }
    } else {
        log_error("kw_select() BAD kw parameter");
        return null;
    }

    return kw_new;
}

/*************************************************************
    Being `kw` a row's list or list of dicts [{},...],
    return a new list of incref (clone) kw filtering the rows by `jn_filter` (where)
    If match_fn is 0 then kw_match_simple is used.
 *************************************************************/
function kw_collect(gobj, kw, jn_filter, match_fn)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    if(!kw) {
        return null;
    }
    if(!match_fn) {
        match_fn = kw_match_simple;
    }
    let kw_new = [];

    if(is_array(kw)) {
        for(let i=0; i<kw.length; i++) {
            let jn_value = kw[i];
            if(match_fn(jn_value, jn_filter)) {
                kw_new.push(jn_value);
            }
        }
    } else if(is_object(kw)) {
        if(match_fn(kw, jn_filter)) {
            kw_new.push(kw);
        }
    } else {
        log_error("kw_select() BAD kw parameter");
        return null;
    }

    return kw_new;
}

/*************************************************************
    Return a new kw only with the keys got by dict's keys or list's keys (strings).
    Keys:
        "$key"
        ["$key1", "$key2", ...]
        {"$key1":*, "$key2":*, ...}

    It's not a deep copy. A key is a KEY, not a path (as C, SDK 7.26.9).
    If keys are empty return kw
 *************************************************************/
function kw_clone_by_keys(gobj, kw, keys, verbose)    // old filter_dict
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    let kw_clone = {};
    if(is_string(keys) && !empty_string(keys)) {
        let key = keys;
        if(Object.prototype.hasOwnProperty.call(kw, key)) {
            set_own_key(kw_clone, key, kw[key]);
        } else {
            if(verbose) {
                log_error(`${gobj_short_name(gobj)}: key not found: ${key}`);
            }
        }
    } else if(is_object(keys) && json_object_size(keys)>0) {
        for(let key of Object.keys(keys)) {
            if(Object.prototype.hasOwnProperty.call(kw, key)) {
                set_own_key(kw_clone, key, kw[key]);
            } else {
                if(verbose) {
                    log_error(`${gobj_short_name(gobj)}: key not found: ${key}`);
                }
            }
        }
    } else if(is_array(keys) && json_array_size(keys)>0) {
        for(let j=0; j<keys.length; j++) {
            let key = keys[j];
            if(Object.prototype.hasOwnProperty.call(kw, key)) {
                set_own_key(kw_clone, key, kw[key]);
            } else {
                if(verbose) {
                    log_error(`${gobj_short_name(gobj)}: key not found: ${key}`);
                }
            }
        }
    } else {
        return kw;
    }
    return kw_clone;
}

/***************************************************************************
    Return a new kw except the keys got by dict's keys or list's keys (strings).
    Keys:
        "$key"
        ["$key1", "$key2", ...]
        {"$key1":*, "$key2":*, ...}

    It's not a deep copy. A key is a KEY, not a path (as C, SDK 7.26.9).
    If keys are empty return empty
 ***************************************************************************/
function kw_clone_by_not_keys(
    gobj,
    kw,
    keys,
    verbose
)
{
    let kw_clone = {};
    if(!is_object(kw)) {
        return kw_clone;    // nothing to clone (a store with nothing saved)
    }
    json_object_update(kw_clone, kw);

    if(is_string(keys) && !empty_string(keys)) {
        let key = keys;
        if(Object.prototype.hasOwnProperty.call(kw, key)) {      // a saved false/0/"" is a key too
            json_object_del(kw_clone, key);
        } else {
            if(verbose) {
                log_error(`${gobj_short_name(gobj)}: key not found: ${key}`);
            }
        }
    } else if(is_object(keys) && json_object_size(keys)>0) {
        for(let key of Object.keys(keys)) {
            if(Object.prototype.hasOwnProperty.call(kw, key)) {
                json_object_del(kw_clone, key);
            } else {
                if(verbose) {
                    log_error(`${gobj_short_name(gobj)}: key not found: ${key}`);
                }
            }
        }
    } else if(is_array(keys) && json_array_size(keys)>0) {
        for(let j=0; j<keys.length; j++) {
            let key = keys[j];
            if(Object.prototype.hasOwnProperty.call(kw, key)) {
                json_object_del(kw_clone, key);
            } else {
                if(verbose) {
                    log_error(`${gobj_short_name(gobj)}: key not found: ${key}`);
                }
            }
        }
    } else {
        return {};
    }

    return kw_clone;
}

/********************************************
 *  The browser's localStorage, or null when there is none (outside a
 *  browser).
 *
 *  With the site's data blocked (Chrome with cookies blocked, a sandboxed
 *  iframe), READING the window.localStorage property already throws a
 *  SecurityError, not only its getItem(): every app reads its locale at
 *  start, so the app did not start. Such a store is answered as one whose
 *  every call throws that error, so each helper fails as it fails for any
 *  store that refuses it: a read gives the default, a write -1.
 ********************************************/
function local_store()
{
    if (typeof window === "undefined") {
        return null;
    }
    let store;
    try {
        store = window.localStorage;
    } catch (e) {
        const refuse = () => {
            throw e;
        };
        return {getItem: refuse, setItem: refuse, removeItem: refuse};
    }
    return store || null;
}

/********************************************
 *  A failure of the store that would repeat on every read is warned
 *  once per key, until a read of the key goes well again.
 ********************************************/
const local_storage_warned = new Set();

function warn_local_storage_once(key, msg)
{
    if (local_storage_warned.has(key)) {
        return;
    }
    local_storage_warned.add(key);
    log_warning(msg);
}

/********************************************
 *  Get a local attribute
 *
 *  The json the entry holds, or `default_value` when there is none
 *  (written there too with `create`). A json null is no value, as
 *  json_absent() in C: the default. An entry that is not json (a
 *  corrupt or foreign write) is a WARNING and is REMOVED, so the
 *  next read finds no entry: it used to console.warn on every read,
 *  for ever; a new corrupt entry is a new WARNING. Its text is never
 *  shown (JSON.parse() quotes it in its error, and an entry can hold a
 *  token). A store that cannot be read (blocked) is warned once per
 *  key, and the default is NOT written there; one that cannot be
 *  written (full) is warned once per key too: with `create` it was an
 *  ERROR on every read, the default tried again each time. A key is
 *  warned again after a read that goes well. Outside a browser: the
 *  default.
 ********************************************/
function kw_get_local_storage_value(key, default_value, create = false)
{
    const store = local_store();
    if (!store) {
        return default_value; // No store outside the browser
    }
    const where = `kw_get_local_storage_value(): localStorage key "${key}"`;

    let text;
    try {
        text = store.getItem(key);
    } catch (e) {
        warn_local_storage_once(key, `${where} cannot be read (storage blocked?): the default is used`);
        return default_value;
    }

    let went_well = true;
    let value = null;
    if (text !== null) {
        try {
            value = JSON.parse(text);
        } catch (e) {
            value = null;
            try {
                store.removeItem(key);
                log_warning(`${where} does not hold json: removed, the default is used`);
            } catch (e2) {
                went_well = false;
                warn_local_storage_once(key,
                    `${where} does not hold json and cannot be removed: the default is used`);
            }
        }
    }

    if (value === null) {
        value = default_value;
        if (create) {
            const default_text = json_text_of(default_value);
            if (default_text === undefined) {
                log_error(`${where}: cannot write the default: a value with no json text`);
            } else {
                try {
                    store.setItem(key, default_text);
                } catch (e) {
                    went_well = false;
                    warn_local_storage_once(key,
                        `${where} cannot be written (storage full or blocked?): the default is used, not kept`);
                }
            }
        }
    }
    if (went_well) {
        local_storage_warned.delete(key);   // the next failure is news
    }
    return value;
}

/********************************************
 *  Save a local attribute
 *
 *  Returns 0 on success, -1 when the value did NOT reach the store.
 *  It used to return nothing and only console.warn, so every caller up the
 *  chain (db_save_persistent_attrs -> gobj_save_persistent_attrs -> the app)
 *  reported success on a store that had rejected the write: a full or blocked
 *  localStorage (quota, private mode) silently discarded the change while the
 *  UI showed it as saved.
 *
 *  A value with no json text is refused with an ERROR, as a typed writer
 *  refuses it (json_text_of()): a function was stored as the text
 *  "undefined", and a NaN, a Date or a Map as a text that reads back as
 *  another value. Checked in Node.js too, where there is no store.
 ********************************************/
function kw_set_local_storage_value(key, value)
{
    if (!key) {
        log_error(`kw_set_local_storage_value(): invalid key: key=${key}`);
        return -1;
    }
    const text = json_text_of(value);
    if (text === undefined) {
        log_error(`kw_set_local_storage_value(): cannot save "${key}": a value with no json text`);
        return -1;
    }

    const store = local_store();
    if (!store) {
        return 0; // No store outside the browser: not a failure
    }
    try {
        store.setItem(key, text);
        return 0;
    } catch (e) {
        log_error(`kw_set_local_storage_value(): cannot save "${key}" ` +
            `(storage full or blocked?): ${e && e.message ? e.message : e}`);
        return -1;
    }
}

/********************************************
 *  Remove local attribute
 ********************************************/
function kw_remove_local_storage_value(key)
{
    const store = local_store();
    if (!store) {
        return; // No store outside the browser
    }
    if (!key) {
        log_error(`kw_remove_local_storage_value(): invalid key: key=${key}`);
        return;
    }

    try {
        store.removeItem(key);
    } catch (e) {
        log_warning(`kw_remove_local_storage_value(): cannot remove "${key}" ` +
            `(storage blocked?): ${e && e.message ? e.message : e}`);
    }
}

/*************************************************************
    Utility for databases.
    Return true if `id` is in the list/dict/str `ids`
 *************************************************************/
function kwid_match_id(ids, id)
{
    if(is_null(ids) || is_null(id)) {
        // No filter: everything passes.
        return true;
    }

    if(is_array(ids)) {
        if(ids.length===0) {
            // An empty list at the first level evaluates as true.
            return true;
        }
        for(let i=0; i<ids.length; i++) {
            let value = ids[i];
            if(value === id) {
                return true;
            }
        }

    } else if(is_object(ids)) {
        if(Object.keys(ids).length===0) {
            // An empty object at the first level evaluates as true.
            return true;
        }
        for(let key in ids) {
            if(key === id) {
                return true;
            }
        }

    } else if(is_string(ids)) {
        if(ids === id) {
            return true;
        }
    }

    return false;
}

/*************************************************************
    Utility for databases.
    Being `kw` a:
        - list of strings [s,...]
        - list of dicts [{},...]
        - dict of dicts {id:{},...}
    return a NEW list holding the rows that match `ids` and the
    `jn_filter` (where). If match_fn is 0 then kw_match_simple is used.

    WARNING the LIST is new; its elements are THE SAME objects, not
    copies. The C twin increfs each one and says "clone", which this
    comment repeated for years: javascript has no refcount, so a write
    through a collected row writes into `kw`. Copy what you mean to
    modify.

    Returns null -- not an empty list -- for a `kw` that is neither a
    list nor a dict, so a caller that reads `.length` off the answer
    must check it first (kwid_find_one_record does).
 *************************************************************/
function kwid_collect(gobj, kw, ids, jn_filter, match_fn)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    if(!kw) {
        return null;
    }
    if(!match_fn) {
        match_fn = kw_match_simple;
    }
    let kw_new = [];

    if(is_array(kw)) {
        for(let i=0; i<kw.length; i++) {
            let jn_value = kw[i];

            let id;
            if(is_object(jn_value)) {
                id = kw_get_str(gobj, jn_value, "id", "", 0);
            } else if(is_string(jn_value)) {
                id = jn_value;
            } else {
                continue;
            }

            if(!kwid_match_id(ids, id)) {
                continue;
            }
            if(match_fn(jn_value, jn_filter)) {
                kw_new.push(jn_value);
            }
        }
    } else if(is_object(kw)) {
        for(let id of Object.keys(kw)) {
            let jn_value = kw[id];

            if(!kwid_match_id(ids, id)) {
                continue;
            }
            if(match_fn(jn_value, jn_filter)) {
                kw_new.push(jn_value);
            }
        }

    } else  {
        log_error("kw_collect() BAD kw parameter");
        return null;
    }

    return kw_new;
}

/*************************************************************
    Utility for databases.
    Return a dict from a "dict of records" or "list of records".
    WARNING the "id" of a dict's record is hardcoded to its key.
    Convention:
        - all arrays are lists of records (dicts) with "id" as primary key
        - delimiter is '`' and '.'
    If path is empty then use kw

    WARNING "new" is the C twin's word, where it means a new REFERENCE:
    handed a dict, both return THAT dict and not a copy of it. Only the
    list case builds something new, and even then the records inside it
    are the same objects.
 *************************************************************/
function kwid_new_dict(gobj, kw, path)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    let new_dict = {};
    if(!empty_string(path)) {
        kw = kw_find_path(gobj, kw, path);
    }
    if(is_object(kw)) {
        new_dict = kw;

    } else if(is_array(kw)) {
        for(let i=0; i<kw.length; i++) {
            let kv = kw[i];
            /*  KW_REQUIRED, as the C twin passes: under the rule this
             *  file serves -- the key of a data record is its `id` -- a
             *  record without one is broken, and it used to be dropped
             *  in silence. The dict then came back short, and nothing
             *  said which row had gone or why.  */
            let id = kw_get_str(gobj, kv, "id", "", kw_flag_t.KW_REQUIRED);
            if(!empty_string(id)) {
                set_own_key(new_dict, id, kv);
            }
        }

    } else {
        log_error(`${gobj_short_name(gobj)} kwid_new_dict: data type unknown`);
    }

    return new_dict;
}

/*************************************************************
    Utility for databases.
    Return a list from a "dict of records" or "list of records".
    The NORMALIZING function of this family: whatever shape the data
    arrives in, what comes back is the shape a table indexed and
    sorted by `id` wants.
    Convention:
        - all arrays are lists of records (dicts) with "id" as primary key
        - delimiter is '`' and '.'
    If path is empty then use kw

    WARNING handed a DICT it writes each record's key into the record
    as its `id`, OVERWRITING one that differs -- in the source records,
    which it does not copy. That is the C twin's behaviour
    (`json_object_set_new(v, "id", ...)` in kwid.c) and it is the point:
    a dict keyed by id whose records disagree with their own key is
    exactly what this is for. Handed a LIST it returns that same list,
    untouched, as C returns a new reference to it.
 *************************************************************/
function kwid_new_list(gobj, kw, path)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    if(!empty_string(path)) {
        kw = kw_find_path(gobj, kw, path);
    }

    if(is_array(kw)) {
        return kw;
    }

    if(is_object(kw)) {
        let new_list = [];
        for(let id of Object.keys(kw)) {
            let record = kw[id];
            if(!is_object(record)) {
                log_error(
                    `${gobj_short_name(gobj)} kwid_new_list: ` +
                    `not a record: '${id}'`
                );
                continue;
            }
            record["id"] = id;      // WARNING id hardcoded, as in C
            new_list.push(record);
        }
        return new_list;
    }

    log_error(`${gobj_short_name(gobj)} kwid_new_list: wrong type for list`);
    return [];
}

/*************************************************************
 *  Utility for databases. See kwid_collect parameters
 *************************************************************/
function kwid_find_one_record(gobj, kw, ids, jn_filter, match_fn)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    let list = kwid_collect(gobj, kw, ids, jn_filter, match_fn);
    /*  kwid_collect() answers null -- not an empty list -- for a kw that
     *  is neither a list nor a dict, and for a kw that is missing
     *  altogether. Reading `.length` off that is a TypeError thrown at
     *  the caller, which is how a command answer with no data crashed a
     *  view instead of finding nothing.  */
    if(!list || list.length === 0) {
        return null;
    }
    return list[0];
}

/*************************************************************
    Utility for databases.
    Being `ids` a:

        "$id"

        {
            "$id": {
                "id": "$id",
                ...
            }
            ...
        }

        ["$id", ...]

        [
            "$id",
            {
                "id":$id,
                ...
            },
            ...
        ]

    return a list of all ids
*************************************************************/
function kwid_get_ids(gobj, ids)
{
    if(gobj && !is_gobj(gobj)) {
        log_error(`GObj bad instanceof`);
    }
    if(!ids) {
        return [];
    }

    let new_ids = [];

    if(is_string(ids)) {
        /*
            "$id"
        */
        new_ids.push(ids);
    } else if(is_object(ids)) {
        /*
            {
                "$id": {
                    "id": "$id",
                    ...
                }
                ...
            }
        */
        for(let id in ids) {
            if (Object.prototype.hasOwnProperty.call(ids, id)) {
                new_ids.push(id);
            }
        }
    } else if(is_array(ids)) {
        ids.forEach(function(item) {
            if(is_string(item)) {
                /*
                    ["$id", ...]
                 */
                if(!empty_string(item)) {
                    new_ids.push(item);
                }
            } else if(is_object(item)) {
                /*
                    [
                        {
                            "id":$id,
                            ...
                        },
                        ...
                    ]
                 */
                let id = kw_get_str(gobj, item, "id", 0, 0);
                if(id) {
                    new_ids.push(id);
                }
            }
        });
    }

    return new_ids;
}

/********************************************************
 *  Convert [s] or [{}] or {}
 *  in a webix list options:
 *      [{id:"", value:""}, ...]
 ********************************************************/
function list2options(list, field_id, field_value)
{
    field_id = field_id?field_id:"id";
    field_value = field_value?field_value:"value";

    let options = [];

    if(is_array(list)) {
        for(let i=0; i<list.length; i++) {
            let v = list[i];
            if(is_string(v)) {
                options.push({
                    id: list[i],
                    value: list[i]
                });
            } else if(is_object(v)) {
                let vv = {};
                if(!kw_has_key(v, field_id)) {
                    /* If not exist, then get the first entry */
                    if(json_size(v)>0) {
                        field_id = Object.keys(v)[0];
                    } else {
                        log_error("list2options(): object without field id: " + field_id);
                        continue;
                    }
                    vv["id"] = field_id;
                    vv["value"] = v[field_id];
                } else {
                    if(!kw_has_key(v, field_value)) {
                        /* If not exist, then get the first entry */
                        if(json_size(v)>0) {
                            field_value = Object.keys(v)[0];
                        } else {
                            log_error("list2options(): object without field value: " + field_value);
                            continue;
                        }

                    }
                    vv["id"] = v[field_id];
                    vv["value"] = v[field_value];
                }
                options.push(vv);

            } else {
                log_error("list2options(): case1 not implemented");
            }
        }
    } else if(is_object(list)) {
        for(let k of Object.keys(list)) {
            options.push({
                id: k,
                value: k
            });
        }
    } else {
        log_error("list2options(): case2 not implemented");
    }

    return options;
}

/************************************************************
 *
 ************************************************************/
function id_index_in_obj_list(list, id) {
    if(!list) {
        return -1;
    }
    for(let i=0; i<list.length; i++) {
        if(list[i] && list[i].id === id) {
            return i;
        }
    }
    return -1;
}

/************************************************************
 *
 ************************************************************/
function str_in_list(list, str, ignore_case)
{
    if(!list || !str) {
        log_error("ERROR: str_in_list() list or str empty");
        return false;
    }

    let len = list.length;

    if(ignore_case) {
        str = str.toLowerCase();

        for(let i = 0; i < len; i++) {
            let item = list[i];
            if(item && item.toLowerCase() === str) {
                return true;
            }
        }

    } else {
        for(let i = 0; i < len; i++) {
            if(list[i] === str) {
                return true;
            }
        }
    }

    return false;
}

/************************************************************
 *
 ************************************************************/
function strs_in_list(list, strs, ignore_case)
{
    if(!list) {
        log_error("ERROR: strs_in_list() list empty");
        return false;
    }
    if(!strs) {
        log_error("ERROR: strs_in_list() str empty");
        return false;
    }

    for(let i=0; i<strs.length; i++) {
        let str = strs[i];
        if(str_in_list(list, str, ignore_case)) {
            return true;
        }
    }
    return false;
}

/************************************************************
 *
 ************************************************************/
function delete_from_list(list, elm)
{
    for(let i=0; i<list.length; i++) {
        if(elm === list[i]) {
            list.splice(i, 1);
            return true;
        }
    }
    return false; // elm does not exist!
}

/************************************************************
 *
 ************************************************************/
function msg_iev_read_key(kw, key)
{
    try {
        let __md_iev__ = kw["__md_iev__"];
        if(__md_iev__) {
            return __md_iev__[key];
        }
    } catch (e) {
        return undefined;
    }
    return undefined;
}

/************************************************************
 *
 ************************************************************/
function msg_iev_write_key(kw, key, value)
{
    let __md_iev__ = kw["__md_iev__"];
    if(!__md_iev__) {
        __md_iev__ = {};
        kw["__md_iev__"] = __md_iev__;
    }
    __md_iev__[key] = value;
}

/************************************************************
 *
 ************************************************************/
function msg_iev_push_stack(gobj, kw, stack, jn_data)
{
    if(!is_gobj(gobj)) {
        log_error(`gobj is not a GObj`);
        return null;
    }
    if(!kw) {
        return;
    }

    let jn_stack = msg_iev_read_key(kw, stack);
    if(!jn_stack) {
        jn_stack = [];
        msg_iev_write_key(kw, stack, jn_stack);
    }
    try {
        // Code throwing an exception
        if(is_array(jn_stack)) {
            jn_stack.unshift(jn_data);
        }
    } catch(e) {
        log_error(e);
    }
}

/************************************************************
 *
 ************************************************************/
function msg_iev_get_stack(gobj, kw, stack, verbose)
{
    if(!is_gobj(gobj)) {
        log_error(`gobj is not a GObj`);
        return null;
    }
    if(!is_object(kw)) {
        log_error(`kw is not a dict`);
        return null;
    }

    let jn_stack = msg_iev_read_key(kw, stack);
    if(!jn_stack) {
        if(verbose) {
            log_error(`stack NOT FOUND: ${stack}`);
        }
        return null;
    }

    if(jn_stack.length === 0) {
        if(verbose) {
            log_error(`stack empty: ${stack}`);
        }
        return null;
    }
    return jn_stack[0];
}

/************************************************************
 *
    msg_type_list = [
        "__identity__",         // Used in identity card
        "__command__",          // Used in commands
        "__stats__",            // Used in stats
        "__subscribing__",      // Used in subscribing events
        "__unsubscribing__",    // Used in unsubscribing events
        "__message__",          // Used in messages

        "__publishing__",
        "__query__",
        "__answer__",
        "__request__",
        "__response__",
        "__order__",
        "__poll__",
        "__first_shot__"
    ];

 ************************************************************/
function msg_iev_set_msg_type(
    gobj,
    kw,
    msg_type // empty string to delete the key
)
{
    if(!empty_string(msg_type)) {
        kw_set_subdict_value(gobj, kw, "__md_iev__", "__msg_type__", msg_type);
    } else {
        kw_delete(gobj, kw, "__md_iev__`__msg_type__");
    }
    return 0;
}

/************************************************************
 *
 ************************************************************/
function msg_iev_get_msg_type(gobj, kw)
{
    return kw_get_str(gobj, kw, "__md_iev__`__msg_type__", "", 0);
}

/************************************************************
 *          Load json file from server
 ************************************************************/
function _fileLoaded(xhr) {
    return xhr.status === 0 && xhr.responseText && xhr.responseURL.startsWith("file:");
}
function load_json_file(url, on_success, on_error)
{
    let req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.setRequestHeader("Accept", "application/json");

    req.onreadystatechange = function () {
        if (req.readyState === 4) {
            if (req.status === 200 || _fileLoaded(req)) {
                try {
                    let json = JSON.parse(req.responseText);
                    on_success(json);
                } catch (error) {
                    if (on_error) {
                        log_error(`JSON parse status ${req.status},  error: ${error.message}`);
                        on_error(req.status);
                    }
                }
            } else {
                if (on_error) {
                    on_error(req.status);
                }
            }
        }
    };

    req.send();
}

/************************************************************
 *          Post http
 *          function on_response(status, response_data)
 ************************************************************/
function send_http_json_post(url, data, on_response) {

    let xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            on_response(xhr.status, xhr.responseText);
        }
    };
    xhr.send(data);
}

/************************************************************
 *  callback (obj, key, value, full_path)
 ************************************************************/
function _traverse_dict(obj, callback, full_path)
{
    if(full_path === undefined || !is_string(full_path)) {
        full_path = "";
    }
    for (let key of Object.keys(obj)) {
        if(!Object.prototype.hasOwnProperty.call(obj, key)) {
            continue;
        }
        let sufix = (full_path.length? '`':'') + key;
        full_path += sufix;

        callback.apply(this, [obj, key, obj[key], full_path]);

        if(is_object(obj[key])) {
            //going one step down in the object tree!!
            _traverse_dict(obj[key], callback, full_path);
        }

        full_path = full_path.slice(0, -sufix.length);
    }
}

/************************************************************
 *   Init json database
 *      Hierarchical tree. To use in webix style.
 *      If a record has children,
 *      the own record has the key 'data' with the array of child records
 *
 *      Initialization
 *      --------------
        var jdb = {
            "type": [], // Can be [] or {}
            "hook": "data",
            "schema": { // topics
                "app_menu": [],
                "account_menu": []
            }
        };

        jdb_init(jdb);

 *
 *      Inside example
 *      --------------
 *      jdb: {
 *          hook: "data",
 *          type: []
 *          schema:{
 *              app_menu: [],
 *              account_menu: [],
 *              ...
 *          }
 *          topics: {
 *              app_menu: [
 *                  {
 *                      id:         // Mandatory field
 *                      icon:       // Remains: optional fields
 *                      value:
 *                      action:
 *                  },
 *                  {
 *                      id:
 *                      icon:
 *                      value:
 *                      action:
 *                      data: [
 *                          {
 *                              id:
 *                              icon:
 *                              value:
 *                              action:
 *                          },
 *
 *                      ]
 *                  },
 *                  ...
 *              ]
 *          }
 *      }
 ************************************************************/
function jdb_init(jdb, prefix, duplicate)
{
    if(duplicate) {
        jdb = json_deep_copy(jdb);
    }
    /*  KW_CREATE, not the 1 these calls passed: 1 is KW_REQUIRED, so
     *  nothing was created -- no topic, no hook -- and a jdb built from
     *  a schema had no topic at all.  */
    let type = kw_get_dict_value(null, jdb, "type", [], kw_flag_t.KW_CREATE);
    kw_get_str(null, jdb, "hook", "data", kw_flag_t.KW_CREATE);
    let schema = kw_get_dict_value(null, jdb, "schema", {}, kw_flag_t.KW_CREATE);
    let topics = kw_get_dict_value(null, jdb, "topics", {}, kw_flag_t.KW_CREATE);

    // Create topics defined in schema
    /*  A key whose value is a dict GROUPS topics, it is not one: a topic
     *  is created only for a leaf. Created for the group too, it was a
     *  list, and its children's paths went through a list
     *  ({schema: {a: {b: []}}} logged "segment 'b' is not an index").  */
    let walk = function(obj, key, value, full_path) {
        if(key.substring(0, 2) !== "__" && !is_object(value)) {
            kw_get_dict_value(null, topics, full_path, json_deep_copy(type), kw_flag_t.KW_CREATE);
            //trace_msg(sprintf("full_path: '%s', key: %s, value: %j", full_path, key, value));
        }
    };
    _traverse_dict(schema, walk, prefix);

    return jdb;
}

/********************************************
 *
 ********************************************/
function jdb_update(jdb, topic_name, path, kw)
{
    let topics = kw_get_dict_value(null, jdb, "topics", null, 0);
    let topic = kw_get_dict_value(null, topics, topic_name, null, 0);
    if(!topic) {
        log_error("jdb_update: topic not found: " + topic_name);
        return null;
    }
    if(!is_object(kw) || empty_string(kw["id"])) {
        log_error(`jdb_update: record without id: ${log_stringify(kw)}`);
        return null;
    }
    if(!is_string(path)) {
        log_error(`jdb_update: path must be a string: ${String(path)}`);
        return null;
    }
    if(path !== "" && path.split('`').includes("")) {
        /*  "a`" walked as "a": an empty segment names no record.  */
        log_error(`jdb_update: empty segment in path: '${path}'`);
        return null;
    }

    let ids = path.split('`');

    let id;
    let v = topic;
    while((id = ids.shift())) {
        if(empty_string(id) || !v) {
            break;
        }
        if(is_object(v)) {
            /*  Walking creates nothing: an update that fails leaves the
             *  jdb as it was (it left an empty hook list behind).  */
            v = kw_get_dict_value(null, v, jdb.hook, null, 0);
        }
        v = _jdb_get(v, null, id, false);
    }
    if(!v || ids.length !== 0) {
        log_error(`jdb_update: path not found in topic '${topic_name}': '${path}'`);
        return null;
    }

    /*  The list the record goes in: the topic itself at the root, else
     *  the hook list of the record the path ends on -- unless the path
     *  ends on the record itself.  */
    let list;
    if(is_array(v)) {
        list = v;
    } else if(v["id"] === kw["id"]) {
        json_object_update(v, kw);
        return topic;
    } else {
        list = kw_get_dict_value(null, v, jdb.hook, null, 0);
        if(list === null || list === undefined) {
            list = [];
            json_object_set(v, jdb.hook, list);
        } else if(!is_array(list)) {
            log_error(`jdb_update: the hook '${jdb.hook}' of '${path}' is not a list ` +
                `in topic '${topic_name}'`);
            return null;
        }
    }
    /*  An id that is already there is UPDATED, at the root too (it was
     *  added a second time there).  */
    let found = _jdb_get(list, jdb.hook, kw["id"], false);
    if(found) {
        json_object_update(found, kw);
    } else {
        list.push(kw);
    }

    //trace_msg(JSON.stringify(topic, null, 4));

    return topic;
}

/********************************************
 *
 ********************************************/
function jdb_delete(jdb, topic_name, path, kw)
{
    let topics = kw_get_dict_value(null, jdb, "topics", null, 0);
    let topic = kw_get_dict_value(null, topics, topic_name, null, 0);
    if(!topic) {
        log_error("jdb_delete: topic not found: " + topic_name);
        return null;
    }
    if(!is_object(kw) || empty_string(kw["id"])) {
        log_error(`jdb_delete: record without id: ${log_stringify(kw)}`);
        return null;
    }
    if(!is_string(path)) {
        log_error(`jdb_delete: path must be a string: ${String(path)}`);
        return null;
    }
    if(path !== "" && path.split('`').includes("")) {
        /*  "a`" walked as "a": an empty segment names no record.  */
        log_error(`jdb_delete: empty segment in path: '${path}'`);
        return null;
    }

    let ids = path.split('`');

    let id;
    let v = topic;
    while((id = ids.shift())) {
        if(empty_string(id) || !v) {
            break;
        }
        if(is_object(v)) {
            v = kw_get_dict_value(null, v, jdb.hook, null, 0);
        }
        v = _jdb_get(v, null, id, false);
    }
    if(!v || ids.length !== 0) {
        log_error(`jdb_delete: path not found in topic '${topic_name}': '${path}'`);
        return null;
    }

    let list = is_array(v)? v : kw_get_dict_value(null, v, jdb.hook, null, 0);
    let idx = id_index_in_obj_list(list, kw["id"]);
    if(idx < 0) {
        log_error(`jdb_delete: record not found in topic '${topic_name}': ` +
            `'${path}' '${kw["id"]}'`);
        return null;
    }
    list.splice(idx, 1);

    //trace_msg(JSON.stringify(topic, null, 4));

    return topic;
}

/********************************************
 *
 ********************************************/
function jdb_get_topic(jdb, topic_name)
{
    let topics = kw_get_dict_value(null, jdb, "topics", null, 0);
    if(!topics) {
        log_error("jdb topics section not found");
        trace_msg(jdb);
        return null;
    }
    let topic = kw_get_dict_value(null, topics, topic_name, null, 0);
    if(!topic) {
        log_error("jdb topic not found: " + topic_name);
        trace_msg(topics);
        return null;
    }
    return topic;
}

/********************************************
 *
 ********************************************/
function jdb_get(jdb, topic_name, id, recursive)
{
    let topics = kw_get_dict_value(null, jdb, "topics", null, 0);
    let topic = kw_get_dict_value(null, topics, topic_name, null, 0);
    if(!topic) {
        log_error("jdb_get: topic not found: " + topic_name);
        return null;
    }
    if(recursive === undefined) {
        recursive = true;
    }
    return _jdb_get(topic, jdb.hook, id, recursive);
}

/********************************************
 *
 ********************************************/
function jdb_get_by_idx(jdb, topic_name, idx)
{
    let topics = kw_get_dict_value(null, jdb, "topics", null, 0);
    let topic = kw_get_dict_value(null, topics, topic_name, null, 0);
    if(!topic) {
        log_error("jdb_get_by_idx: topic not found: " + topic_name);
        return null;
    }
    if(idx < topic.length)  {
        return topic[idx];
    } else {
        return {};
    }
}

/**************************************************
 *  Busca el id en el arbol.
 *  Los id deben ser únicos, como requiere webix
 **************************************************/
function _jdb_get(v, hook, id, recursive)
{
    if(!v) {
        return null;
    }
    let j;
    let ln = v.length;
    for(j=0; j<ln; j++) {
        let v_ = v[j];
        if(v_) {
            let id_ = v_["id"];
            if(id_ && (id_ === id)) {
                return v_;
            }
            if(recursive) {
                if(kw_has_key(v_, hook)) {
                    let v__ = _jdb_get(v_[hook], hook, id, recursive);
                    if(v__) {
                        return v__;
                    }
                }
            }
        }
    }
    return null;
}

/***************************************************************************
 *
 *  type can be: str, int, real, bool, null, dict, list
 *  Example:

    static json_desc_t jn_xxx_desc[] = {
        // Name         Type        Default
        {"string",      "str",      ""},
        {"string2",     "str",      "Pepe"},
        {"integer",     "int",      "0660"},     // beginning with "0":octal,"x":hexa, others: integer
        {"boolean",     "bool",     "false"},
        {0}   // HACK important, final null
    };

 ***************************************************************************/
function create_json_record(json_desc, value) // here in js `json_desc` it's a dictionary with the defaults.
{
    let record = json_deep_copy(json_desc);  // Get fields and default values from json_desc
    json_object_update_existing(record, value); // Update (only with service fields) with user data

    return record;
}

/***************************************************************************
 *  Escape a value for safe insertion into an HTML context.
 *  Use this whenever user- or server-supplied strings are interpolated
 *  into an innerHTML / style.innerHTML template literal.
 ***************************************************************************/
function escapeHtml(str)
{
    if(str == null) {
        return '';
    }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/***************************************************************************
 *  Validate and escape a URL for use as an image/media src attribute.
 *  Blocks javascript: and data: URIs that could be used for XSS.
 *  Returns an empty string for any disallowed scheme.
 ***************************************************************************/
function safeSrc(url)
{
    if(!url) {
        return '';
    }
    const s = String(url).trim();
    if(/^javascript:/i.test(s) || /^data:/i.test(s)) {
        return '';
    }
    return escapeHtml(s);
}

/***************************************************************************
 *
 ***************************************************************************/
/***************************************************************************
 *  Markup that createElement2() inserts AS HTML, said out loud.
 *
 *  createElement2() reads a string that starts with '<' as markup. That
 *  decision depends on the CONTENT of the string, not on who wrote it, so
 *  a value from a backend or typed by a user that starts with '<' runs as
 *  html. html_markup() is the explicit way to ask for markup: the string
 *  is the caller's own (an icon, an svg), never data.
 *
 *      ['span', {class: 'icon'}, html_markup('<i class="yi-copy"></i>')]
 *
 *  With set_strings_are_text(true) a plain string is ALWAYS text and
 *  html_markup() is the only way to insert markup.
 ***************************************************************************/
class HtmlMarkup {
    constructor(html) {
        this.html = html;
        Object.freeze(this);
    }
    toString() {
        return this.html;
    }
}

function html_markup(html)
{
    if(typeof html !== "string") {
        log_error(`html_markup: not a string, type ${typeof html}`);
        return new HtmlMarkup("");
    }
    return new HtmlMarkup(html);
}

function is_html_markup(v)
{
    return v instanceof HtmlMarkup;
}

/*
 *  Every node of the markup (createOneHtml() keeps only the first one).
 */
function markup_fragment(markup)
{
    const template = document.createElement('template');
    template.innerHTML = markup.html.trim();
    return template.content;
}

let __strings_are_text__ = false;
const __markup_strings_warned__ = new Set();

/***************************************************************************
 *  The mode of createElement2() for a plain string that starts with '<':
 *      false (default): it is markup, as it always was.
 *      true:            it is TEXT; markup is asked for with html_markup().
 *  An app turns it on once its own code and the libraries it mounts pass
 *  every deliberate markup through html_markup(). A string that starts
 *  with '<' is then logged once (a deliberate one not migrated yet, or a
 *  datum that used to run as html).
 ***************************************************************************/
function set_strings_are_text(on)
{
    __strings_are_text__ = !!on;
}

function strings_are_text()
{
    return __strings_are_text__;
}

function warn_markup_string(content)
{
    if(__markup_strings_warned__.size >= 100) {
        return;
    }
    const key = content.slice(0, 80);
    if(__markup_strings_warned__.has(key)) {
        return;
    }
    __markup_strings_warned__.add(key);
    log_warning(
        `createElement2: a string that starts with '<' is TEXT ` +
        `(set_strings_are_text): use html_markup() if it is markup: ` +
        `${JSON.stringify(key)}`
    );
}

/*
 *  The string IS markup, in any mode (set_strings_are_text() does not
 *  apply): never pass it data. Only its FIRST node is returned.
 */
function createOneHtml(htmlString)
{
    // Convert the HTML string to DOM nodes
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim(); // Trim to avoid extra text nodes

    return template.content.firstChild;
}

/***************************************************************************
 *  Code written by ChatGPT
    Example usage:

    function makeDraggable(handle, target) {
        let offsetX = 0;
        let offsetY = 0;

        // Called when the drag starts
        const onMouseDown = (e) => {
            // Calculate the initial offset
            offsetX = e.clientX - target.getBoundingClientRect().left;
            offsetY = e.clientY - target.getBoundingClientRect().top;

            // Attach the listeners to the document to allow for free movement
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        // Called when the mouse is moved
        const onMouseMove = (e) => {
            // Calculate the new position
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;

            // Update the position of the target
            target.style.left = `${x}px`;
            target.style.top = `${y}px`;
        };

        // Called when the mouse button is released
        const onMouseUp = () => {
            // Remove the listeners from the document
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        // Attach the mousedown listener to the handle
        handle.addEventListener('mousedown', onMouseDown);
    }

    function addResizeFunctionality(resizeHandle, windowElement) {
        let startX, startY, startWidth, startHeight;

        const onMouseDown = (e) => {
            // Prevent default action (like text selection) during resize
            e.preventDefault();

            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(windowElement).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(windowElement).height, 10);

            document.documentElement.addEventListener('mousemove', onMouseMove, false);
            document.documentElement.addEventListener('mouseup', onMouseUp, false);
        };

        const onMouseMove = (e) => {
            // Calculate new size
            const newWidth = startWidth + e.clientX - startX;
            const newHeight = startHeight + e.clientY - startY;

            // Update window size
            windowElement.style.width = `${newWidth}px`;
            windowElement.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            // Remove the listeners when resizing is done
            document.documentElement.removeEventListener('mousemove', onMouseMove, false);
            document.documentElement.removeEventListener('mouseup', onMouseUp, false);
        };

        // Attach the mousedown listener to the resize handle
        resizeHandle.addEventListener('mousedown', onMouseDown, false);
    }


    function createWindow({ title, x, y, width, height, parent }) {
        const windowEl = createElement2([
            'div',
            {
                class: 'window',
                // style: `position: absolute; left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px; display: flex; flex-direction: column; border: 1px solid black;`
                style: {
                    position: "absolute",
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                    display: "flex",
                    "flex-direction": "column",
                    border: "1px solid black",
                }
            },
            [
                ['div', { class: 'window-top', style: 'display: flex; justify-content: space-between; padding: 5px; border-bottom: 1px solid black;cursor:move;' },
                    [
                        ['span', {}, title],
                        ['button', {}, 'Close', {
                            click: (e) => {
                                e.target.closest('.window').remove();
                            }
                        }]
                    ]
                ],
                ['div', { class: 'window-content', style: 'flex-grow: 1; padding: 5px;' }, 'This is the content area.'],
                ['div', { class: 'window-bottom', style: 'padding: 5px; border-top: 1px solid black; display: flex; justify-content: flex-end;' },
                    [
                        ['div', { class: 'resize-handle', style: 'width: 20px; height: 20px; cursor: nwse-resize;' }, '', {
                            mousedown: (e) => {
                                // Resize logic here
                            }
                        }]
                    ]
                ]
            ]
        ]);

        const resizeHandle = windowEl.querySelector('.resize-handle');

        makeDraggable(windowEl.querySelector('.window-top'), windowEl);
        addResizeFunctionality(resizeHandle, windowEl);

        parent.appendChild(windowEl);
    }


    // Example usage
    createWindow({
        title: 'My Draggable Window',
        x: 100,
        y: 100,
        width: 400,
        height: 300,
        parent: document.body
    });
 ***************************************************************************/


/***************************************************************************
 *  Create a HTMLElement:
 *      [tag, attrs, content, events]
 *
 *      tag     -> string
 *
 *      attrs   -> {key:string}
 *                  Special case for key=='style'
 *                      could be `style:'string'`
 *                      or `style:{k:s}`
 *                 Special case for key=='i18n' (or 'data-i18n' or 'data_i18next')
 *                      will be 'data-i18n' attr
 *
 *      content -> string | [createElement2() or parameters of createElement2]
 *                  | HTMLElement | SVGElement | Text
 *                  if string begins with '<' then
 *                      it will be converted to HTMLElement
 *                          content = createOneHtml(string)
 *                  | html_markup(string): markup, said out loud (any mode)
 *                  ⚠️ So a string is MARKUP when it starts with '<': never
 *                  pass DATA (a value from a backend, a name a user typed)
 *                  as a bare string, or "<img src=x onerror=...>" runs.
 *                  Pass it as a Text node, which is always text:
 *                      ['span', {}, document.createTextNode(value)]
 *                  In a LIST of children a node (element, svg, Text) is
 *                  appended as it is and a string is always text -- but a
 *                  list whose first item is a string is read as ONE
 *                  description (the string is its tag).
 *                  With set_strings_are_text(true) a plain string is
 *                  always text, and markup only comes in html_markup().
 *                  if attrs['i18n'] is not empty then (or 'data-i18n' or 'data_i18next')
*                          it will be overridden with the translation
 *                          content = translate(attrs['i18n']));
 *
 *      events  -> {event: ()}
 *
 *  Return the created element
 *
 *  Examples:
 *      ['div', { class: 'window-top', style: 'border-bottom: 1px solid black;' },
 *          [
 *              ['span', {}, 'title'],
 *              ['button', {}, 'Close', {
 *                  click: (e) => {
 *                      e.target.closest('.window').remove();
 *                  }
 *              }]
 *          ]
 *      ]
 *
 *      ['span', {style: {position: 'absolute'} }, 'title'],
 *
 ***************************************************************************/
function createElement2(description, translate_fn) {
    let [tag, attrs, content, events] = description;

    /*
     *  Create the html element
     */
    if (!tag) {
        log_error("Tag must be a valid HTML element.");
        return;
    }
    let el = document.createElement(tag);

    /*
     *  Append attributes
     */
    let data_i18next = '';

    if(attrs && typeof attrs === 'object') {
        for (let attr of Object.keys(attrs)) {
            if (attr === 'style' && typeof attrs[attr] === 'object') {
                // Convert the style object to a CSS string
                let styleString = '';

                for(const prop of Object.keys(attrs[attr])) {
                    styleString += `${prop}: ${attrs[attr][prop]};`;
                }
                el.style.cssText = styleString;
            } else if (attr === 'style') {
                el.style.cssText = attrs[attr];
            } else {
                if(attr === 'i18n' || attr === 'data-i18n' ||
                        attr === 'data_i18next' || attr === 'data-i18next') {
                    /*
                     *  A nullish i18n key would render the literal
                     *  data-i18n="undefined" and block translation
                     *  (e.g. a field whose `header` is undefined).
                     *  Skip the attribute instead of poisoning it.
                     *  An explicit empty string is still honoured.
                     */
                    if(attrs[attr] !== null && attrs[attr] !== undefined) {
                        data_i18next = attrs[attr];
                        el.setAttribute('data-i18n', data_i18next);
                    }
                } else {
                    el.setAttribute(attr, attrs[attr]);
                }
            }
        }
    }

    /*
     *  Append content, it can be a string or another kids
     */
    if(is_html_markup(content)) {
        el.appendChild(markup_fragment(content));
    } else if(is_string(content)) {
        content = content.trim();
        if(content.length > 0 && content[0] === '<' && !__strings_are_text__) {
            el.appendChild(createOneHtml(content));
        } else {
            if(content.length > 0 && content[0] === '<') {
                warn_markup_string(content);
            }
            if(translate_fn && data_i18next) {
                let translated = translate_fn(data_i18next);
                el.textContent = translated?translated:content;
            } else {
                el.textContent = content;
            }
        }
    } else if(is_array(content)) {
        if(content.length > 0) {
            if(is_string(content[0])) {
                el.appendChild(createElement2(content, translate_fn));
            } else {
                for (let child of content) {
                    /*
                     *  A description, a node (element, svg, Text), or a
                     *  string -- which here is always TEXT, never html.
                     *  Up to 7.26.1 a Text node or a string in this list
                     *  was dropped in silence.
                     */
                    if (Array.isArray(child)) {
                        if(child.length > 0) {
                            el.appendChild(createElement2(child, translate_fn));
                        }
                    } else if (child instanceof Node) {
                        el.appendChild(child);
                    } else if (is_html_markup(child)) {
                        el.appendChild(markup_fragment(child));
                    } else if (is_string(child)) {
                        el.appendChild(document.createTextNode(child));
                    } else if (child !== null && child !== undefined && child !== false) {
                        log_error(`createElement2: child ignored, type ${typeof child}`);
                    }
                }
            }
        }
    } else if(content instanceof HTMLElement ||
            content instanceof Text ||
            content instanceof SVGElement)
    {
        el.appendChild(content);
    } else {
        if(content != null) {
            log_error("content ignored");
            trace_json(content);
        }
    }

    /*
     *  Attach event listeners
     */
    if (events && typeof events === 'object') {
        for(const eventType of Object.keys(events)) {
            el.addEventListener(eventType, events[eventType]);
        }
    }

    return el;
}

/***************************************************************************
 *  Code written by ChatGPT
    // Usage example:
 ***************************************************************************/
function getPositionRelativeToBody(element)
{
    if (!element) {
        return {
            top: 0,
            left: 0,
            right: 0,
            bottom: 0
        };
    }

    const { top, left, width, height } = element.getBoundingClientRect?.() || { top: 0, left: 0, width: 0, height: 0 };

    const isBrowser = typeof window !== "undefined";
    const scrollTop = isBrowser ? window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0 : 0;
    const scrollLeft = isBrowser ? window.scrollX || document.documentElement?.scrollLeft || document.body?.scrollLeft || 0 : 0;

    return {
        top: top + scrollTop,
        left: left + scrollLeft,
        right: left + scrollLeft + width,
        bottom: top + scrollTop + height
    };
}

/***************************************************************************
 * Create SVG element from string code
 ***************************************************************************/
function parseSVG(string)
{
    return ((new DOMParser().parseFromString(string, 'image/svg+xml')).firstChild);
}

/************************************************************
 *
 ************************************************************/
function refresh_language(element, t)
{
    if(!is_function(t)) {
        log_error("You must supply a translation function");
        return;
    }
    if(!element) {
        element = document;
    }

    /*  `querySelectorAll` searches DESCENDANTS: it never returns the
     *  element it was called on.  So a caller that hands us the very
     *  node carrying the key -- which is what happens whenever a widget
     *  is built lazily and translated as a unit -- got its children
     *  translated and its own attribute left in the source language.
     *  Measured on the deployed shell: the toolbar's language dropdown
     *  opened as role="menu" aria-label="select language" while its
     *  trigger next to it said "Elegir idioma".  Include the root.  */
    const matching = (selector) => {
        let out = [];
        if(typeof element.matches === "function" && element.matches(selector)) {
            out.push(element);
        }
        out.push(...element.querySelectorAll(selector));
        return out;
    };

    matching('[data-i18n]').forEach(function(elem) {
        let value = elem.getAttribute('data-i18n');
        for(let node of elem.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                if(!value) {
                    value = node.nodeValue;
                }
                node.nodeValue = t(value);
                break; // Stop after updating the first text node
            }
        }
    });

    /*  Translate the `title` attribute (hover tooltip) for any element
     *  carrying `data-i18n-title="<canonical key>"`.  Used by lib-yui's
     *  nav and toolbar renderers to keep tooltips in sync with the
     *  active language, since refresh_language() above only touches
     *  text-node content. */
    matching('[data-i18n-title]').forEach(function(elem) {
        let value = elem.getAttribute('data-i18n-title');
        if(value) {
            elem.setAttribute('title', t(value));
        }
    });

    /*  Translate the `aria-label` attribute (assistive-tech name) for
     *  any element carrying `data-i18n-aria-label="<canonical key>"`.
     *  Same contract as data-i18n-title above — emitted by lib-yui's
     *  toolbar and nav renderers next to the static `aria-label` so
     *  screen readers track language switches. */
    matching('[data-i18n-aria-label]').forEach(function(elem) {
        let value = elem.getAttribute('data-i18n-aria-label');
        if(value) {
            elem.setAttribute('aria-label', t(value));
        }
    });

    /*  Translate the `placeholder` attribute (inputs/textareas) for
     *  any element carrying `data-i18n-placeholder="<canonical key>"`.
     *  Same contract as data-i18n-title above — a placeholder is not a
     *  text node, so the data-i18n walk cannot reach it. */
    matching('[data-i18n-placeholder]').forEach(function(elem) {
        let value = elem.getAttribute('data-i18n-placeholder');
        if(value) {
            elem.setAttribute('placeholder', t(value));
        }
    });
}

/************************************************************
 * Example Usage
 *     const tracker = timeTracker("Track1");
 *     tracker.mark("Step 1");
 *     tracker.mark("Step 2");
 ************************************************************/
function timeTracker(tracker_name="Time Tracker", verbose=false)
{
    const name = tracker_name;
    const startTime = performance.now();
    let lastMarkTime = startTime;

    if(verbose) {
        log_warning(
            `--> ${name} - starting`
        );
    }

    return {
        mark: (label = "Intermediate", result="") => {
            const currentTime = performance.now();
            const partial = (currentTime - lastMarkTime) / 1000;
            const total = (currentTime - startTime) / 1000;
            if(verbose) {
                log_warning(
                    `--> ${name} ${label} - partial: ${partial} sec, total: ${total} sec, ${result}`
                );
            }
            lastMarkTime = currentTime;
            return {
                partial: partial,
                total: total
            };
        }
    };
}

/************************************************************
 *  Get the current timestamp in ISO 8601 format with milliseconds and time zone.
 *  Example Output: "2024-02-24T14:05:30.123+0200"
 ************************************************************/
function current_timestamp(now)
{
    now = now || new Date();
    const pad = (n, w) => String(n).padStart(w, "0");

    /*  LOCAL time, because the offset written after it is the local one:
     *  toISOString() is UTC, and "UTC time +0200" is a wall clock two
     *  hours wrong for anyone reading it (C writes local time too).  */
    const timestamp =
        `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}` +
        `T${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}`;
    const milliseconds = pad(now.getMilliseconds(), 3);

    // Time zone offset in ±HHMM format (getTimezoneOffset() is positive WEST of UTC)
    const offsetMinutes = now.getTimezoneOffset();
    const sign = offsetMinutes > 0 ? "-" : "+";
    const hours = pad(Math.floor(Math.abs(offsetMinutes) / 60), 2);
    const minutes = pad(Math.abs(offsetMinutes) % 60, 2);

    return `${timestamp}.${milliseconds}${sign}${hours}${minutes}`;
}

/********************************************
 *  Return UTC time of right now
 ********************************************/
function get_now()
{
    return Math.floor(Date.now() / 1000);
}

/************************************************************
 *
 ************************************************************/
function index_in_list(list, elm) {
    if(!list) {
        throw "ERROR: index_in_list() list empty";
    }
    for(let i=0; i<list.length; i++) {
        if(elm === list[i]) {
            return i;
        }
    }
    return -1;
}

/************************************************************
 *  A new uuid v4 (RFC 9562).
 *
 *  crypto.randomUUID() exists only in a secure context, so a page
 *  served over http without TLS has none; crypto.getRandomValues()
 *  exists there too. With no crypto at all, Math.random(): not fit
 *  for a secret, and a uuid that names a node is not one.
 ************************************************************/
function new_uuid()
{
    const c = (typeof window !== "undefined" && window.crypto) || globalThis.crypto;
    if (c && typeof c.randomUUID === "function") {
        return c.randomUUID();
    }

    const b = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") {
        c.getRandomValues(b);
    } else {
        for (let i = 0; i < b.length; i++) {
            b[i] = Math.floor(Math.random() * 256);
        }
    }
    b[6] = (b[6] & 0x0f) | 0x40;    // version 4
    b[8] = (b[8] & 0x3f) | 0x80;    // variant 10
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/************************************************************
 *  The uuid of this node: ONE for the life of the page.
 *
 *  The one the store keeps ("host_uuid"), made and written there when
 *  there is none. When the store cannot keep it the one this page
 *  made: warned once when the store is blocked or full, silent when
 *  there is no localStorage or no browser at all. It goes in the node_uuid attribute of the yuno, the id of the
 *  identity card and the `host` of every message the client sends, so
 *  the first answer is kept and answered again: 7.26.27 made a new
 *  uuid on every call when the store could not keep it, and answered
 *  null without crypto.randomUUID(). A stored value that is not a
 *  uuid (a foreign or corrupt write) is replaced, with a WARNING.
 ************************************************************/
let uuid_of_this_page = null;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function node_uuid()
{
    if (uuid_of_this_page) {
        return uuid_of_this_page;
    }

    const store = local_store();
    if (!store) {
        uuid_of_this_page = new_uuid();
        return uuid_of_this_page;
    }

    let uuid = null;
    try {
        uuid = store.getItem("host_uuid");
    } catch (e) {
        warn_local_storage_once("host_uuid",
            "node_uuid(): localStorage cannot be read (storage blocked?): a uuid of this page only");
        uuid_of_this_page = new_uuid();
        return uuid_of_this_page;
    }

    if (uuid && !UUID_SHAPE.test(uuid)) {
        log_warning("node_uuid(): the stored host_uuid is not a uuid: a new one replaces it");
        uuid = null;
    }
    if (!uuid) {
        uuid = new_uuid();
        try {
            store.setItem("host_uuid", uuid);
        } catch (e) {
            warn_local_storage_once("host_uuid",
                "node_uuid(): localStorage cannot be written (storage full or blocked?): " +
                "a uuid of this page only");
        }
    }
    uuid_of_this_page = uuid;
    return uuid_of_this_page;
}

/************************************************************
 *   Build a cleaned name
 ************************************************************/
function clean_name(name)
{
    return name.replace(/[?# ^:]/g, '_');
}

/************************************************************
 *
 ************************************************************/
function get_function_name(func)
{
    let fName = null;
    if (typeof func === "function" || typeof func === "object") {
        fName = ("" + func).match(/function\s*([\w\$]*)\s*\(/);
    }
    if (fName !== null) {
        return fName[1] + "()";
    }
    return "";
}

/***************************************************************************
 *  implement a debounce or throttle mechanism to limit the number
 *  of times the callback function is executed

    const fn = debounce(() => window.console.log('Called!'), 1000);

    // Start debounce timer
    fn();

    // Execute immediately (if pending)
    fn.flush();

    // Cancel the pending call
    fn.cancel();

 ***************************************************************************/
function debounce(func, wait = 0, immediate = false)
{
    let timeout = null;
    let args = null;
    let context = null;

    const debounced = (..._args) => {
        context = this;
        args = _args;

        const later = () => {
            timeout = null;
            if (!immediate) {
                func.apply(context, args);
            }
        };

        const callNow = immediate && !timeout;

        clearTimeout(timeout);
        timeout = setTimeout(later, wait);

        if (callNow) {
            func.apply(context, args);
        }
    };

    // Immediately invoke the pending function
    debounced.flush = () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
            func.apply(context, args);
        }
    };

    // Cancel the pending execution
    debounced.cancel = () => {
        clearTimeout(timeout);
        timeout = null;
        args = null;
        context = null;
    };

    return debounced;
}

/************************************************************
 *  Build a URL/path from segments, ensuring exactly one '/'
 *  between each part.
 *
 *  - The first segment is the ROOT: it keeps its leading '/'
 *    (absolute) or not (relative), and its trailing '/' are
 *    stripped -- but a root made only of '/' stays "/".
 *  - Leading and trailing '/' are stripped from every later
 *    segment, and duplicate '/' inside it are collapsed.
 *  - '.' and '..' of the later segments are resolved, and '..'
 *    never rises above the root: ("/store", "../../etc") is
 *    "/store/etc".
 *  - Empty/null/undefined segments are skipped.
 *
 *  Mirrors the C helper build_path() from gobj-c/src/helpers.c
 *  (tests/build_path.test.js pins the same cases). Up to 7.28.1
 *  a root "/" was lost (("/", "tmp") gave "tmp") and '.'/'..'
 *  were kept as they came.
 ************************************************************/
function build_path(...segments)
{
    let root = null;
    let tail = [];

    for(let segment of segments) {
        if(segment == null || segment === "") {
            continue;
        }
        segment = String(segment);

        if(root === null) {
            // First segment: keep leading '/', strip trailing '/', "/" stays
            root = segment.replace(/(.)\/+$/, "$1");
            continue;
        }

        for(let component of segment.split("/")) {
            if(component === "" || component === ".") {
                continue;
            }
            if(component === "..") {
                tail.pop();     // at the root: clamped
                continue;
            }
            tail.push(component);
        }
    }

    if(root === null) {
        return "";
    }
    if(tail.length === 0) {
        return root;
    }
    return root + (root.endsWith("/")? "" : "/") + tail.join("/");
}



                    /***************************************
                     *      Flat json (id -> value)
                     ***************************************/




/************************************************************
 *  THE FLAT FORM, AND WHY IT IS SHAPED LIKE THIS
 *
 *  A json seen as a table: one row per LEAF, the id being the
 *  PATH of the item and the value its value. Easier to store,
 *  to compare and to diff than the nested form, and the only
 *  one a person can read when two configurations disagree.
 *
 *      {a: {b: 1}, c: [10, 20]}
 *          ->  {"a`b": 1, "c`[0]": 10, "c`[1]": 20}
 *
 *  Same grammar as the C side (kwid.c), because the point is
 *  that a flat json written by either can be read by the other:
 *
 *      - segments joined by '`', the SDK's own path delimiter;
 *      - a literal '`' in a key is DOUBLED, so no key is
 *        forbidden -- a dict keyed by a yuno id N is a dict, not
 *        an array of N+1 elements, which is what the first C
 *        implementation answered;
 *      - an array index is '[N]', canonical, no leading zeros;
 *      - a dict key starting with '[' doubles it ('[[0]'), so it
 *        can never be read as an index;
 *      - AN EMPTY CONTAINER IS A LEAF: {} and [] hold no leaves,
 *        and 'properties': {} is everywhere in our configs.
 *
 *  flat2json() THROWS instead of guessing: an id used as leaf and
 *  as container would depend on the order the ids are read in.
 ************************************************************/
const FLAT_MAX_DEPTH = 256;
const FLAT_MAX_INDEX = 100000;

/************************************************************
 *  Is this raw segment an array index, '[N]'?
 *  Returns the index, or null.
 ************************************************************/
function flat_seg_index(seg)
{
    if(typeof seg !== "string" || seg.length < 3 || seg[0] !== "[") {
        return null;
    }
    if(seg[seg.length-1] !== "]") {
        return null;
    }
    const body = seg.slice(1, -1);
    if(!/^[0-9]+$/.test(body)) {
        return null;
    }
    if(body.length > 1 && body[0] === "0") {
        return null;    // canonical: '[00]' is malformed, not a second '[0]'
    }
    return parseInt(body, 10);
}

/************************************************************
 *  Escape one dict key.
 ************************************************************/
function flat_escape_key(key)
{
    const s = String(key).replace(/`/g, "``");
    return s[0] === "[" ? "[" + s : s;
}

/************************************************************
 *  Compose a flat id from its segments.
 *
 *  A STRING segment is a dict key and gets escaped; a NUMBER is
 *  an array index and is written '[N]'. They are two types and
 *  not two spellings: as strings, the key "[0]" and the index 0
 *  would both be "[0]", which is the ambiguity '[N]' removes.
 ************************************************************/
function flat_key_join(segments)
{
    if(!Array.isArray(segments) || segments.length === 0) {
        return "";
    }
    return segments.map(
        (seg) => (typeof seg === "number" ? `[${seg}]` : flat_escape_key(seg))
    ).join("`");
}

/************************************************************
 *  Split a flat id into its segments, undoing the escapes.
 *
 *  An index comes back as a NUMBER and a dict key as a STRING.
 ************************************************************/
function flat_key_split(key)
{
    if(typeof key !== "string") {
        return null;
    }

    let raw = [];
    let cur = "";
    for(let i = 0; i < key.length; i++) {
        if(key[i] === "`") {
            if(key[i+1] === "`") {
                cur += "`";
                i++;
                continue;
            }
            raw.push(cur);
            cur = "";
            continue;
        }
        cur += key[i];
    }
    raw.push(cur);

    /*  Decide what each segment IS before undoing the bracket escape:
     *  the other way round, '[[0]' would become '[0]' and read as an
     *  index. */
    return raw.map((seg) => {
        const idx = flat_seg_index(seg);
        if(idx !== null) {
            return idx;
        }
        if(seg[0] === "[" && seg[1] === "[") {
            return seg.slice(1);
        }
        return seg;
    });
}

/************************************************************
 *  Nested -> flat.
 ************************************************************/
function json2flat(jn)
{
    const flat = {};

    const walk = (value, path, depth) => {
        if(depth > FLAT_MAX_DEPTH) {
            throw new Error(`json2flat: deeper than ${FLAT_MAX_DEPTH}`);
        }
        if(value !== null && typeof value === "object" && !Array.isArray(value)) {
            const keys = Object.keys(value);
            if(keys.length > 0) {
                for(const key of keys) {
                    const seg = flat_escape_key(key);
                    walk(value[key], depth === 0 ? seg : path + "`" + seg, depth+1);
                }
                return;
            }
        } else if(Array.isArray(value) && value.length > 0) {
            value.forEach((child, index) => {
                const seg = `[${index}]`;
                walk(child, depth === 0 ? seg : path + "`" + seg, depth+1);
            });
            return;
        }
        /*  A leaf: a scalar, or an EMPTY container, which has no leaves
         *  of its own and would otherwise vanish. Depth, not the length
         *  of the path: {"": 1} is a json whose only id is "". */
        if(depth === 0) {
            return;     // a scalar root has no path
        }
        set_own_key(flat, path, value);
    };

    if(jn === undefined || jn === null) {
        return flat;
    }
    walk(jn, "", 0);
    return flat;
}

/************************************************************
 *  Flat -> nested. Throws on the FIRST id that does not fit:
 *  rebuilding "most of it" is how a configuration comes back
 *  subtly different from the one that was saved.
 ************************************************************/
function flat2json(flat)
{
    if(flat === null || typeof flat !== "object" || Array.isArray(flat)) {
        throw new Error("flat2json: a flat json is an object of id -> value");
    }

    let root = null;

    for(const key of Object.keys(flat)) {
        const segments = flat_key_split(key);
        if(!segments || segments.length === 0) {
            throw new Error(`flat2json: malformed flat id: '${key}'`);
        }
        if(segments.length > FLAT_MAX_DEPTH) {
            throw new Error(`flat2json: '${key}' deeper than ${FLAT_MAX_DEPTH}`);
        }

        const first_is_index = (typeof segments[0] === "number");
        if(root === null) {
            root = first_is_index ? [] : {};
        } else if(first_is_index !== Array.isArray(root)) {
            throw new Error(
                `flat2json: '${key}' does not fit a ` +
                `${Array.isArray(root)? "array": "object"} root`
            );
        }

        let current = root;
        for(let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const is_index = (typeof seg === "number");
            const is_last = (i === segments.length - 1);
            const next_is_index = is_last? false: (typeof segments[i+1] === "number");

            if(is_index && seg > FLAT_MAX_INDEX) {
                throw new Error(
                    `flat2json: array index ${seg} over the limit ` +
                    `(${FLAT_MAX_INDEX}) in '${key}'`
                );
            }
            if(is_index !== Array.isArray(current)) {
                throw new Error(
                    `flat2json: '${key}' uses a ${is_index? "array index": "key"} ` +
                    `where the tree already has a ` +
                    `${Array.isArray(current)? "array": "object"}`
                );
            }

            if(is_last) {
                if(Array.isArray(current)) {
                    while(current.length <= seg) {
                        current.push(null);
                    }
                    current[seg] = flat[key];
                } else {
                    if(Object.prototype.hasOwnProperty.call(current, seg)) {
                        throw new Error(
                            `flat2json: '${key}' is written twice, or once as a ` +
                            `value and once as a container`
                        );
                    }
                    set_own_key(current, seg, flat[key]);
                }
                break;
            }

            let child;
            if(Array.isArray(current)) {
                while(current.length <= seg) {
                    current.push(null);
                }
                child = current[seg];
                if(child === null || child === undefined) {
                    child = next_is_index? []: {};
                    current[seg] = child;
                }
            } else {
                child = is_prototype_segment(current, seg)? undefined : current[seg];
                if(child === undefined) {
                    child = next_is_index? []: {};
                    set_own_key(current, seg, child);
                }
            }

            if(child === null || typeof child !== "object") {
                throw new Error(
                    `flat2json: '${key}' walks through a value: the same id is ` +
                    `a leaf and a container at once`
                );
            }
            if(next_is_index !== Array.isArray(child)) {
                throw new Error(
                    `flat2json: '${key}' needs a ${next_is_index? "array": "object"} ` +
                    `where the tree already has a ` +
                    `${Array.isArray(child)? "array": "object"}`
                );
            }
            current = child;
        }
    }

    return root === null ? {} : root;
}

/************************************************************
 *  Deep equality, for comparing two leaf values.
 ************************************************************/
function flat_value_equal(a, b)
{
    if(a === b) {
        return true;
    }
    if(a === null || b === null || typeof a !== "object" || typeof b !== "object") {
        return false;
    }
    return JSON.stringify(a) === JSON.stringify(b);
}

/************************************************************
 *  What changed between two flat dicts:
 *
 *      {added: {id: value}, removed: {id: value},
 *       changed: {id: {from, to}}}
 ************************************************************/
function flat_diff(flat1, flat2)
{
    const a = (flat1 && typeof flat1 === "object")? flat1: {};
    const b = (flat2 && typeof flat2 === "object")? flat2: {};
    const diff = {added: {}, removed: {}, changed: {}};

    for(const key of Object.keys(a)) {
        if(!Object.prototype.hasOwnProperty.call(b, key)) {
            set_own_key(diff.removed, key, a[key]);
        } else if(!flat_value_equal(a[key], b[key])) {
            set_own_key(diff.changed, key, {from: a[key], to: b[key]});
        }
    }
    for(const key of Object.keys(b)) {
        if(!Object.prototype.hasOwnProperty.call(a, key)) {
            set_own_key(diff.added, key, b[key]);
        }
    }

    return diff;
}

/************************************************************
 *  Apply that diff to a flat dict, which is MUTATED.
 *
 *  On the flat form on purpose: there an id addresses one value,
 *  so applying is setting and deleting, with nothing to walk and
 *  nothing to guess. Nested is json2flat -> flat_apply -> flat2json.
 ************************************************************/
function flat_apply(flat, diff)
{
    if(flat === null || typeof flat !== "object" || Array.isArray(flat)) {
        throw new Error("flat_apply: a flat json is an object of id -> value");
    }
    if(diff === null || typeof diff !== "object") {
        throw new Error("flat_apply: a diff is the object flat_diff() answers");
    }

    for(const key of Object.keys(diff.removed || {})) {
        delete flat[key];
    }
    for(const key of Object.keys(diff.added || {})) {
        set_own_key(flat, key, diff.added[key]);
    }
    for(const key of Object.keys(diff.changed || {})) {
        const change = diff.changed[key];
        if(!change || !Object.prototype.hasOwnProperty.call(change, "to")) {
            throw new Error(`flat_apply: changed '${key}' without a 'to'`);
        }
        set_own_key(flat, key, change.to);
    }

    return flat;
}


export {
    kw_flag_t,
    is_secret_name,
    mask_secrets_inline,
    json_mask_secrets,
    trace_json_masked,
    json_deep_copy,
    duplicate_objects,
    json_is_identical,
    json_object_update,
    json_object_update_existing,
    json_object_update_missing,
    json_object_get,
    json_object_set,
    json_object_set_new,
    json_object_del,
    json_array_append,
    json_array_append_new,
    json_array_remove,
    json_array_extend,
    json_object_size,
    json_array_size,
    json_size,
    empty_json,

    is_object,
    is_array,
    is_string,
    is_number,
    is_boolean,
    is_null,
    is_pure_number,
    is_date,
    is_function,
    is_gobj,

    parseBoolean,
    empty_string,
    strncmp,
    strcmp,
    strcasecmp,
    cmp_two_simple_json,
    strstr,

    is_metadata_key,
    is_private_key,
    kw_pop,
    kw_has_key,
    kw_find_path,
    kw_delete,
    kw_get_bool,
    kw_get_int,
    kw_get_real,
    kw_get_str,
    kw_get_pointer,
    kw_get_dict,
    kw_get_list,
    kw_get_dict_value,
    kw_set_dict_value,
    kw_set_subdict_value,
    kw_match_simple,
    kw_find_json_in_list,
    kw_select,
    kw_collect,
    kw_clone_by_keys,
    kw_clone_by_not_keys,

    kw_get_local_storage_value,
    kw_set_local_storage_value,
    kw_remove_local_storage_value,

    kwid_match_id,
    kwid_collect,
    kwid_new_dict,
    kwid_new_list,
    kwid_find_one_record,
    kwid_get_ids,
    list2options,

    id_index_in_obj_list,
    str_in_list,
    strs_in_list,
    delete_from_list,

    msg_iev_push_stack,
    msg_iev_get_stack,
    msg_iev_set_msg_type,
    msg_iev_get_msg_type,
    msg_iev_write_key,
    msg_iev_read_key,
    load_json_file,
    send_http_json_post,

    jdb_init,
    jdb_update,
    jdb_delete,
    jdb_get_topic,
    jdb_get,
    jdb_get_by_idx,

    create_json_record,

    set_remote_log_functions,
    set_log_callback,
    set_console_log_enabled,
    set_console_log_filter,
    log_error,
    log_warning,
    log_info,
    log_debug,
    trace_msg,
    trace_json,

    escapeHtml,
    safeSrc,
    createOneHtml,
    html_markup,
    is_html_markup,
    set_strings_are_text,
    strings_are_text,
    createElement2,
    getPositionRelativeToBody,
    parseSVG,
    refresh_language,

    timeTracker,
    current_timestamp,
    get_now,
    index_in_list,
    node_uuid,
    clean_name,
    get_function_name,
    debounce,
    build_path,

    json2flat,
    flat2json,
    flat_key_join,
    flat_key_split,
    flat_diff,
    flat_apply,
};
