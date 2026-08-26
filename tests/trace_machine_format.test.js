/***********************************************************************
 *          trace_machine_format.test.js
 *
 *      Which SHAPE the machine trace is written in, and what the
 *      default is.
 *
 *      The C kernel offers two and defaults to the SIMPLER one
 *      (gobj.c: `trace_machine_format = 1;  // 0 legacy, 1 simpler`).
 *      The JS port shipped the legacy one, so a browser yuno read
 *      THREE lines per transition where a node read one -- the same
 *      trace, three times the wall, and the two sides did not look
 *      alike when read side by side.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
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
    gobj_set_trace_machine_format,
    gobj_trace_machine_format,
    set_log_callback,
} from "../src/index.js";

const debugged = [];
set_log_callback((level, msg) => {
    if(level === "debug") {
        debugged.push(String(msg));
    }
});

let dst = null;
let src = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);

    gclass_create("C_FMT_YUNO", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_FMT_TRACED",
        [["EV_PING", 0]],
        [["ST_IDLE", [["EV_PING", function ac_ping() { return 0; }, "ST_IDLE"]]]],
        {}, 0, [SDATA(data_type_t.DTP_STRING, "x", 0, "", "x"), SDATA_END()], {}, 0, 0, 0, 0
    );
    gclass_create("C_FMT_SENDER", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);

    const yuno = gobj_create_yuno("fmt_yuno", "C_FMT_YUNO", {});
    dst = gobj_create("traced", "C_FMT_TRACED", {}, yuno);
    src = gobj_create("sender", "C_FMT_SENDER", {}, yuno);
    gobj_start(dst);
});

beforeEach(() => {
    debugged.length = 0;
});

afterEach(() => {
    gobj_set_global_trace("machine", false);
    gobj_set_trace_machine_format(1);
});

const ping_lines = () => {
    gobj_set_global_trace("machine", true);
    debugged.length = 0;
    gobj_send_event(dst, "EV_PING", {}, src);
    return debugged.filter((l) => /EV_PING/.test(l));
};

describe("the machine trace format", () => {
    test("defaults to 1, the simpler one, like the C kernel", () => {
        expect(gobj_trace_machine_format()).toBe(1);
    });

    test("1 writes ONE line per transition, and leads with the event", () => {
        gobj_set_trace_machine_format(1);
        const lines = ping_lines();
        expect(lines.length).toBe(1);
        expect(lines[0]).not.toMatch(/mach\(/);
        expect(lines[0]).not.toMatch(/ret:/);
        /*  the event first, so a column of them is readable  */
        expect(lines[0].trim().split(/\s+/)[1]).toBe("EV_PING");
    });

    test("0 writes the legacy shape, with its separate return line", () => {
        gobj_set_trace_machine_format(0);
        const lines = ping_lines();
        expect(lines.length).toBeGreaterThan(1);
        expect(lines.some((l) => /mach\(/.test(l))).toBe(true);
        expect(lines.some((l) => /ret:/.test(l))).toBe(true);
    });

    test("both shapes still name the event, which is what a filter reads", () => {
        gobj_set_trace_machine_format(1);
        expect(ping_lines().every((l) => /EV_PING/.test(l))).toBe(true);
        gobj_set_trace_machine_format(0);
        expect(ping_lines().every((l) => /EV_PING/.test(l))).toBe(true);
    });

    test("anything that is not 1 is the legacy one", () => {
        gobj_set_trace_machine_format(0);
        expect(gobj_trace_machine_format()).toBe(0);
        gobj_set_trace_machine_format("nonsense");
        expect(gobj_trace_machine_format()).toBe(0);
        gobj_set_trace_machine_format(1);
        expect(gobj_trace_machine_format()).toBe(1);
    });
});
