/***********************************************************************
 *          destroy_under_dispatch.test.js
 *
 *      A gobj must not be destroyed under code that is still running on
 *      it: gobj_publish_event() and gobj_send_event() dispatch
 *      synchronously, and the publisher's code, or the outer action, goes
 *      on when the inner dispatch returns -- on a gobj that is gone. The C
 *      kernel keeps a frame per dispatch and says it (since 7.26.10), an
 *      ERROR that names `destroying`, `publisher`/`running`, `event`,
 *      `destroyer` and `inner_event`: "Destroying a gobj while its tree is
 *      publishing" (a subscriber destroys the publisher or an ancestor of
 *      it; also a publisher that destroys ITSELF in an action a subscriber
 *      sent it, its publication still running), and "Destroying a gobj
 *      while one of its actions is still running". The destroy is done
 *      all the same.
 *
 *      gobj-js says the same thing, with the same exemptions, so a C
 *      client and a JS client report the same defect the same way:
 *
 *      - a gobj that destroys itself in its own action;
 *      - a gobj that publishes its last event, then destroys itself;
 *      - a host that destroys its transport in the transport's
 *        EV_STOPPED (the stop contract);
 *      - a gobj that ends itself in its own mt_stop, in a walk of the
 *        tree.
 *
 *      And the C_TIMER case, the usual one: a gclass that ends its own
 *      C_TIMER child in that timer's EV_TIMEOUT. The C timer PUBLISHES
 *      its timeout to the parent it subscribed; the javascript timer
 *      used to SEND it, so the same code broke the rule in C and not in
 *      javascript. It publishes now, like C.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_create_pure_child,
    gobj_destroy,
    gobj_start,
    gobj_stop,
    gobj_stop_tree,
    gobj_is_destroying,
    gobj_send_event,
    gobj_publish_event,
    gobj_post_event,
    gobj_subscribe_event,
    gobj_read_pointer_attr,
    gobj_name,
    register_c_timer,
    set_timeout,
    set_log_callback,
} from "../src/index.js";

const logged = [];

set_log_callback((level, msg) => {
    if(level === "error") {
        logged.push(String(msg));
    }
});

const RULE = "Destroying a gobj while its tree is publishing";
const RULE_ACTION = "Destroying a gobj while one of its actions is still running";

/*  Waits for the drain of the posted events, a macrotask.  */
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/*  Waits until `received` holds `n` events, or 2 s have gone by. A timer
 *  of 1 ms fires when the event loop gets to it, and on a loaded machine
 *  that is not 20 ms later: a fixed wait made the result a race.  */
async function until_received(n)
{
    const t0 = performance.now();
    while(received.length < n && performance.now() - t0 < 2000) {
        await sleep(5);
    }
}

/*  Each test says what each event does by filling this table: the
 *  action of an event runs the function registered for it.  */
let hooks = {};
const received = [];

function ac_hook(gobj, event, kw, src)
{
    received.push(`${gobj_name(gobj)}:${event}`);
    const hook = hooks[`${gobj_name(gobj)}:${event}`] || hooks[event];
    if(hook) {
        return hook(gobj, kw, src);
    }
    return 0;
}

const EVENTS = ["EV_PING", "EV_PONG", "EV_DIE", "EV_STOPPED", "EV_TIMEOUT"];

function mt_create(gobj)
{
    /*
     *  SERVICE subscription model
     */
    const subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(subscriber) {
        gobj_subscribe_event(gobj, null, {}, subscriber);
    }
}

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    register_c_timer();
    gclass_create("C_TEST_YUNO", [], [["ST_IDLE", []]], {}, null,
        [SDATA_END()], {}, null, null, null, 0);
    gclass_create(
        "C_TEST_DSP",
        EVENTS.map(ev => [ev, event_flag_t.EVF_OUTPUT_EVENT]),
        [["ST_IDLE", EVENTS.map(ev => [ev, ac_hook, null])]],
        {mt_create: mt_create},
        null,
        [
            SDATA(data_type_t.DTP_POINTER, "subscriber", 0, null, "subscriber"),
            SDATA_END()
        ],
        {}, null, null, null, 0
    );
    gclass_create(
        "C_TEST_DSP_NEXT",
        [["EV_PING", 0]],
        [
            ["ST_IDLE", [["EV_PING", ac_hook, "ST_BUSY"]]],
            ["ST_BUSY", [["EV_PING", ac_hook, "ST_IDLE"]]],
        ],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    yuno = gobj_create_yuno("test_yuno", "C_TEST_YUNO", {});
});

function reset()
{
    hooks = {};
    received.length = 0;
    logged.length = 0;
}

function rule_lines()
{
    return logged.filter(line => line.includes(RULE));
}

describe("a subscriber that destroys its publisher's tree", () => {
    test("destroying the PARENT of the publisher is an ERROR; the destroy is done", () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const parent = gobj_create("parent", "C_TEST_DSP", {}, host);
        const sub1 = gobj_create("sub1", "C_TEST_DSP", {}, host);
        const sub2 = gobj_create("sub2", "C_TEST_DSP", {}, host);
        const pub = gobj_create("pub", "C_TEST_DSP", {}, parent);
        gobj_subscribe_event(pub, "EV_PING", {}, sub1);
        gobj_subscribe_event(pub, "EV_PING", {}, sub2);

        hooks["sub1:EV_PING"] = () => {
            gobj_destroy(parent);
            return 0;
        };
        hooks["pub:EV_PONG"] = (gobj) => {
            gobj_publish_event(gobj, "EV_PING", {});
            return 0;
        };
        gobj_send_event(pub, "EV_PONG", {}, host);

        const lines = rule_lines();
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain("destroying C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^parent");
        expect(lines[0]).toContain("publisher C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^parent`C_TEST_DSP^pub");
        expect(lines[0]).toContain("event EV_PING");
        expect(lines[0]).toContain("destroyer C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^sub1");
        expect(lines[0]).toContain("gobj_post_event()");
        expect(lines[0]).toContain("stack");

        /*  done all the same, and the publication stops there  */
        expect(gobj_is_destroying(parent)).toBe(true);
        expect(gobj_is_destroying(pub)).toBe(true);
        expect(received).toEqual(["pub:EV_PONG", "sub1:EV_PING"]);

        gobj_destroy(host);
    });

    test("destroying the publisher itself is the same ERROR", () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const pub = gobj_create("pub", "C_TEST_DSP", {subscriber: host}, host);

        hooks["host:EV_PING"] = (gobj, kw, src) => {
            gobj_destroy(src);
            return 0;
        };
        gobj_publish_event(pub, "EV_PING", {});

        const lines = rule_lines();
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain("destroying C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^pub");
        expect(lines[0]).toContain("destroyer C_TEST_YUNO^test_yuno`C_TEST_DSP^host,");
        expect(gobj_is_destroying(pub)).toBe(true);

        gobj_destroy(host);
    });

    test("deferred with gobj_post_event(), it is not an error", async () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const pub = gobj_create("pub", "C_TEST_DSP", {subscriber: host}, host);

        hooks["host:EV_PING"] = (gobj) => {
            gobj_post_event(gobj, "EV_DIE", {}, gobj);
            return 0;
        };
        hooks["host:EV_DIE"] = () => {
            gobj_destroy(pub);
            return 0;
        };
        gobj_publish_event(pub, "EV_PING", {});
        expect(gobj_is_destroying(pub)).toBe(false);
        await turn();

        expect(gobj_is_destroying(pub)).toBe(true);
        expect(logged).toEqual([]);

        gobj_destroy(host);
    });
});

describe("what is NOT an error", () => {
    test("a gobj that destroys itself in its own action", () => {
        reset();
        const g = gobj_create("self", "C_TEST_DSP", {}, yuno);
        hooks["self:EV_DIE"] = (gobj) => {
            gobj_destroy(gobj);
            return 0;
        };
        gobj_send_event(g, "EV_DIE", {}, yuno);

        expect(gobj_is_destroying(g)).toBe(true);
        expect(logged).toEqual([]);
    });

    test("a gobj that publishes its last event, then destroys itself", () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const g = gobj_create("last", "C_TEST_DSP", {subscriber: host}, host);
        hooks["last:EV_DIE"] = (gobj) => {
            gobj_publish_event(gobj, "EV_PING", {});
            gobj_destroy(gobj);
            return 0;
        };
        gobj_send_event(g, "EV_DIE", {}, host);

        expect(received).toEqual(["last:EV_DIE", "host:EV_PING"]);
        expect(gobj_is_destroying(g)).toBe(true);
        expect(logged).toEqual([]);

        gobj_destroy(host);
    });

    test("a host that destroys its transport in the transport's EV_STOPPED", () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const tr = gobj_create("transport", "C_TEST_DSP", {subscriber: host}, host);
        hooks["host:EV_STOPPED"] = (gobj, kw, src) => {
            gobj_destroy(src);
            return 0;
        };
        gobj_publish_event(tr, "EV_STOPPED", {});

        expect(gobj_is_destroying(tr)).toBe(true);
        expect(logged).toEqual([]);

        gobj_destroy(host);
    });

    test("a gobj that ends itself in its own mt_stop, in a walk of the tree", () => {
        reset();
        gclass_create(
            "C_TEST_DSP_SELF_STOP",
            [],
            [["ST_IDLE", []]],
            {
                mt_stop: (gobj) => {
                    gobj_destroy(gobj);
                    return 0;
                }
            },
            null, [SDATA_END()], {}, null, null, null, 0
        );
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const g = gobj_create("volatile", "C_TEST_DSP_SELF_STOP", {}, host);
        gobj_create("child_of_volatile", "C_TEST_DSP", {}, g);
        gobj_start(host);
        gobj_start(g);

        gobj_stop_tree(host);

        expect(gobj_is_destroying(g)).toBe(true);
        expect(logged).toEqual([]);

        gobj_destroy(host);
    });
});

describe("a gobj destroyed by an inner dispatch while an outer one runs on it", () => {
    test("a publisher that destroys ITSELF in an action its subscriber sent it", () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const pub = gobj_create("pub", "C_TEST_DSP", {subscriber: host}, host);
        hooks["host:EV_PING"] = (gobj, kw, src) => {
            gobj_send_event(src, "EV_DIE", {}, gobj);
            return 0;
        };
        hooks["pub:EV_DIE"] = (gobj) => {
            gobj_destroy(gobj);
            return 0;
        };
        gobj_publish_event(pub, "EV_PING", {});

        expect(gobj_is_destroying(pub)).toBe(true);
        const lines = rule_lines();
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain("publisher C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^pub");
        expect(lines[0]).toContain("destroyer C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^pub");
        expect(lines[0]).toContain("inner_event EV_DIE");

        gobj_destroy(host);
    });

    test("a gobj whose action is still running when a peer it sent to destroys it", () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const relay = gobj_create("relay", "C_TEST_DSP", {}, host);
        const peer = gobj_create("peer", "C_TEST_DSP", {}, host);
        hooks["relay:EV_PING"] = (gobj) => {
            gobj_send_event(peer, "EV_PONG", {}, gobj);
            return 0;
        };
        hooks["peer:EV_PONG"] = (gobj, kw, src) => {
            gobj_send_event(src, "EV_DIE", {}, gobj);
            return 0;
        };
        hooks["relay:EV_DIE"] = (gobj) => {
            gobj_destroy(gobj);
            return 0;
        };
        gobj_send_event(relay, "EV_PING", {}, host);

        expect(gobj_is_destroying(relay)).toBe(true);
        const lines = logged.filter(line => line.includes(RULE_ACTION));
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain("destroying C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^relay");
        expect(lines[0]).toContain("running C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TEST_DSP^relay");
        expect(lines[0]).toContain("event EV_PING");
        expect(lines[0]).toContain("inner_event EV_DIE");
        expect(rule_lines()).toEqual([]);

        gobj_destroy(host);
    });
});

describe("a C_TIMER ended by its parent in the timer's own EV_TIMEOUT", () => {
    test("is the same ERROR in javascript as in C: the timer publishes its timeout", async () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const timer = gobj_create_pure_child("timer", "C_TIMER", {}, host);
        hooks["host:EV_TIMEOUT"] = (gobj, kw, src) => {
            gobj_stop(src);
            gobj_destroy(src);
            return 0;
        };
        set_timeout(timer, 1);
        await until_received(1);

        expect(received).toEqual(["host:EV_TIMEOUT"]);
        expect(gobj_is_destroying(timer)).toBe(true);
        const lines = rule_lines();
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain("publisher C_TEST_YUNO^test_yuno`C_TEST_DSP^host`C_TIMER^timer");
        expect(lines[0]).toContain("event EV_TIMEOUT");

        gobj_destroy(host);
    });

    test("deferred with gobj_post_event(), the timer goes in silence", async () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const timer = gobj_create_pure_child("timer", "C_TIMER", {}, host);
        hooks["host:EV_TIMEOUT"] = (gobj) => {
            gobj_post_event(gobj, "EV_DIE", {}, gobj);
            return 0;
        };
        hooks["host:EV_DIE"] = () => {
            gobj_destroy(timer);
            return 0;
        };
        set_timeout(timer, 1);
        await until_received(2);

        expect(received).toEqual(["host:EV_TIMEOUT", "host:EV_DIE"]);
        expect(gobj_is_destroying(timer)).toBe(true);
        expect(logged).toEqual([]);

        gobj_destroy(host);
    });

    test("a pure-child timer still reaches its parent, once per timeout", async () => {
        reset();
        const host = gobj_create("host", "C_TEST_DSP", {}, yuno);
        const timer = gobj_create_pure_child("timer", "C_TIMER", {}, host);
        set_timeout(timer, 1);
        await until_received(1);
        set_timeout(timer, 1);
        await until_received(2);
        await sleep(20);     // and no third one

        expect(received).toEqual(["host:EV_TIMEOUT", "host:EV_TIMEOUT"]);
        expect(logged).toEqual([]);

        gobj_destroy(host);
    });
});

describe("a dispatch that throws before its action runs", () => {
    test("the change of state is inside the frame's try: the frame is popped all the same", () => {
        reset();
        const host = gobj_create("throws_in_change", "C_TEST_DSP_NEXT", {}, yuno);
        Object.defineProperty(host, "last_state", {
            configurable: true,
            set() {
                throw new Error("change of state threw");
            },
        });
        expect(() => gobj_send_event(host, "EV_PING", {}, host)).toThrow("change of state threw");
        delete host.last_state;

        /*  A frame of `host` left on the chain would make this destroy,
         *  from another gobj's action, one under host's running action.  */
        const other = gobj_create("destroys_the_thrower", "C_TEST_DSP", {}, yuno);
        hooks["destroys_the_thrower:EV_DIE"] = () => {
            gobj_destroy(host);
            return 0;
        };
        logged.length = 0;
        gobj_send_event(other, "EV_DIE", {}, other);
        expect(logged.filter(line => line.includes(RULE_ACTION))).toEqual([]);
        gobj_destroy(other);
    });
});
