/***********************************************************************
 *          log_backlog_and_ev_kw.test.js
 *
 *      A monitor sees what the console saw, from the first line:
 *
 *      1. a log sink installed late is handed the lines written before it;
 *      2. a payload (kw) is dumped only with the `ev_kw` level, as in C --
 *         the `machine` trace alone does not print it.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_service,
    gobj_start,
    gobj_publish_event,
    gobj_subscribe_event,
    gobj_set_global_trace,
    gclass_create,
    event_flag_t,
    SDATA_END,
    register_c_yuno,
    register_c_timer,
    set_log_callback,
    set_console_log_enabled,
    log_info,
} from "../src/index.js";

let pub = null;
let sub = null;

beforeAll(() => {
    set_console_log_enabled(false);
    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    gclass_create("C_TEST_PUB", [["EV_PING", event_flag_t.EVF_OUTPUT_EVENT]],
        [["ST_IDLE", []]], {}, null, [SDATA_END()], {}, null, null, null, 0);
    gclass_create("C_TEST_SUB", [["EV_PING", 0]],
        [["ST_IDLE", [["EV_PING", () => 0, null]]]], {}, null, [SDATA_END()], {}, null, null, null, 0);
    const yuno = gobj_create_yuno("test_yuno", "C_YUNO", {});
    pub = gobj_create_service("pub", "C_TEST_PUB", {}, yuno);
    sub = gobj_create_service("sub", "C_TEST_SUB", {}, yuno);
    gobj_subscribe_event(pub, "EV_PING", {}, sub);
});

describe("the log backlog", () => {
    test("a sink installed late gets the lines written before it, once", () => {
        log_info("line before any sink");
        const got = [];
        const sink = (level, msg) => { got.push([level, msg]); };
        set_log_callback(sink);
        expect(got.some(([l, m]) => l === "info" && String(m).includes("line before any sink"))).toBe(true);
        const n = got.length;
        set_log_callback(sink);     // the same sink again: no replay
        expect(got.length).toBe(n);
        log_info("line after");
        expect(got.length).toBe(n + 1);
        set_log_callback(null);
    });
});

describe("the kw of a publication", () => {
    const capture = () => {
        const lines = [];
        set_log_callback((level, msg) => { lines.push([level, msg]); });
        return lines;
    };

    test("machine alone does not dump it", () => {
        gobj_set_global_trace("machine", true);
        const lines = capture();
        const from = lines.length;
        gobj_publish_event(pub, "EV_PING", {payload: 1});
        expect(lines.slice(from).some(([l]) => l === "json")).toBe(false);
        set_log_callback(null);
    });

    test("ev_kw dumps it", () => {
        gobj_set_global_trace("ev_kw", true);
        const lines = capture();
        const from = lines.length;
        gobj_publish_event(pub, "EV_PING", {payload: 2});
        expect(lines.slice(from).some(([l, m]) => l === "json" && m && m.payload === 2)).toBe(true);
        gobj_set_global_trace("ev_kw", false);
        gobj_set_global_trace("machine", false);
        set_log_callback(null);
    });
});
