/***********************************************************************
 *          destroy_stops.test.js
 *
 *      Destroying a live gobj is the CALLER's bug, and the framework
 *      says so out loud -- but it must still take the gobj apart
 *      properly.  For a long time it did not: gobj_destroy() raised
 *      obflag_destroying before calling gobj_pause()/gobj_stop(), and
 *      those refuse a destroying gobj (rightly: nobody outside may
 *      stop something already being dismantled).  So the rescue died
 *      on its own guard, mt_pause/mt_stop never ran, and the gobj was
 *      taken apart still holding whatever they release.
 *
 *      These tests pin the ORDER, which is the only thing keeping the
 *      rescue alive, and that the complaint stays loud.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_start,
    gobj_play,
    gobj_destroy,
    gobj_is_running,
    set_log_callback,
} from "../src/index.js";

const calls = [];
const logged = [];

/*  The complaint is read through the framework's own log sink, which
 *  is the supported way to mirror log lines somewhere else and works
 *  with or without a browser.  (Stubbing window.console used to work
 *  by accident: helpers.js resolved `window.console` at CALL time, so
 *  a stub installed after the import still caught the line.  It also
 *  meant any log_error OUTSIDE a browser threw ReferenceError, which
 *  is now fixed -- hence this.)  These tests must still READ the
 *  complaint: destroying a live gobj stays loud as well as repaired. */
set_log_callback((level, msg) => {
    if(level === "error") {
        logged.push(String(msg));
    }
});

const gmt = {
    mt_start:   () => { calls.push("mt_start"); return 0; },
    mt_stop:    () => { calls.push("mt_stop"); return 0; },
    mt_play:    () => { calls.push("mt_play"); return 0; },
    mt_pause:   () => { calls.push("mt_pause"); return 0; },
    mt_destroy: () => { calls.push("mt_destroy"); }
};

/*  The yuno only exists because a gobj needs a parent.  It declares
 *  the two trace attrs the runtime reads on every create/stop so its
 *  own "Attribute NOT FOUND" noise does not land in `logged`. */
const yuno_attrs = [
SDATA(data_type_t.DTP_BOOLEAN, "trace_creation",   0, 0, "trace create/delete"),
SDATA(data_type_t.DTP_BOOLEAN, "trace_start_stop", 0, 0, "trace start/stop"),
SDATA_END()
];

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_YUNO", [], [["ST_IDLE", []]], {}, null,
        yuno_attrs, {}, null, null, null, 0);
    gclass_create("C_TEST_LIFECYCLE", [], [["ST_IDLE", []]], gmt, null,
        [SDATA_END()], {}, null, null, null, 0);
    yuno = gobj_create_yuno("test_yuno", "C_TEST_YUNO", {});
});

describe("gobj_destroy on a live gobj", () => {
    test("a RUNNING gobj is stopped: mt_stop runs, and before mt_destroy", () => {
        calls.length = 0;
        const gobj = gobj_create("running_one", "C_TEST_LIFECYCLE", {}, yuno);
        gobj_start(gobj);
        expect(gobj_is_running(gobj)).toBe(true);

        logged.length = 0;
        gobj_destroy(gobj);

        expect(calls).toEqual(["mt_start", "mt_stop", "mt_destroy"]);
        /*  loud AND repaired: the caller's bug is still reported...  */
        expect(logged.join("\n")).toMatch(/Destroying a RUNNING gobj/);
        /*  ...and the repair no longer dies on the destroying guard  */
        expect(logged.join("\n")).not.toMatch(/gobj NULL or DESTROYED/);
    });

    test("a PLAYING gobj is paused AND stopped, in that order", () => {
        calls.length = 0;
        const gobj = gobj_create("playing_one", "C_TEST_LIFECYCLE", {}, yuno);
        gobj_start(gobj);
        gobj_play(gobj);

        logged.length = 0;
        gobj_destroy(gobj);

        expect(calls).toEqual([
            "mt_start", "mt_play", "mt_pause", "mt_stop", "mt_destroy"
        ]);
        expect(logged.join("\n")).toMatch(/Destroying a PLAYING gobj/);
        expect(logged.join("\n")).not.toMatch(/gobj NULL or DESTROYED/);
    });

    test("a gobj that was never started is destroyed in silence", () => {
        calls.length = 0;
        const gobj = gobj_create("quiet_one", "C_TEST_LIFECYCLE", {}, yuno);

        logged.length = 0;
        gobj_destroy(gobj);

        expect(calls).toEqual(["mt_destroy"]);
        expect(logged).toEqual([]);
    });
});
