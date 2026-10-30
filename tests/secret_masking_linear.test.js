/***********************************************************************
 *          secret_masking_linear.test.js
 *
 *      The masking of secrets does a work linear in the size of what it
 *      masks: no shape of text makes it rescan.
 *
 *      The work is COUNTED, not timed, so the machine and its load do
 *      not change the answer. vite.config.js runs this file in a vitest
 *      project of its own, whose count_work_plugin.js adds a tick to
 *      every function and every loop of src/; this file adds the
 *      characters that the native string methods scan
 *      (with_native_scans_counted()).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, inject } from "vitest";
import {
    mask_secrets_inline,
    json_mask_secrets,
} from "../src/index.js";

/*
 *  The counter of count_work_plugin.js, created when src/ loads
 */
const work = globalThis.__gobj_js_work;

/*
 *  The characters each native method of a string scans, added to the
 *  counter: a search, to where it found (or to the end); a copy or a
 *  conversion, the characters it reads; a regular expression, the text
 *  after its lastIndex. String.fromCharCode() counts its arguments and
 *  Array.prototype.join() what it makes. The O(1) readers (charCodeAt,
 *  a character by index) are not counted: they run inside a loop, and
 *  the loop counts.
 */
function search_cost(str, search, from, found)
{
    const start = Math.max(0, Math.min(str.length, Math.trunc(Number(from) || 0)));
    if(found < 0) {
        return str.length - start + 1;
    }
    return found - start + String(search).length + 1;
}

const native_index_of = String.prototype.indexOf;

function with_native_scans_counted(fn)
{
    const S = String.prototype;
    const R = RegExp.prototype;
    const A = Array.prototype;
    const saved = [];
    const patch = (owner, name, cost) => {
        const orig = owner[name];
        saved.push([owner, name, orig]);
        owner[name] = function(...args) {
            const result = orig.apply(this, args);
            work.n += cost(this, args, result, orig);
            return result;
        };
    };
    const whole = (s) => String(s).length + 1;

    patch(S, "indexOf", (s, a, r) => search_cost(s, a[0], a[1], r));
    patch(S, "includes", (s, a, r) => search_cost(s, a[0], a[1],
        r? native_index_of.call(s, a[0], a[1]) : -1));
    patch(S, "lastIndexOf", (s, a, r) => ((r < 0)? s.length : s.length - r) + 1);
    patch(S, "startsWith", (s, a) => String(a[0]).length + 1);
    patch(S, "endsWith", (s, a) => String(a[0]).length + 1);
    for(const name of ["substring", "slice", "substr", "repeat", "padStart", "padEnd"]) {
        patch(S, name, (s, a, r) => r.length + 1);
    }
    for(const name of ["split", "toLowerCase", "toUpperCase", "trim", "trimStart", "trimEnd",
                       "normalize", "concat", "replace", "replaceAll", "match", "matchAll",
                       "search", "localeCompare"]) {
        patch(S, name, (s) => whole(s));
    }
    patch(R, "exec", (re, a) => whole(a[0]) - (re.lastIndex || 0));
    patch(R, "test", (re, a) => whole(a[0]) - (re.lastIndex || 0));
    patch(String, "fromCharCode", (s, a) => a.length + 1);
    patch(String, "fromCodePoint", (s, a) => a.length + 1);
    patch(A, "join", (arr, a, r) => r.length + 1);

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
    with_native_scans_counted(() => mask(text));
    return work.n - before;
}

describe("masking is linear and bounded", () => {
    /*
     *  Each shape is masked at 256 KB, 512 KB and 1 MB, as `unit` repeated
     *  r, 2r and 4r times, so the three texts are exactly in proportion.
     *  The work of each size is counted (it is the same on every run and
     *  every machine), and so is the work each character ADDS from one
     *  size to the next: from 256 KB to 512 KB, and from 512 KB to 1 MB.
     *  A linear masking (a work of a*n + b) adds the same per character
     *  at both steps, whatever its a and b. A masking that also rescans
     *  adds more at the second step, and in proportion to how much it
     *  rescans.
     *
     *  The masking adds 1.00000 times as much at the second step as at
     *  the first on every shape here (1.00001 for "[pin]=\""), the limit
     *  is 1.02, and a masking that rescans goes far over it. Rescans to
     *  the end from one character in k, with k set so that at 1 MB they
     *  cost 0.3 times what the masking costs there, give 1.18 on every
     *  shape; set to cost as much as the masking (twice the work at
     *  1 MB), 1.42. The same with the rescans made by indexOf() instead
     *  of a loop. The counts are the same on every run, so no load moves
     *  the ratio.
     */
    const SIZES = [256*1024, 512*1024, 1024*1024];
    const STEP_LIMIT = 1.02;

    /*  The limit of the whole case: a guard, a masking that took a time
     *  of quadratic order would never end. Under coverage (vite.config.js
     *  provides it) every line runs some ten times slower.  */
    const CASE_LIMIT_MS = inject("coverage") ? 600000 : 120000;

    function check_linear(what, unit, mask)
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

    test("a 1 MB a=a=... word and a 1 MB secret value do a work linear in their size", () => {
        expect(mask_secrets_inline("a=".repeat(512*1024))).toBe(null);
        expect(mask_secrets_inline("abcd=".repeat(210*1024))).toBe(null);
        for(const unit of ["a=", "abcd=", " attribute=", "pin=\"", "abc?token=x&"]) {
            check_linear("mask_secrets_inline()", unit, (text) => mask_secrets_inline(text));
            check_linear("json_mask_secrets()", unit, (text) => json_mask_secrets({anything: text}));
        }

        // and the shapes that once ran long, as in C: a scheme word repeated, ':' after
        // secrets' names, a container that does not close, a JWT's dots
        for(const unit of ["Bearer ", "basic ", "token:", "\"pin\": {[", "eyJ.", "x-auth-token: \\\""]) {
            check_linear("mask_secrets_inline()", unit, (text) => mask_secrets_inline(text));
        }

        // and of 7.26.24: names in brackets and %-encoded, the userinfo of a URL
        for(const unit of ["[pin]=\"", "t%6Fken=x&", "a://b:c@", "p%3Dx%26", "%2541", "%25253D"]) {
            check_linear("mask_secrets_inline()", unit, (text) => mask_secrets_inline(text));
        }

        const value = "password=" + "x".repeat(1024*1024);
        expect(mask_secrets_inline(value)).toBe("password=********");
        check_linear("a secret value", "x", (text) => mask_secrets_inline("password=" + text));
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
