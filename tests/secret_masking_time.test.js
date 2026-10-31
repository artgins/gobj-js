/***********************************************************************
 *          secret_masking_time.test.js
 *
 *      The masking of secrets takes a time linear in the size of what it
 *      masks: no shape of text makes it rescan.
 *
 *      This is the check of what secret_masking_linear.test.js cannot
 *      count: an allocation, the collector, a cache, what a native really
 *      does where the count only knows what it was given, and what the
 *      list in count_native_work.js says escapes it. That test counts;
 *      this one times the masking, so it sees all of it, but only a
 *      rescan big enough to stand out of what a time varies.
 *
 *      It runs in the vitest project `timed` (vite.config.js), on the
 *      source as it is, in a process where no built-in was ever patched
 *      (once RegExp.prototype.exec has been replaced, as the counting
 *      test does, V8 keeps every regular expression of the process on
 *      its slow path), with `--expose-gc`, so that each measure starts
 *      from a collected heap, and a young generation that starts at
 *      256 MB and stays there (`--min-semi-space-size=256` and
 *      `--max-semi-space-size=256`). This is what keeps a linear work
 *      linear in time: a collection in the middle of a call copies all
 *      that is alive, and a call of 3.75 MB that builds a large string
 *      has all of it alive, where 15 calls of 256 KB have almost nothing.
 *      Without the minimum the space starts at 1 MB and grows by
 *      collecting, so the large call pays for that as well.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, inject } from "vitest";
import { mask_secrets_inline } from "../src/index.js";
import { MASKING_SHAPES } from "./secret_masking_shapes.js";

/*
 *  The CPU time of this thread, in ms: a load that takes the CPU away
 *  from it does not count. Without process.threadCpuUsage() there is
 *  only the time of the wall, which any load moves: the test is
 *  skipped, and says so.
 */
const HAS_THREAD_CPU = (typeof process.threadCpuUsage === "function");

function cpu_ms()
{
    const u = process.threadCpuUsage();
    return (u.user + u.system) / 1000;
}

const SKIP_REASON = HAS_THREAD_CPU? "" :
    " (SKIPPED: this Node has no process.threadCpuUsage(), and a time of the wall is not a measure)";
if(!HAS_THREAD_CPU) {
    console.warn("secret_masking_time.test.js" + SKIP_REASON);
}

describe("masking takes a time linear in the size", () => {
    /*
     *  Each shape is masked at 256 KB fifteen times and at 3.75 MB once
     *  (under MASK_MAX_BYTES with the "password=" of the secret value):
     *  the same amount of work. Each round times both, each after a
     *  collection of the heap; the ratio is that of the BEST time of
     *  each size over the rounds so far, so a round that a load slowed
     *  is left out of either size. A shape passes at the first round
     *  whose ratio is under the limit, and fails when TIME_ROUNDS
     *  rounds are all over it.
     *
     *  A rescan whose work grows as the square of the size takes, per
     *  character, 15 times as much more at 3.75 MB as at 256 KB: one
     *  that takes c times the masking at 1 MB gives (1 + 3.75c)/(1 + c/4)
     *  over a masking whose time is exactly linear: 3.8 at c = 1, 1.98 at
     *  c = 0.3, and 1.6, the limit, at c = 0.18. A linear work is close to
     *  that but not on it: 256 KB and what is made from it stay in a
     *  core's cache and 3.75 MB does not, so a linear work whose memory
     *  grows with the text can take longer per character at 3.75 MB, and
     *  how much depends on the machine and on who shares its cache. That
     *  adds to a rescan too, so it only makes one fail sooner. A linear
     *  work that goes over the limit in all the rounds is a false red,
     *  and a machine where one does needs another limit, not a rescan
     *  hunted in the masking. The figures, with the machine and the load
     *  they were measured under, are in CHANGELOG.md.
     */
    const TIME_SIZE = 256*1024;
    const TIME_TIMES = 15;
    const TIME_LIMIT = 1.6;
    const TIME_ROUNDS = 6;

    /*
     *  The time of a thread can advance in steps (of 4 ms in a VM with a
     *  tick of 250 Hz): a measure is at least 50 of them, so one step is
     *  2% of it. Over a call that takes less, the call repeats.
     */
    const MIN_MEASURE_MS = 200;
    const MAX_PASSES = 8;

    function check_timed_linear(what, unit, mask)
    {
        const r = Math.floor(TIME_SIZE / unit.length);
        const small = unit.repeat(r);
        const large = unit.repeat(TIME_TIMES*r);
        mask(small);
        mask(large);    // the first call of a size also pays for the heap that grows
        const first = cpu_ms();
        mask(large);
        const passes = Math.min(MAX_PASSES, Math.ceil(MIN_MEASURE_MS / Math.max(1, cpu_ms() - first)));
        let best_small = Infinity;
        let best_large = Infinity;
        const seen = [];
        for(let round = 0; round < TIME_ROUNDS; round++) {
            globalThis.gc();
            let t0 = cpu_ms();
            for(let i = 0; i < passes*TIME_TIMES; i++) {
                mask(small);
            }
            best_small = Math.min(best_small, cpu_ms() - t0);
            globalThis.gc();
            t0 = cpu_ms();
            for(let i = 0; i < passes; i++) {
                mask(large);
            }
            best_large = Math.min(best_large, cpu_ms() - t0);
            const ratio = best_large / best_small;
            seen.push(ratio.toFixed(2));
            if(ratio < TIME_LIMIT) {
                return;
            }
        }
        expect(best_large / best_small,
            `${what} of "${unit}": best time of 3.75 MB / of 15 x 256 KB, round by round: ${seen.join(", ")}`)
            .toBeLessThan(TIME_LIMIT);
    }

    /*
     *  Under coverage (vite.config.js provides it) every line runs some
     *  ten times slower, and what is timed is the coverage: not run
     */
    test.skipIf(inject("coverage") || !HAS_THREAD_CPU)("every shape takes a time linear in its size" + SKIP_REASON, () => {
        expect(typeof globalThis.gc, "vite.config.js runs this file without --expose-gc").toBe("function");
        expect(mask_secrets_inline("password=" + "x".repeat(TIME_TIMES*TIME_SIZE)))
            .toBe("password=********");
        for(const [what, unit, mask] of MASKING_SHAPES) {
            check_timed_linear(what, unit, mask);
        }
    }, 300000);
});
