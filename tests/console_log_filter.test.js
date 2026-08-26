/***********************************************************************
 *          console_log_filter.test.js
 *
 *      The console write happens BEFORE the log sink is called, so
 *      nothing downstream can un-print a line. A consumer that wants a
 *      class of lines kept off the console -- the dev monitor silencing
 *      the timer traffic of the `machine` trace, two lines a second for
 *      ever -- has to be able to say so HERE.
 *
 *      What these pin: the filter decides the console and nothing else.
 *      The sink still receives every line, the master switch still wins,
 *      and a filter that throws can never silence the log.
 ***********************************************************************/
import { describe, test, expect, beforeEach, afterEach } from "vitest";

/*  The console is STUBBED BEFORE the module is imported, and that is not
 *  ceremony: helpers.js captures `console.debug` & co. into `f_debug` & co.
 *  at import time, so a spy installed on the console object afterwards is
 *  never the function it calls. Stub first, import second.  */
let calls = [];
for(const name of ["error", "warn", "info", "log", "debug", "dir"]) {
    console[name] = (...args) => { calls.push([name, args]); };
}

const {
    log_error,
    log_warning,
    log_info,
    log_debug,
    trace_msg,
    set_log_callback,
    set_console_log_enabled,
    set_console_log_filter,
} = await import("../src/helpers.js");

let sunk;

beforeEach(() => {
    calls = [];
    sunk = [];
    set_log_callback((level, msg) => { sunk.push([level, String(msg)]); });
});

afterEach(() => {
    set_console_log_filter(null);
    set_console_log_enabled(true);
    set_log_callback(null);
});

const console_calls = () => calls.length;

describe("set_console_log_filter", () => {
    test("no filter is the behaviour there has always been", () => {
        log_debug("hello");
        expect(console_calls()).toBe(1);
        expect(sunk).toEqual([["debug", "hello"]]);
    });

    test("a filter decides line by line", () => {
        set_console_log_filter((level, msg) => String(msg).indexOf("noise") < 0);
        log_debug("noise noise noise");
        expect(console_calls()).toBe(0);
        log_debug("something happened");
        expect(console_calls()).toBe(1);
    });

    test("it sees the LEVEL, so it can spare the loud ones", () => {
        let seen = [];
        set_console_log_filter((level) => {
            seen.push(level);
            return level === "error" || level === "warning";
        });
        log_debug("d");
        trace_msg("m");
        log_info("i");
        log_warning("w");
        log_error("e");
        expect(seen).toEqual(["debug", "msg", "info", "warning", "error"]);
        expect(console_calls()).toBe(2);
    });

    test("the SINK still gets everything the filter hides", () => {
        set_console_log_filter(() => false);
        log_debug("d");
        log_error("e");
        expect(console_calls()).toBe(0);
        expect(sunk).toEqual([["debug", "d"], ["error", "e"]]);
    });

    test("the master switch still wins: off is off", () => {
        set_console_log_enabled(false);
        set_console_log_filter(() => true);
        log_error("e");
        expect(console_calls()).toBe(0);
    });

    test("a filter that THROWS can never silence the log", () => {
        set_console_log_filter(() => { throw new Error("broken"); });
        log_error("e");
        log_debug("d");
        expect(console_calls()).toBe(2);
    });

    test("null clears it", () => {
        set_console_log_filter(() => false);
        log_debug("d");
        expect(console_calls()).toBe(0);
        set_console_log_filter(null);
        log_debug("d");
        expect(console_calls()).toBe(1);
    });

    test("anything that is not a function clears it too", () => {
        set_console_log_filter(() => false);
        set_console_log_filter("nonsense");
        log_debug("d");
        expect(console_calls()).toBe(1);
    });
});
