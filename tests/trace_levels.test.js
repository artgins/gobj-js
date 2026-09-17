/***********************************************************************
 *          trace_levels.test.js
 *
 *      The trace levels a user sets through the yuno's commands are
 *      persisted as SCOPES, and at the next start up a saved scope
 *      REPLACES what main() set by default -- the C kernel's C_YUNO,
 *      same commands, same attrs (`trace_levels`, `no_trace_levels`).
 *
 *      One yuno per module, so "the next start up" is played by writing
 *      the store first and creating the yuno afterwards: the persistent
 *      attrs are loaded before its mt_create restores them.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
    gobj_start_up,
    gobj_create_yuno,
    gobj_command,
    gobj_read_attr,
    gobj_write_attrs,
    gobj_read_attrs,
    sdata_flag_t,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
    gobj_set_global_trace,
    gobj_set_global_no_trace,
    gobj_set_gclass_no_trace,
    gobj_global_trace_level,
    gobj_global_trace_no_level,
    gobj_get_gclass_trace_level2,
    gobj_get_gclass_trace_no_level,
    trace_level_t,
} from "../src/index.js";

/*  The store of a previous run.  */
const store = {
    trace_levels: {
        "__global_trace__": ["start_stop"],
    },
    no_trace_levels: {
        "__global_no_trace__": [],          // the user turned timer_periodic back on
    },
};

function load_persistent_attrs(gobj, keys)
{
    gobj_write_attrs(gobj, JSON.parse(JSON.stringify(store)), sdata_flag_t.SDF_PERSIST, 0);
    return 0;
}

function save_persistent_attrs(gobj, keys)
{
    let attrs = gobj_read_attrs(gobj, sdata_flag_t.SDF_PERSIST, 0);
    for(const k of Object.keys(attrs)) {
        store[k] = JSON.parse(JSON.stringify(attrs[k]));
    }
    return 0;
}

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, load_persistent_attrs, save_persistent_attrs, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();

    /*  What every main() does before creating the yuno.  */
    gobj_set_global_trace("machine", true);
    gobj_set_global_no_trace("timer_periodic", true);
    gobj_set_gclass_no_trace("C_TIMER", "machine", true);

    yuno = gobj_create_yuno("test_yuno", "C_YUNO", {});
});

describe("restoring at start up", () => {
    test("a saved global scope replaces main()'s", () => {
        expect(gobj_global_trace_level() & trace_level_t.TRACE_START_STOP).toBeTruthy();
        expect(gobj_global_trace_level() & trace_level_t.TRACE_MACHINE).toBeFalsy();
    });

    test("an EMPTY saved scope replaces too: a default turned off stays off", () => {
        expect(gobj_global_trace_no_level() & trace_level_t.TRACE_TIMER_PERIODIC).toBeFalsy();
    });

    test("a scope never saved keeps main()'s default", () => {
        expect(gobj_get_gclass_trace_no_level("C_TIMER")).toEqual(["machine"]);
    });
});

describe("the trace commands", () => {
    test("set-global-trace saves the global scope WHOLE", () => {
        let r = gobj_command(yuno, "set-global-trace", {level: "subscriptions", set: 1}, yuno);
        expect(r.result).toBe(0);
        expect(store.trace_levels.__global_trace__).toEqual(["subscriptions", "start_stop"]);
    });

    test("a reset keeps the scope, empty", () => {
        gobj_command(yuno, "set-global-trace", {level: "subscriptions", set: 0}, yuno);
        gobj_command(yuno, "set-global-trace", {level: "start_stop", set: "reset"}, yuno);
        expect(store.trace_levels.__global_trace__).toEqual([]);
    });

    test("set-global-no-trace, the scope main() fills", () => {
        let r = gobj_command(yuno, "set-global-no-trace", {level: "timer_periodic", set: "set"}, yuno);
        expect(r.result).toBe(0);
        expect(store.no_trace_levels.__global_no_trace__).toEqual(["timer_periodic"]);
    });

    test("a gclass's own level: the traffic of C_IEVENT_CLI", () => {
        let r = gobj_command(yuno, "set-gclass-trace",
            {gclass_name: "C_IEVENT_CLI", level: "ievents", set: 1}, yuno);
        expect(r.result).toBe(0);
        expect(gobj_get_gclass_trace_level2("C_IEVENT_CLI")).toEqual(["ievents"]);
        expect(store.trace_levels.C_IEVENT_CLI).toEqual(["ievents"]);
    });

    test("an unknown level answers -1 and saves nothing", () => {
        let before = JSON.stringify(store);
        let r = gobj_command(yuno, "set-global-trace", {level: "no_such_level", set: 1}, yuno);
        expect(r.result).toBe(-1);
        expect(JSON.stringify(store)).toBe(before);
    });

    test("no level or no set is refused", () => {
        expect(gobj_command(yuno, "set-global-trace", {set: 1}, yuno).result).toBe(-1);
        expect(gobj_command(yuno, "set-global-trace", {level: "machine"}, yuno).result).toBe(-1);
    });

    test("the attrs themselves carry the scopes", () => {
        expect(gobj_read_attr(yuno, "trace_levels").C_IEVENT_CLI).toEqual(["ievents"]);
    });
});
