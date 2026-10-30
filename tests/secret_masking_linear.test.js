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
 *      work of the native methods it has a model of
 *      (with_native_work_counted()). What runs inside a native method
 *      with no model here is not counted: secret_masking_time.test.js
 *      times the same shapes (secret_masking_shapes.js) for it.
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
 *  The work of the native methods, added to the counter while `fn`
 *  runs: a search, the positions it reads to where it found (or to the
 *  end); a copy or a conversion, what it reads or makes; a regular
 *  expression, the text from where it starts to the end of its match
 *  (to the end when none, one position when it is sticky): String's
 *  replace(), match(), matchAll(), search() and split() with a regular
 *  expression run its exec() for each match, and test() runs it too, so
 *  exec() counts them. The O(1) readers (charCodeAt, an element by
 *  index, subarray) are not counted: they run inside a loop, and the
 *  loop counts; nor are the methods that call back (some, find, ...):
 *  the callback counts. What runs inside a method with no model here is
 *  not counted: secret_masking_time.test.js sees it.
 */
function with_native_work_counted(fn)
{
    const S = String.prototype;
    const R = RegExp.prototype;
    const A = Array.prototype;
    const T = Object.getPrototypeOf(Uint8Array.prototype);
    const saved = [];
    const patch = (owner, name, cost, before) => {
        const orig = owner[name];
        saved.push([owner, name, orig]);
        owner[name] = function(...args) {
            const at = before? before(this, args) : 0;
            const result = orig.apply(this, args);
            work.n += cost(this, args, result, at);
            return result;
        };
    };
    const whole = (s) => String(s).length + 1;
    const made = (s, a, r) => r.length + 1;

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
    patch(S, "concat", (s, a) => a.reduce((sum, x) => sum + String(x).length, 0) + 1);
    for(const name of ["split", "toLowerCase", "toUpperCase", "trim", "trimStart", "trimEnd",
                       "normalize", "replace", "replaceAll", "match", "matchAll",
                       "search", "localeCompare"]) {
        patch(S, name, (s) => whole(s));
    }
    patch(String, "fromCharCode", (s, a) => a.length + 1);
    patch(String, "fromCodePoint", (s, a) => a.length + 1);

    /*
     *  Regular expressions
     */
    patch(R, "exec", (re, a, r, from) => {
        const n = String(a[0]).length;
        if(r === null) {
            return (re.sticky || from > n)? 1 : n - from + 1;
        }
        return r.index + r[0].length - from + 1;
    }, (re) => ((re.global || re.sticky)? re.lastIndex : 0));

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
        patch(owner, "slice", made);
        patch(owner, "join", made);
        patch(owner, "fill", (arr, a) => relative_index(arr.length, a[2], arr.length) -
            relative_index(arr.length, a[1], 0) + 1);
        patch(owner, "copyWithin", (arr) => arr.length + 1);
        patch(owner, "reverse", (arr) => arr.length + 1);
    }
    patch(A, "concat", made);
    patch(A, "unshift", (arr, a, r) => r + 1);
    patch(A, "splice", (arr, a) => arr.length - relative_index(arr.length, a[0], 0) + a.length + 1);
    patch(T, "set", (arr, a) => ((a[0] && a[0].length) || 0) + 1);

    /*
     *  Functions of the global object and of JSON
     */
    for(const name of ["encodeURIComponent", "encodeURI", "decodeURIComponent", "decodeURI",
                       "escape", "unescape"]) {
        patch(globalThis, name, (g, a) => whole(a[0]));
    }
    patch(JSON, "stringify", (j, a, r) => ((typeof r === "string")? r.length : 0) + 1);
    patch(JSON, "parse", (j, a) => whole(a[0]));

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
     *  moves the ratio. A rescan to the end from one position in k,
     *  with k set for each shape so that at 1 MB it takes 0.3 times the
     *  time of the masking there, fails on every shape when it is made
     *  of String.indexOf(), Uint8Array's indexOf(), lastIndexOf() or
     *  slice(), Array's includes() or unshift(), encodeURIComponent() or
     *  JSON.stringify() (1.03 to 1.99); made of a JS loop, on 22 shapes
     *  of 23, and of an arrow function that some() calls, on 21 (on all
     *  of them at 1 times the masking). A single pass of a regular expression counts linear
     *  (1.00000 for while(re.exec()), replace(/=/g, fn), matchAll() and
     *  split(/=/)). An O(n log n) step fails too, on purpose: n log n
     *  alone adds (log2 n + 3)/(log2 n + 2) = 1.05 times as much at the
     *  second step, and a sort of n numbers after the masking gave 1.009
     *  to 1.027 (6 shapes of 23 over the limit). Not counted, and left to
     *  secret_masking_time.test.js: a string built with `+=` that
     *  charCodeAt() flattens, and a regular expression that backtracks
     *  within one call (1.00000 for both).
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
