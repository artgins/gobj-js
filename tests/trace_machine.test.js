/***********************************************************************
 *          trace_machine.test.js
 *
 *      The machine trace is the framework's whole debugging story: the
 *      FSM is where things happen, so the trace of the FSM IS the
 *      execution log. In the JS port it had been cut -- the calls were
 *      in gobj.js but commented out, and `tracea` was hard-wired to a
 *      yuno attr -- so an app could not ask "what happened?" the way
 *      the C kernel answers it.
 *
 *      These tests pin the CONTRACT, level by level, and in the shape
 *      the C kernel defines it (gobj.c's is_machine_tracing):
 *
 *        - off by default: silence costs nothing,
 *        - global, per-gclass and per-gobj each turn it on alone,
 *        - the SOURCE can veto with a no-trace level,
 *        - `timer` / `timer_periodic` light up for their own event only,
 *        - the bits are the C kernel's bits, so a level means the same
 *          thing on both sides.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_start,
    gobj_send_event,
    gobj_set_global_trace,
    gobj_set_global_no_trace,
    gobj_set_gclass_trace,
    gobj_set_gobj_trace,
    gobj_set_gobj_no_trace,
    gobj_set_gclass_no_trace,
    gobj_global_trace_level,
    gobj_trace_level,
    gobj_repr_global_trace_levels,
    trace_level_t,
    set_log_callback,
} from "../src/index.js";

const debugged = [];

/*
 *  Read the trace through the framework's own sink rather than by
 *  stubbing the console: set_log_callback() is the supported way to
 *  mirror log lines somewhere else (it is what gobj-ui's dev monitor
 *  uses), and it does not depend on whether the test environment has
 *  a `window` for helpers.js to have captured at import time.
 */
set_log_callback((level, msg) => {
    if(level === "debug") {
        debugged.push(String(msg));
    }
});

const yuno_attrs = [
SDATA(data_type_t.DTP_BOOLEAN, "trace_creation",   0, 0, "trace create/delete"),
SDATA(data_type_t.DTP_BOOLEAN, "trace_start_stop", 0, 0, "trace start/stop"),
SDATA_END()
];

let dst = null;
let src = null;
let nester = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);

    gclass_create("C_TRACE_YUNO", [], [["ST_IDLE", []]], {}, 0, yuno_attrs, {}, 0, 0, 0, 0);

    /*  The gobj under trace: one state, one event, no action needed --
     *  what is measured is the trace, not what the action does.  */
    gclass_create(
        "C_TRACED",
        [["EV_PING", 0], ["EV_TIMEOUT", 0], ["EV_TIMEOUT_PERIODIC", 0]],
        [["ST_IDLE", [
            ["EV_PING",             () => 0, null],
            ["EV_TIMEOUT",          () => 0, null],
            ["EV_TIMEOUT_PERIODIC", () => 0, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    gclass_create("C_SENDER", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);

    /*  A gobj whose action sends ANOTHER event: the only way to get a
     *  nested line, which is what the indentation is for.  */
    gclass_create(
        "C_NESTER",
        [["EV_OUTER", 0]],
        [["ST_IDLE", [
            ["EV_OUTER", (gobj) => gobj_send_event(dst, "EV_PING", {}, gobj), null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    const yuno = gobj_create_yuno("trace_yuno", "C_TRACE_YUNO", {});
    dst = gobj_create("traced", "C_TRACED", {}, yuno);
    src = gobj_create("sender", "C_SENDER", {}, yuno);
    nester = gobj_create("nester", "C_NESTER", {}, yuno);
    gobj_start(dst);
    gobj_start(nester);
});

beforeEach(() => {
    debugged.length = 0;
    /*  Every level used here off, so one test never leaks into the
     *  next.  Note "" is NOT a blanket reset: it means
     *  TRACE_GLOBAL_LEVEL1 (0x0FFF0000), exactly as in the C kernel,
     *  so it leaves timer_periodic and commands untouched.  */
    for(const lvl of ["machine", "states", "ev_kw", "timer", "timer_periodic"]) {
        gobj_set_global_trace(lvl, false);
        gobj_set_global_no_trace(lvl, false);
        gobj_set_gclass_trace("C_TRACED", lvl, false);
        gobj_set_gobj_trace(dst, lvl, false);
        gobj_set_gobj_no_trace(src, lvl, false);
        gobj_set_gclass_no_trace("C_SENDER", lvl, false);
    }
});

const traced = () => debugged.filter((l) => l.includes("EV_PING"));

describe("machine trace", () => {
    test("is off by default", () => {
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced()).toEqual([]);
    });

    test("the global level turns it on, and off again", () => {
        gobj_set_global_trace("machine", true);
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced().length).toBeGreaterThan(0);

        debugged.length = 0;
        gobj_set_global_trace("machine", false);
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced()).toEqual([]);
    });

    test("names the destination, the state and the event", () => {
        gobj_set_global_trace("machine", true);
        gobj_send_event(dst, "EV_PING", {}, src);

        const line = traced()[0];
        expect(line).toContain("C_TRACED");
        expect(line).toContain("traced");
        expect(line).toContain("ST_IDLE");
        expect(line).toContain("EV_PING");
        /*  And who sent it: half the value of the trace is the sender. */
        expect(line).toContain("sender");
    });

    test("a gclass can be traced on its own", () => {
        gobj_set_gclass_trace("C_TRACED", "machine", true);
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced().length).toBeGreaterThan(0);
    });

    test("a single gobj can be traced on its own", () => {
        gobj_set_gobj_trace(dst, "machine", true);
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced().length).toBeGreaterThan(0);
    });

    test("the SOURCE can veto a trace the destination allows", () => {
        gobj_set_global_trace("machine", true);
        gobj_set_gobj_no_trace(src, "machine", true);
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced()).toEqual([]);
    });

    /*  What every C main() does to keep the timers out of a machine
     *  trace: silence the noisy gclass, not the level you are chasing.  */
    test("a whole GCLASS can be silenced, by name", () => {
        gobj_set_global_trace("machine", true);
        gobj_set_gclass_no_trace("C_SENDER", "machine", true);
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced()).toEqual([]);
    });

    test("silencing a gclass is reversible", () => {
        gobj_set_global_trace("machine", true);
        gobj_set_gclass_no_trace("C_SENDER", "machine", true);
        gobj_set_gclass_no_trace("C_SENDER", "machine", false);
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced().length).toBeGreaterThan(0);
    });

    test("an unknown gclass name is reported, not thrown", () => {
        expect(gobj_set_gclass_no_trace("C_DOES_NOT_EXIST", "machine", true)).toBe(-1);
    });
});

describe("event-specific levels", () => {
    test("`timer` traces EV_TIMEOUT and nothing else", () => {
        gobj_set_global_trace("timer", true);

        gobj_send_event(dst, "EV_TIMEOUT", {}, src);
        expect(debugged.filter((l) => l.includes("EV_TIMEOUT")).length).toBeGreaterThan(0);

        debugged.length = 0;
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced()).toEqual([]);
    });

    test("`timer_periodic` traces EV_TIMEOUT_PERIODIC and nothing else", () => {
        gobj_set_global_trace("timer_periodic", true);

        gobj_send_event(dst, "EV_TIMEOUT_PERIODIC", {}, src);
        expect(debugged.filter((l) => l.includes("EV_TIMEOUT_PERIODIC")).length).toBeGreaterThan(0);

        debugged.length = 0;
        gobj_send_event(dst, "EV_PING", {}, src);
        expect(traced()).toEqual([]);
    });
});

describe("indentation", () => {
    /*
     *  The C kernel's tab() writes TWO spaces per level of __inside__,
     *  starting at one: a line at depth 1 is indented 2, a line fired
     *  from inside that action is indented 4. Reading a JS trace beside
     *  a node's only works if they agree.
     */
    test("is two spaces per nesting level, like gobj.c", () => {
        gobj_set_global_trace("machine", true);
        gobj_send_event(nester, "EV_OUTER", {}, src);

        const outer = debugged.find((l) => l.includes("EV_OUTER"));
        const inner = debugged.find((l) => l.includes("EV_PING"));
        expect(outer).toBeTruthy();
        expect(inner).toBeTruthy();

        const lead = (l) => l.length - l.replace(/^ +/, "").length;
        expect(lead(outer)).toBe(2);
        expect(lead(inner)).toBe(4);
    });
});

describe("the levels themselves", () => {
    test("carry the C kernel's bits", () => {
        /*  If these drift, a level stops meaning the same thing on the
         *  two implementations, which is the whole point of copying the
         *  table across.  */
        expect(trace_level_t.TRACE_MACHINE).toBe(0x00010000);
        expect(trace_level_t.TRACE_CREATE_DELETE).toBe(0x00020000);
        expect(trace_level_t.TRACE_SUBSCRIPTIONS).toBe(0x00080000);
        expect(trace_level_t.TRACE_START_STOP).toBe(0x00100000);
        expect(trace_level_t.TRACE_EV_KW).toBe(0x00200000);
        expect(trace_level_t.TRACE_STATES).toBe(0x00800000);
        expect(trace_level_t.TRACE_TIMER).toBe(0x02000000);
        expect(trace_level_t.TRACE_TIMER_PERIODIC).toBe(0x10000000);
        expect(trace_level_t.TRACE_COMMANDS).toBe(0x40000000);
    });

    test("accumulate in the global mask, and are readable back", () => {
        gobj_set_global_trace("machine", true);
        gobj_set_global_trace("states", true);
        expect(gobj_global_trace_level() & trace_level_t.TRACE_MACHINE).toBeTruthy();
        expect(gobj_global_trace_level() & trace_level_t.TRACE_STATES).toBeTruthy();

        const set = gobj_repr_global_trace_levels()
            .filter((l) => l.set).map((l) => l.name).sort();
        expect(set).toEqual(["machine", "states"]);
    });

    test("a gobj's level is the union of global, gclass and its own", () => {
        gobj_set_global_trace("machine", true);
        gobj_set_gclass_trace("C_TRACED", "states", true);
        gobj_set_gobj_trace(dst, "ev_kw", true);

        const level = gobj_trace_level(dst);
        expect(level & trace_level_t.TRACE_MACHINE).toBeTruthy();
        expect(level & trace_level_t.TRACE_STATES).toBeTruthy();
        expect(level & trace_level_t.TRACE_EV_KW).toBeTruthy();
    });

    test("an unknown level is refused, loudly, not silently ignored", () => {
        expect(gobj_set_global_trace("no_such_level", true)).toBe(-1);
        expect(gobj_global_trace_level()).toBe(0);
    });
});
