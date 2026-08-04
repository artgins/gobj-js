/***********************************************************************
 *          timer_contract.test.js
 *
 *      The C_TIMER contract, which is the C one (c_timer.h):
 *
 *          set_timeout()   arms
 *          clear_timeout() disarms
 *          a one-shot is spent once it fires
 *
 *      and NOTHING else is the caller's business. Whether the gobj is
 *      running is internal: a view asking for a timeout must not have
 *      to pair it with gobj_start(), nor remember gobj_stop() to avoid
 *      "Destroying a RUNNING gobj" on its way out.
 *
 *      These tests pin the running state as a CONSEQUENCE of the two
 *      calls, plus the two ordering traps that the re-arm used to have.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_create_pure_child,
    gobj_start,
    gobj_destroy,
    gobj_is_running,
    gobj_write_integer_attr,
    register_c_timer,
    set_timeout,
    set_timeout_periodic,
    clear_timeout,
    set_log_callback,
} from "../src/index.js";

const logged = [];

/*  What the parent of the timer does when EV_TIMEOUT arrives. Each test
 *  installs its own, because the traps are precisely about what the
 *  action does INSIDE the timeout. */
let on_timeout = () => 0;
let beats = 0;

function ac_timeout(gobj, event, kw, src)
{
    beats++;
    return on_timeout(gobj, event, kw, src);
}

let __gclass__ = null;
let yuno = null;

beforeAll(() => {
    gobj_start_up(
        null,
        null,
        (msg) => {
            logged.push(msg);
        }
    );
    set_log_callback((msg) => {
        logged.push(String(msg));
    });
    register_c_timer();

    __gclass__ = gclass_create(
        "C_TEST_HOST",
        [
            ["EV_TIMEOUT",          0],
            ["EV_TIMEOUT_PERIODIC", 0]
        ],
        [
            ["ST_IDLE", [
                ["EV_TIMEOUT",          ac_timeout, null],
                ["EV_TIMEOUT_PERIODIC", ac_timeout, null]
            ]]
        ],
        {},
        0,
        [SDATA_END()],
        {},
        0,
        0,
        0,
        0
    );
    expect(__gclass__).toBeTruthy();

    /*  One yuno for the whole file: the runtime allows exactly one, and
     *  a destroyed one does not free the slot. Each test gets its own
     *  host under it instead. */
    yuno = gobj_create_yuno("timer_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    vi.useFakeTimers();
    logged.length = 0;
    beats = 0;
    on_timeout = () => 0;
});

afterEach(() => {
    vi.useRealTimers();
});

/*  A host with its timer, the way every view builds one. Note it does
 *  NOT start the timer: that is the point. */
function build_host(name)
{
    const host = gobj_create(name, "C_TEST_HOST", {}, yuno);
    gobj_start(host);
    const timer = gobj_create_pure_child(name, "C_TIMER", {}, host);
    return {host, timer};
}

function errors()
{
    return logged.filter((l) => /NOT RUNNING|ALREADY RUNNING|RUNNING gobj/i.test(l));
}

describe("the two calls are the whole surface", () => {
    test("set_timeout() arms a timer nobody started", () => {
        const {host, timer} = build_host("t1");

        expect(gobj_is_running(timer)).toBe(false);

        set_timeout(timer, 1000);
        expect(gobj_is_running(timer)).toBe(true);

        vi.advanceTimersByTime(1000);
        expect(beats).toBe(1);
        expect(errors()).toEqual([]);

        gobj_destroy(host);
    });

    test("a spent one-shot is stopped, so destroying is quiet", () => {
        const {host, timer} = build_host("t2");

        set_timeout(timer, 500);
        vi.advanceTimersByTime(500);

        expect(beats).toBe(1);
        expect(gobj_is_running(timer)).toBe(false);

        gobj_destroy(host);
        expect(errors()).toEqual([]);
    });

    test("clear_timeout() disarms and leaves nothing running", () => {
        const {host, timer} = build_host("t3");

        set_timeout(timer, 1000);
        clear_timeout(timer);

        expect(gobj_is_running(timer)).toBe(false);
        vi.advanceTimersByTime(5000);
        expect(beats).toBe(0);

        gobj_destroy(host);
        expect(errors()).toEqual([]);
    });

    test("clearing a timer that already fired says nothing", () => {
        const {host, timer} = build_host("t4");

        set_timeout(timer, 100);
        vi.advanceTimersByTime(100);

        clear_timeout(timer);   /*  the spent one: the normal case  */
        expect(errors()).toEqual([]);

        gobj_destroy(host);
    });
});

describe("the sugar is only sugar", () => {
    /*  set_timeout()/clear_timeout() are PUBLIC functions on a gclass,
     *  which is an escape from the interface every other gclass keeps to
     *  (attributes, events, commands, local methods, stats). The `msec`
     *  attribute is the real door, so it must behave identically -- or
     *  the escape is not sugar, it is a second, privileged interface. */
    test("writing `msec` by hand arms exactly like set_timeout()", () => {
        const {host, timer} = build_host("t8");

        gobj_write_integer_attr(timer, "msec", 300);
        expect(gobj_is_running(timer)).toBe(true);

        vi.advanceTimersByTime(300);
        expect(beats).toBe(1);
        expect(gobj_is_running(timer)).toBe(false);

        gobj_destroy(host);
        expect(errors()).toEqual([]);
    });

    test("writing `msec` to 0 disarms exactly like clear_timeout()", () => {
        const {host, timer} = build_host("t9");

        set_timeout(timer, 300);
        gobj_write_integer_attr(timer, "msec", 0);

        expect(gobj_is_running(timer)).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(beats).toBe(0);

        gobj_destroy(host);
        expect(errors()).toEqual([]);
    });
});

describe("the traps of the re-arm", () => {
    test("re-arming INSIDE the action keeps the timer alive", () => {
        const {host, timer} = build_host("t5");

        on_timeout = () => {
            if(beats === 1) {
                set_timeout(timer, 100);    /*  chain a second round  */
            }
            return 0;
        };

        set_timeout(timer, 100);
        vi.advanceTimersByTime(100);
        expect(gobj_is_running(timer)).toBe(true);  /*  NOT stopped as spent  */

        vi.advanceTimersByTime(100);
        expect(beats).toBe(2);
        expect(gobj_is_running(timer)).toBe(false);

        gobj_destroy(host);
        expect(errors()).toEqual([]);
    });

    test("clearing a PERIODIC from inside its own action really stops it", () => {
        const {host, timer} = build_host("t6");

        on_timeout = () => {
            if(beats === 2) {
                clear_timeout(timer);
            }
            return 0;
        };

        set_timeout_periodic(timer, 100);
        vi.advanceTimersByTime(1000);

        /*  The re-arm used to run AFTER the action, undoing the clear and
         *  re-arming with the msec the clear had written -- negative, which
         *  setTimeout serves at once: a busy loop, not a stopped timer.  */
        expect(beats).toBe(2);
        expect(gobj_is_running(timer)).toBe(false);

        gobj_destroy(host);
        expect(errors()).toEqual([]);
    });

    test("a periodic does not carry the action's own time", () => {
        const {host, timer} = build_host("t7");

        on_timeout = () => {
            vi.advanceTimersByTime(0);  /*  the action takes time of its own  */
            return 0;
        };

        set_timeout_periodic(timer, 100);
        vi.advanceTimersByTime(300);

        expect(beats).toBe(3);

        clear_timeout(timer);
        gobj_destroy(host);
        expect(errors()).toEqual([]);
    });
});
