/***********************************************************************
 *          secret_masking_linear.test.js
 *
 *      The masking of secrets takes a time linear in the size of what
 *      it masks: no shape of text makes it rescan.
 *
 *      This file TIMES what it checks, so vite.config.js runs it in a
 *      group of its own, after every other test file has ended: the
 *      other files of a parallel run are not there to compete for the
 *      CPU while it measures.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, inject } from "vitest";
import {
    mask_secrets_inline,
    json_mask_secrets,
} from "../src/index.js";

describe("masking is linear and bounded", () => {
    /*
     *  Each shape is masked at 64 KB, 256 KB and 1 MB, and the slope of
     *  log(time) on log(size) is fitted over the three: 1 for a linear
     *  masking, 2 for a quadratic one. A time is the best of every pass
     *  made so far, the three sizes taken in turn in each pass, so that a
     *  load slows a pass and not one size; a call is repeated for 10 ms and
     *  its time is the mean, so that the grain of the timer makes no slope.
     *
     *  A load only ever makes a time LONGER, so the best time of a size is
     *  the one to fit, and it is kept across the measures of a shape: a
     *  shape is measured in rounds of five passes, up to six rounds, and
     *  fails only if the slope of the best times is still steep after the
     *  last. One clean pass of each size is enough, wherever it falls:
     *  under load the compiler can be late for one size in all five passes
     *  of a round (1 MB of "a=" measured twice its time once in 20 runs of
     *  two suites at a time). A quadratic masking is steep in every pass,
     *  so its best times are steep too.
     *
     *  Measured with the machine idle and with every core busy, on every
     *  shape here: the masking gives 0.98 to 1.09; a copy of it that also
     *  rescans to the end from every k-th character, k set so that the
     *  rescans cost what the masking costs at 1 MB (twice the time there,
     *  eight times at 4 MB), gives 1.16 to 1.45. A ratio of 1 MB to
     *  256 KB in place of the slope fails under load and lets that copy
     *  pass (6.4 against a limit of 8). The slowest shapes here take some
     *  50 ms for 1 MB on an idle machine; quadratic in earnest, a shape
     *  would not end in the time of the test.
     */
    const SIZES = [64*1024, 256*1024, 1024*1024];
    const PASSES_PER_ROUND = 5;
    const ROUNDS = 6;
    const SLOPE_LIMIT = 1.15;

    /*  The limit of the whole case, a guard and not what is measured: the
     *  slope does not depend on how fast a line runs. Under coverage
     *  (vite.config.js provides it) every line runs some ten times slower:
     *  120 s alone, 116-120 s measured on vitest 4 and 5, so in a full
     *  parallel run it went over. Ten minutes there; 120 s otherwise.  */
    const CASE_LIMIT_MS = inject("coverage") ? 600000 : 120000;

    function ms_per_call(mask, text)
    {
        let calls = 0;
        let elapsed = 0;
        const t0 = performance.now();
        do {
            mask(text);
            calls++;
            elapsed = performance.now() - t0;
        } while(elapsed < 10);
        return elapsed / calls;
    }

    function measure_round(mask, texts, best)
    {
        for(let pass = 0; pass < PASSES_PER_ROUND; pass++) {
            for(let i = 0; i < SIZES.length; i++) {
                best[i] = Math.min(best[i], ms_per_call(mask, texts[i]));
            }
        }
    }

    function slope_of(best)
    {
        const xs = SIZES.map((size) => Math.log(size));
        const ys = best.map((ms) => Math.log(ms));
        const mean_x = (xs[0] + xs[1] + xs[2]) / 3;
        const mean_y = (ys[0] + ys[1] + ys[2]) / 3;
        let num = 0;
        let den = 0;
        for(let i = 0; i < SIZES.length; i++) {
            num += (xs[i] - mean_x) * (ys[i] - mean_y);
            den += (xs[i] - mean_x) * (xs[i] - mean_x);
        }
        return num / den;
    }

    function check_linear(what, unit, mask)
    {
        const texts = SIZES.map((size) => unit.repeat(Math.floor(size / unit.length)));
        for(const text of texts) {
            mask(text);     // the first runs compile
        }
        const best = SIZES.map(() => Infinity);
        const seen = [];
        let slope = Infinity;
        for(let round = 0; round < ROUNDS; round++) {
            measure_round(mask, texts, best);
            slope = slope_of(best);
            seen.push(`${slope.toFixed(2)} (${best.map((ms) => ms.toFixed(2)).join(" / ")} ms)`);
            if(slope < SLOPE_LIMIT) {
                break;
            }
        }
        expect(slope, `${what} of "${unit}": ${seen.join(", ")}`).toBeLessThan(SLOPE_LIMIT);
    }

    test("a 1 MB a=a=... word and a 1 MB secret value take a time linear in their size", () => {
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
