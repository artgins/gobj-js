/***********************************************************************
 *          secret_masking_linear.test.js
 *
 *      The masking of secrets does a work linear in the size of what it
 *      masks: no shape of text makes it rescan.
 *
 *      The work is COUNTED, so the machine and its load do not change
 *      the answer. vite.config.js runs this file in a vitest project of
 *      its own, whose count_work_plugin.js adds a tick to every function,
 *      every loop and every arrow function of src/; this file adds the
 *      work of the native functions it has a model of
 *      (with_native_work_counted(), which lists them). What runs inside
 *      a native function with no model here, and the work of a regular
 *      expression that backtracks, is not counted:
 *      secret_masking_time.test.js times the same shapes
 *      (secret_masking_shapes.js) for it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, inject } from "vitest";
import {
    mask_secrets_inline,
    json_mask_secrets,
} from "../src/index.js";
import { MASKING_SHAPES } from "./secret_masking_shapes.js";

/*
 *  The counter of count_work_plugin.js, created when src/ loads
 */
const work = globalThis.__gobj_js_work;

const native_string_index_of = String.prototype.indexOf;
const native_array_index_of = Array.prototype.indexOf;
const native_typed_index_of = Object.getPrototypeOf(Uint8Array.prototype).indexOf;
const native_object_keys = Object.keys;

const TYPED_ARRAYS = [
    "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
    "Int32Array", "Uint32Array", "Float32Array", "Float64Array",
    "BigInt64Array", "BigUint64Array",
];

/*
 *  An index argument of a method of an array or a typed array, as the
 *  method reads it: a negative one counts from the end
 */
function relative_index(n, value, otherwise)
{
    if(value === undefined) {
        return otherwise;
    }
    const i = Math.trunc(Number(value) || 0);
    if(i < 0) {
        return Math.max(0, n + i);
    }
    return Math.min(i, n);
}

/*
 *  The work of a search forward, as positions read: from where it
 *  starts to the end of what it found, or to the end
 */
function search_cost(n, search_len, start, found)
{
    if(found < 0) {
        return n - start + 1;
    }
    return found - start + search_len + 1;
}

/*
 *  The work of a search backward: from where it starts to what it
 *  found, or to the beginning
 */
function search_back_cost(start, found)
{
    if(found < 0) {
        return start + 1;
    }
    return start - found + 1;
}

/*
 *  The work of a comparison sort of n elements with no comparator to
 *  count: n log2 n comparisons
 */
function sort_cost(n)
{
    return n * Math.ceil(Math.log2(n + 1)) + 1;
}

/*
 *  How far a regular expression can read, from its source: `len`, the
 *  longest text a match takes; `ahead`, how far past a position a
 *  lookahead in it can read; `behind`, how far back a lookbehind can.
 *  Infinity when a quantifier has no bound or a backreference is in
 *  it (its length is that of what it refers to). An escape, a class
 *  and `.` take one character; an assertion (^ $ \b \B) none.
 */
const reach_of_regex = new WeakMap();
const reach_of_source = new Map();

function regex_reach(re)
{
    let reach = reach_of_regex.get(re);
    if(!reach) {
        const key = (re.unicodeSets? "v/" : "/") + re.source;
        reach = reach_of_source.get(key);
        if(!reach) {
            reach = parse_reach(re.source, re.unicodeSets);
            reach_of_source.set(key, reach);
        }
        reach_of_regex.set(re, reach);
    }
    return reach;
}

/*
 *  The parser reads the source by its characters only: the methods of
 *  String and RegExp are patched while it runs
 */
function starts_at(src, i, text)
{
    for(let k = 0; k < text.length; k++) {
        if(src[i + k] !== text[k]) {
            return false;
        }
    }
    return true;
}

function after(src, i, c)
{
    while(i < src.length && src[i] !== c) {
        i++;
    }
    return i + 1;
}

function parse_reach(src, unicode_sets)
{
    let i = 0;

    function skip_class()
    {
        let depth = 0;
        let strings = false;
        while(i < src.length) {
            const c = src[i];
            if(c === "\\") {
                if(src[i + 1] === "q" && src[i + 2] === "{") {
                    strings = true;
                }
                i += 2;
                continue;
            }
            if(c === "[") {
                if(depth === 0 || unicode_sets) {
                    depth++;
                }
            } else if(c === "]") {
                depth--;
                if(depth === 0) {
                    i++;
                    return strings? Infinity : 1;
                }
            }
            i++;
        }
        return Infinity;
    }

    function skip_escape()
    {
        const c = src[i + 1];
        i += 2;
        if((c >= "1" && c <= "9") || c === "k") {
            if(c === "k" && src[i] === "<") {
                i = after(src, i, ">");
            }
            return Infinity;
        }
        if(c === "b" || c === "B") {
            return 0;
        }
        if((c === "u" || c === "p" || c === "P") && src[i] === "{") {
            i = after(src, i, "}");
        } else if(c === "u") {
            i += 4;
        } else if(c === "x") {
            i += 2;
        } else if(c === "c") {
            i += 1;
        }
        return 1;
    }

    function read_number()
    {
        let digits = "";
        while(src[i] >= "0" && src[i] <= "9") {
            digits += src[i];
            i++;
        }
        return digits;
    }

    /*
     *  A quantifier at i: how many times its atom can repeat, 1 when
     *  there is none (a "{" that is no quantifier is a character)
     */
    function read_quantifier()
    {
        const c = src[i];
        if(c === "*" || c === "+") {
            i++;
            return Infinity;
        }
        if(c === "?") {
            i++;
            return 1;
        }
        if(c !== "{") {
            return 1;
        }
        const at = i;
        i++;
        const low = read_number();
        let high = low;
        if(src[i] === ",") {
            i++;
            high = read_number();
            if(high === "") {
                high = "Infinity";
            }
        }
        if(low === "" || src[i] !== "}") {
            i = at;
            return 1;
        }
        i++;
        return Number(high);
    }

    function parse_alternatives()
    {
        const out = {len: 0, ahead: 0, behind: 0};
        let seq = 0;
        while(i < src.length && src[i] !== ")") {
            if(src[i] === "|") {
                out.len = Math.max(out.len, seq);
                seq = 0;
                i++;
                continue;
            }
            let atom = 0;
            const c = src[i];
            if(c === "\\") {
                atom = skip_escape();
            } else if(c === "[") {
                atom = skip_class();
            } else if(c === "(") {
                let kind = "group";
                if(starts_at(src, i, "(?=") || starts_at(src, i, "(?!")) {
                    kind = "ahead";
                    i += 3;
                } else if(starts_at(src, i, "(?<=") || starts_at(src, i, "(?<!")) {
                    kind = "behind";
                    i += 4;
                } else if(starts_at(src, i, "(?<")) {
                    i = after(src, i, ">");
                } else if(starts_at(src, i, "(?")) {
                    i = after(src, i, ":");
                } else {
                    i++;
                }
                const inner = parse_alternatives();
                i++;    // its ")"
                out.ahead = Math.max(out.ahead, inner.ahead);
                out.behind = Math.max(out.behind, inner.behind);
                if(kind === "ahead") {
                    out.ahead = Math.max(out.ahead, inner.len);
                } else if(kind === "behind") {
                    out.behind = Math.max(out.behind, inner.len);
                } else {
                    atom = inner.len;
                }
            } else if(c === "^" || c === "$") {
                i++;
            } else {
                atom = 1;
                i++;
            }
            const times = read_quantifier();
            if(src[i] === "?") {
                i++;    // lazy
            }
            if(atom > 0) {
                seq += atom * times;
            }
        }
        out.len = Math.max(out.len, seq);
        return out;
    }

    return parse_alternatives();
}

/*
 *  The work of the native functions, added to the counter while `fn`
 *  runs. A search: the positions it reads to where it found, or to the
 *  end. A copy, a conversion, an encoding, a constructor that fills
 *  what it makes: what it reads or makes. An iterator (of a string, an
 *  array, a typed array, a Map, a Set): one for each step, so a spread
 *  `[...x]`, a destructuring and Array.from() of an iterable count what
 *  they read. A method that calls back (some, find, map, reduce, ...):
 *  one for each call, a native callback (Boolean, Number.isNaN)
 *  included. A sort with no comparator: n log2 n (one with a
 *  comparator counts its calls).
 *
 *  A regular expression, by exec() (String's replace(), match(),
 *  matchAll(), search() and split() with one, and test(), all run it):
 *  a match, from where it starts to the end of the match, and past it
 *  as far as a lookahead in it can read (to the end of the text when
 *  that lookahead has no bound), and back from the match as far as a
 *  lookbehind can; no match, every position to the end when it scans,
 *  and as far as the expression can read when it is sticky (to the
 *  end when it has no bound) -- one position for each attempt of the
 *  sticky splitter split() makes, which is a scan. Not counted: what a
 *  failed attempt reads at each position of a scan, and the
 *  backtracking within one attempt -- secret_masking_time.test.js sees
 *  them.
 *
 *  The O(1) readers (charCodeAt, an element by index, subarray, a view
 *  on an ArrayBuffer) are not counted: they run inside a loop, and the
 *  loop counts. Nor is anything else a native function does:
 *  structuredClone(), Intl, a Map or a Set built from an iterable (its
 *  iterator counts what it reads, not what it hashes), ...
 */
function with_native_work_counted(fn)
{
    const S = String.prototype;
    const R = RegExp.prototype;
    const A = Array.prototype;
    const T = Object.getPrototypeOf(Uint8Array.prototype);
    const saved = [];
    const save = (owner, name) => {
        saved.push([owner, name, owner[name]]);
        return owner[name];
    };
    const patch = (owner, name, cost, before) => {
        const orig = save(owner, name);
        owner[name] = function(...args) {
            const at = before? before(this, args) : 0;
            const result = orig.apply(this, args);
            work.n += cost(this, args, result, at);
            return result;
        };
    };
    const count_calls = (cb) => function(...args) {
        work.n++;
        return cb.apply(this, args);
    };
    const patch_callback = (owner, name, cost) => {
        const orig = save(owner, name);
        owner[name] = function(...args) {
            const counted = (typeof args[0] === "function");
            if(counted) {
                args[0] = count_calls(args[0]);
            }
            const result = orig.apply(this, args);
            work.n += cost? cost(this, counted) : 0;
            return result;
        };
    };
    const patch_constructor = (name, cost) => {
        const orig = save(globalThis, name);
        const counted = new Proxy(orig, {
            construct(target, args, new_target) {
                const made = Reflect.construct(target, args,
                    (new_target === counted)? target : new_target);
                work.n += cost(args, made);
                return made;
            },
            apply(target, self, args) {
                const made = Reflect.apply(target, self, args);
                work.n += cost(args, made);
                return made;
            },
        });
        globalThis[name] = counted;
    };
    const whole = (s) => String(s).length + 1;
    const made = (s, a, r) => r.length + 1;
    let in_split = 0;

    /*
     *  Strings
     */
    patch(S, "indexOf", (s, a, r) => search_cost(s.length, String(a[0]).length,
        Math.max(0, Math.min(s.length, Math.trunc(Number(a[1]) || 0))), r));
    patch(S, "includes", (s, a) => {
        const start = Math.max(0, Math.min(s.length, Math.trunc(Number(a[1]) || 0)));
        return search_cost(s.length, String(a[0]).length, start,
            native_string_index_of.call(s, a[0], a[1]));
    });
    patch(S, "lastIndexOf", (s, a, r) => {
        const from = Number(a[1]);
        const last = Math.max(0, s.length - String(a[0]).length);
        const start = Number.isNaN(from)? last : Math.max(0, Math.min(last, Math.trunc(from)));
        return search_back_cost(start, r) + String(a[0]).length;
    });
    patch(S, "startsWith", (s, a) => String(a[0]).length + 1);
    patch(S, "endsWith", (s, a) => String(a[0]).length + 1);
    for(const name of ["substring", "slice", "substr", "repeat", "padStart", "padEnd"]) {
        patch(S, name, made);
    }
    patch(S, "concat", (s, a) => {
        let sum = 1;
        for(let k = 0; k < a.length; k++) {
            sum += String(a[k]).length;
        }
        return sum;
    });
    for(const name of ["split", "toLowerCase", "toUpperCase", "toLocaleLowerCase",
                       "toLocaleUpperCase", "trim", "trimStart", "trimEnd", "normalize",
                       "replace", "replaceAll", "match", "matchAll", "search",
                       "localeCompare", "isWellFormed", "toWellFormed"]) {
        patch(S, name, (s) => whole(s));
    }
    patch(String, "fromCharCode", (s, a) => a.length + 1);
    patch(String, "fromCodePoint", (s, a) => a.length + 1);
    patch(String, "raw", (s, a, r) => r.length + 1);

    /*
     *  Regular expressions
     */
    patch(R, "exec", (re, a, r, from) => {
        const n = String(a[0]).length;
        if(r === null) {
            if(from > n) {
                return 1;
            }
            if(!re.sticky) {
                return n - from + 1;
            }
            if(in_split > 0) {
                return 1;
            }
            const reach = regex_reach(re);
            return Math.min(n - from, reach.len + reach.ahead) + Math.min(from, reach.behind) + 1;
        }
        const reach = regex_reach(re);
        const end = r.index + r[0].length;
        return Math.min(n, end + reach.ahead) - from + Math.min(r.index, reach.behind) + 1;
    }, (re) => ((re.global || re.sticky)? re.lastIndex : 0));
    {
        const orig = save(R, Symbol.split);
        R[Symbol.split] = function(...args) {
            in_split++;
            try {
                return orig.apply(this, args);
            } finally {
                in_split--;
            }
        };
    }

    /*
     *  Arrays and typed arrays
     */
    for(const [owner, native_index_of] of [[A, native_array_index_of], [T, native_typed_index_of]]) {
        patch(owner, "indexOf", (arr, a, r) =>
            search_cost(arr.length, 1, relative_index(arr.length, a[1], 0), r));
        patch(owner, "includes", (arr, a) =>
            search_cost(arr.length, 1, relative_index(arr.length, a[1], 0),
                native_index_of.call(arr, a[0], a[1])));
        patch(owner, "lastIndexOf", (arr, a, r) => search_back_cost(
            Math.min(arr.length - 1, (a.length > 1)? relative_index(arr.length, a[1], 0) : arr.length - 1), r));
        for(const name of ["slice", "join", "toReversed", "with", "toLocaleString"]) {
            patch(owner, name, made);
        }
        patch(owner, "fill", (arr, a) => relative_index(arr.length, a[2], arr.length) -
            relative_index(arr.length, a[1], 0) + 1);
        patch(owner, "copyWithin", (arr) => arr.length + 1);
        patch(owner, "reverse", (arr) => arr.length + 1);
        for(const name of ["forEach", "map", "filter", "some", "every", "find", "findIndex",
                           "findLast", "findLastIndex", "reduce", "reduceRight"]) {
            patch_callback(owner, name);
        }
        for(const name of ["sort", "toSorted"]) {
            patch_callback(owner, name, (arr, counted) => (counted? 1 : sort_cost(arr.length)));
        }
    }
    patch_callback(A, "flatMap");
    for(const name of ["concat", "flat", "toSpliced"]) {
        patch(A, name, made);
    }
    patch(A, "unshift", (arr, a, r) => r + 1);
    patch(A, "splice", (arr, a) => arr.length - relative_index(arr.length, a[0], 0) + a.length + 1);
    patch(A, "push", (arr, a) => a.length + 1);
    patch(T, "set", (arr, a) => ((a[0] && a[0].length) || 0) + 1);
    patch(Array, "from", made);
    patch(Array, "of", made);

    /*
     *  Constructors that fill what they make: an array of n, a typed
     *  array of n or a copy of one, a buffer of n bytes (a view on a
     *  buffer is O(1))
     */
    patch_constructor("Array", (a, r) => r.length + 1);
    for(const name of TYPED_ARRAYS) {
        patch_constructor(name, (a, r) => (ArrayBuffer.isView(a[0]) || !(a[0] instanceof ArrayBuffer ||
            a[0] instanceof SharedArrayBuffer))? r.length + 1 : 1);
    }
    patch_constructor("ArrayBuffer", (a, r) => r.byteLength + 1);
    patch(ArrayBuffer.prototype, "slice", (b, a, r) => r.byteLength + 1);

    /*
     *  Objects: what lists their keys
     */
    for(const name of ["keys", "values", "entries", "getOwnPropertyNames", "fromEntries"]) {
        patch(Object, name, (o, a, r) => native_object_keys(r).length + 1);
    }
    patch(Object, "assign", (o, a) => {
        let sum = 1;
        for(let k = 1; k < a.length; k++) {
            if(a[k] && typeof a[k] === "object") {
                sum += native_object_keys(a[k]).length;
            }
        }
        return sum;
    });

    /*
     *  Functions of the global object, of JSON, of the encoders
     */
    for(const name of ["encodeURIComponent", "encodeURI", "decodeURIComponent", "decodeURI",
                       "escape", "unescape", "btoa", "atob"]) {
        patch(globalThis, name, (g, a) => whole(a[0]));
    }
    patch(JSON, "stringify", (j, a, r) => ((typeof r === "string")? r.length : 0) + 1);
    patch(JSON, "parse", (j, a) => whole(a[0]));
    patch(TextEncoder.prototype, "encode", (e, a, r) => r.length + 1);
    patch(TextEncoder.prototype, "encodeInto", (e, a, r) => r.read + r.written + 1);
    patch(TextDecoder.prototype, "decode", (d, a) => ((a[0] && a[0].byteLength) || 0) + 1);

    /*
     *  Iterators, one for each step: patched last, so the loops above
     *  are not counted
     */
    const iterators = [[][Symbol.iterator](), ""[Symbol.iterator](),
                       new Map()[Symbol.iterator](), new Set()[Symbol.iterator]()];
    for(let k = 0; k < iterators.length; k++) {
        patch(Object.getPrototypeOf(iterators[k]), "next", () => 1);
    }

    // only a synchronous call runs in between: nothing of vitest sees the patches
    try {
        return fn();
    } finally {
        for(let i = saved.length - 1; i >= 0; i--) {
            const [owner, name, orig] = saved[i];
            owner[name] = orig;
        }
    }
}

/*
 *  The work of one call of `mask` on `text`
 */
function work_of(mask, text)
{
    const before = work.n;
    with_native_work_counted(() => mask(text));
    return work.n - before;
}


describe("masking is linear and bounded", () => {
    /*
     *  Each shape is masked at 256 KB, 512 KB and 1 MB, as
     *  `unit` repeated r, 2r and 4r times, so the three texts are exactly
     *  in proportion. The work of each size is counted (it is the same on
     *  every run and every machine), and so is the work each character
     *  ADDS from one size to the next: from 256 KB to 512 KB, and from
     *  512 KB to 1 MB. A linear masking (a work of a*n + b) adds the same
     *  per character at both steps, whatever its a and b. A masking that
     *  also rescans adds more at the second step, and in proportion to
     *  how much it rescans.
     *
     *  The masking adds 1.00000 times as much at the second step as at
     *  the first on every shape here (1.00001 for "[pin]=\""), and the
     *  limit is 1.02. The counts are the same on every run, so no load
     *  moves the ratio. For a work of a*n + c*n*n the ratio is
     *  (a + 6cr)/(a + 3cr), r the repeats of the smallest text: it
     *  passes 1.02 when c*n*n is 2.7% of a*n or more at 1 MB. That is
     *  2.7% of the COUNTED work: a rescan fails here when the work it is
     *  counted is that large, whatever the time it takes. An O(n log n)
     *  step fails too, on purpose: n log2 n alone adds
     *  (log2 n + 3)/(log2 n + 2) = 1.05 times as much at the second
     *  step, so a sort of n elements after the masking, with a
     *  comparator (its calls count) or without one (n log2 n), fails
     *  when its count is a large enough part of the masking's. What the
     *  model does not see counts 1.00000 -- a regular expression that
     *  backtracks within one call, a string built with `+=` that
     *  charCodeAt() flattens -- and secret_masking_time.test.js is
     *  there for it.
     */
    const SIZES = [256*1024, 512*1024, 1024*1024];
    const STEP_LIMIT = 1.02;

    /*  The limit of the case: a guard, a masking that took a time of
     *  quadratic order would never end. Under coverage (vite.config.js
     *  provides it) every line runs some ten times slower.  */
    const CASE_LIMIT_MS = inject("coverage") ? 600000 : 120000;

    function check_counted_linear(what, unit, mask)
    {
        const r = Math.floor(SIZES[0] / unit.length);
        const texts = [unit.repeat(r), unit.repeat(2*r), unit.repeat(4*r)];
        const w = texts.map((text) => work_of(mask, text));
        const step1 = (w[1] - w[0]) / r;
        const step2 = (w[2] - w[1]) / (2*r);
        const ratio = step2 / step1;
        const seen = `work ${w.join(" / ")}, per unit added ${step1.toFixed(2)} then ${step2.toFixed(2)}`;
        expect(step1, `${what} of "${unit}": ${seen}: nothing counted`).toBeGreaterThan(0);
        expect(ratio, `${what} of "${unit}": ${seen}`).toBeLessThan(STEP_LIMIT);
        return ratio;
    }

    test("the work is counted: count_work_plugin.js is on the source", () => {
        expect(work, "vite.config.js runs this file without count_work_plugin.js").toBeTruthy();
        const n = 64*1024;
        const counted = work_of((text) => mask_secrets_inline(text), "a=".repeat(n/2));
        expect(counted).toBeGreaterThan(n);
        expect(work_of((text) => mask_secrets_inline(text), "a=".repeat(n/2))).toBe(counted);
    });

    test("every shape does a counted work linear in its size", () => {
        expect(mask_secrets_inline("a=".repeat(512*1024))).toBe(null);
        expect(mask_secrets_inline("abcd=".repeat(210*1024))).toBe(null);
        expect(mask_secrets_inline("password=" + "x".repeat(1024*1024))).toBe("password=********");
        for(const [what, unit, mask] of MASKING_SHAPES) {
            check_counted_linear(what, unit, mask);
        }
    }, CASE_LIMIT_MS);

    test("a text over 4 MB is not shown, and nothing is shown past the cap", () => {
        const huge = "a=b " + "x".repeat(5*1024*1024);
        expect(mask_secrets_inline(huge)).toBe("<not shown: too large to mask>");
        const shown = json_mask_secrets({big: "y".repeat(5*1024*1024), after: "z"});
        expect(shown.big).toBe("<not shown: too large to mask>");
        expect(shown.after).toBe(undefined);    // the walk stopped:
        expect(shown["<more>"]).toBe("<not shown: too large to mask>");  // one placeholder
    }, 10000);
});
