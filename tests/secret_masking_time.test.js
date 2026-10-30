/***********************************************************************
 *          secret_masking_time.test.js
 *
 *      The masking of secrets takes a time linear in the size of what it
 *      masks: no shape of text makes it rescan.
 *
 *      This is the check of what secret_masking_linear.test.js cannot
 *      count: the work done INSIDE a native method that it has no model
 *      of (a regular expression that backtracks within one call, a
 *      string built with `+=` that a read of a character flattens, an
 *      allocation, a method of a built-in that it does not patch). That
 *      test counts every other work exactly; this one times the masking,
 *      so it sees all of it, but only a rescan big enough to stand out
 *      of the noise of a time.
 *
 *      It runs in the project `unit` (vite.config.js), on the source as it
 *      is, in a process where no built-in was ever patched: once
 *      RegExp.prototype.exec has been replaced, as the counting test does,
 *      V8 sends every regular expression of the process to its slow path
 *      for good, and a `split(/=/)` of a large text then takes up to
 *      twice as long per character as of a small one.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, inject } from "vitest";
import { mask_secrets_inline } from "../src/index.js";
import { MASKING_SHAPES } from "./secret_masking_shapes.js";

/*
 *  The CPU time of this thread, in ms: a load that takes the CPU away
 *  from it does not count
 */
const cpu_ms = (typeof process.threadCpuUsage === "function")?
    () => {
        const u = process.threadCpuUsage();
        return (u.user + u.system) / 1000;
    } :
    () => performance.now();

describe("masking takes a time linear in the size", () => {
    /*
     *  Each shape is masked at 256 KB fifteen times and at 3.75 MB once
     *  (under MASK_MAX_BYTES with the "password=" of the secret value):
     *  the same amount of work, timed one after the other, so a load hits
     *  both alike. A linear masking takes about the same time for both;
     *  a rescan whose work grows as the square of the size takes, per
     *  character, 15 times as much more at 3.75 MB as at 256 KB. A shape
     *  passes at the first pair whose ratio of times is under the limit,
     *  and fails when TIME_ROUNDS pairs are all over it.
     *
     *  The masking gives 0.88 to 1.22 on an idle machine and 0.55 to
     *  1.43 with eight suites at once on four cores; a single pass of a
     *  regular expression added to it (while(re.exec()), replace(/=/g,
     *  fn), matchAll(), split(/=/)), 1.26 at most. A rescan to the end
     *  from one position in k, with k set for each shape so that at 1 MB
     *  it takes 0.3 times the time of the masking there, fails on 19 to
     *  23 shapes of 23 whatever it is made of (1.96 to 4.70 for a string
     *  built with `+=` that charCodeAt() flattens, 1.49 to 2.83 for one
     *  regular expression call that backtracks, which no count sees),
     *  and on all 23 at 1 times; under the load of eight suites, the
     *  five tried still fail on 18 to 23.
     */
    const TIME_SIZE = 256*1024;
    const TIME_TIMES = 15;
    const TIME_LIMIT = 1.5;
    const TIME_ROUNDS = 4;

    function check_timed_linear(what, unit, mask)
    {
        const r = Math.floor(TIME_SIZE / unit.length);
        const small = unit.repeat(r);
        const large = unit.repeat(TIME_TIMES*r);
        mask(small);
        mask(large);    // the first call of a size also pays for the heap that grows
        const ratios = [];
        for(let round = 0; round < TIME_ROUNDS; round++) {
            let t0 = cpu_ms();
            for(let i = 0; i < TIME_TIMES; i++) {
                mask(small);
            }
            const t_small = cpu_ms() - t0;
            t0 = cpu_ms();
            mask(large);
            const t_large = cpu_ms() - t0;
            ratios.push(t_large / t_small);
            if(t_large / t_small < TIME_LIMIT) {
                return;
            }
        }
        const seen = ratios.map((ratio) => ratio.toFixed(2)).join(", ");
        expect(Math.min(...ratios), `${what} of "${unit}": time of 3.75 MB / 15 x 256 KB: ${seen}`)
            .toBeLessThan(TIME_LIMIT);
    }

    /*
     *  Under coverage (vite.config.js provides it) every line runs some
     *  ten times slower, and what is timed is the coverage: not run
     */
    test.skipIf(inject("coverage"))("every shape takes a time linear in its size", () => {
        expect(mask_secrets_inline("password=" + "x".repeat(TIME_TIMES*TIME_SIZE)))
            .toBe("password=********");
        for(const [what, unit, mask] of MASKING_SHAPES) {
            check_timed_linear(what, unit, mask);
        }
    }, 300000);
});
