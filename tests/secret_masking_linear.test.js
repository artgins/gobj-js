/***********************************************************************
 *          secret_masking_linear.test.js
 *
 *      The masking of secrets does a work linear in the size of what it
 *      masks: no shape of text makes it rescan.
 *
 *      The work is COUNTED, so the machine and its load do not change
 *      the answer. vite.config.js runs this file in a vitest project of
 *      its own: count_work_plugin.js adds a tick to every function, every
 *      loop and every arrow function of src/, and a hook wherever the
 *      language reads with no call; count_native_setup.js wraps every
 *      native function of the runtime, and count_native_work.js charges
 *      each one what it reads, ALL it is given when it has no model, and a
 *      regular expression the steps regex_steps.js counts. So a rescan
 *      shows however it is made (fixtures/masking_rescans.js is the proof:
 *      each entry there must fail this count), and what still escapes
 *      is listed in count_native_work.js. secret_masking_time.test.js
 *      times the same shapes (secret_masking_shapes.js) for what no count
 *      can see.
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
import {
    install_native_work_counting,
    with_native_work_counted,
    check_same_answer,
} from "./count_native_work.js";
import { RESCANS, SORTS, LINEAR_WORKS } from "./fixtures/masking_rescans.js";

/*
 *  The counter of count_work_plugin.js, created when src/ loads
 */
const work = globalThis.__gobj_js_work;

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
     *  when its count is a large enough part of the masking's.
     */
    const SIZES = [256*1024, 512*1024, 1024*1024];
    const STEP_LIMIT = 1.02;

    /*  The limit of the case: a guard, a masking that took a time of
     *  quadratic order would never end. Under coverage (vite.config.js
     *  provides it) every line runs some ten times slower.  */
    const CASE_LIMIT_MS = inject("coverage") ? 600000 : 120000;

    function counted_steps(what, unit, mask, smallest = SIZES[0])
    {
        const r = Math.floor(smallest / unit.length);
        const texts = [unit.repeat(r), unit.repeat(2*r), unit.repeat(4*r)];
        const w = texts.map((text) => work_of(mask, text));
        const step1 = (w[1] - w[0]) / r;
        const step2 = (w[2] - w[1]) / (2*r);
        const seen = `${what} of "${unit}": work ${w.join(" / ")}, ` +
            `per unit added ${step1.toFixed(2)} then ${step2.toFixed(2)}`;
        expect(step1, `${seen}: nothing counted`).toBeGreaterThan(0);
        return {ratio: step2 / step1, seen};
    }

    function check_counted_linear(what, unit, mask)
    {
        const {ratio, seen} = counted_steps(what, unit, mask);
        expect(ratio, seen).toBeLessThan(STEP_LIMIT);
    }

    /*
     *  A masking with `extra` after it (fixtures/masking_rescans.js), at
     *  16, 32 and 64 KB with a start of the rescan in each 4 KB: what the
     *  model sees does not depend on the size, and the count is exact.
     */
    const EXTRA_SMALLEST = 16*1024;
    const EXTRA_START_EACH = 4*1024;

    function masking_and(extra)
    {
        return (text) => {
            const shown = mask_secrets_inline(text);
            extra(text, new Uint8Array(text.length), EXTRA_START_EACH);
            return shown;
        };
    }

    test("the work is counted: count_work_plugin.js is on the source", () => {
        expect(work, "vite.config.js runs this file without count_work_plugin.js").toBeTruthy();
        const n = 64*1024;
        const counted = work_of((text) => mask_secrets_inline(text), "a=".repeat(n/2));
        expect(counted).toBeGreaterThan(n);
        expect(work_of((text) => mask_secrets_inline(text), "a=".repeat(n/2))).toBe(counted);
    });

    test("the natives are wrapped: count_native_setup.js ran before src/", () => {
        expect(install_native_work_counting()).toBeGreaterThan(500);
        expect(String.prototype.indexOf.toString()).not.toContain("[native code]");
        expect(Math.max.toString()).not.toContain("[native code]");
    });

    test("a machine that disagrees with the native exec() stops the count", () => {
        const answer = /(a)b/.exec("xab");
        const same = {index: 1, end: 3, groups: [[1, 2]]};
        expect(() => check_same_answer(/(a)b/, "xab", same, answer)).not.toThrow();
        for(const other of [{...same, index: 0}, {...same, end: 2}, {...same, groups: [[2, 3]]},
                            {index: -1, end: -1, groups: []}]) {
            expect(() => check_same_answer(/(a)b/, "xab", other, answer)).toThrow(/disagree/);
        }
        expect(() => check_same_answer(/(a)b/, "xab", same, null)).toThrow(/disagree/);
    });

    test("every shape does a counted work linear in its size", () => {
        expect(mask_secrets_inline("a=".repeat(512*1024))).toBe(null);
        expect(mask_secrets_inline("abcd=".repeat(210*1024))).toBe(null);
        expect(mask_secrets_inline("password=" + "x".repeat(1024*1024))).toBe("password=********");
        for(const [what, unit, mask] of MASKING_SHAPES) {
            check_counted_linear(what, unit, mask);
        }
    }, CASE_LIMIT_MS);

    test.each(Object.keys(RESCANS))("a rescan fails the count: %s", (name) => {
        const {ratio, seen} = counted_steps(name, "a=", masking_and(RESCANS[name]), EXTRA_SMALLEST);
        expect(ratio, seen).toBeGreaterThan(STEP_LIMIT);
    }, CASE_LIMIT_MS);

    test("an O(n log n) step fails the count, on purpose: a sort with a comparator", () => {
        const name = "a sort with a comparator";
        const {ratio, seen} = counted_steps(name, "a=", masking_and(SORTS[name]), EXTRA_SMALLEST);
        expect(ratio, seen).toBeGreaterThan(STEP_LIMIT);
    }, CASE_LIMIT_MS);

    test("an O(n log n) step fails the count, on purpose: a native sort alone", () => {
        const name = "Float64Array's sort()";
        const {ratio, seen} = counted_steps(name, "a=", SORTS[name], EXTRA_SMALLEST);
        expect(ratio, seen).toBeGreaterThan(STEP_LIMIT);
    }, CASE_LIMIT_MS);

    test.each(Object.keys(LINEAR_WORKS))("a linear work passes the count: %s", (name) => {
        const {ratio, seen} = counted_steps(name, "a=", masking_and(LINEAR_WORKS[name]), EXTRA_SMALLEST);
        expect(ratio, seen).toBeLessThan(STEP_LIMIT);
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
