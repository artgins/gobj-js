/***********************************************************************
 *          publish_twin.test.js
 *
 *      What one subscription does to a published kw reaches that
 *      subscriber alone.
 *
 *      Up to 7.25.7 gobj_publish_event() handed every subscriber the
 *      SAME kw and applied each subscription's `__local__` (kw_pop) and
 *      `__global__` (json_object_update) to it. So one subscription
 *      forged or stripped the event of every subscriber after it, and
 *      of the publisher, and the `__filter__` of a later subscription
 *      was evaluated on the altered kw. C_IEVENT_CLI's mt_inject_event()
 *      wrote its ievent stack into the published kw too, so a local
 *      subscriber after the transport received the transport's
 *      metadata.
 *
 *      The rule now, as in the C kernel: a subscription with a
 *      non-empty `__local__` or `__global__` gets a twin of its own
 *      (shallow: a new top-level object), every other subscriber keeps
 *      the shared kw, and filters see the publisher's kw.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    SDATA_END,
    event_flag_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_create_service,
    gobj_start,
    gobj_destroy,
    gobj_name,
    gobj_subscribe_event,
    gobj_publish_event,
    gobj_change_state,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
    set_log_callback,
} from "../src/index.js";

const EV_X = "EV_TWIN_PROBE";

/*  What each subscriber received: its name, the kw object, and a
 *  snapshot taken when it arrived.  */
let arrivals = [];
let logged = [];

let yuno = null;

function ac_note(gobj, event, kw, src)
{
    arrivals.push({
        name: gobj_name(gobj),
        kw: kw,
        snapshot: JSON.parse(JSON.stringify(kw)),
    });
    return 0;
}

beforeAll(() => {
    set_log_callback((level, msg) => {
        logged.push(`${level}: ${msg}`);
    });

    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();

    gclass_create(
        "C_TWIN_PUB",
        [[EV_X, event_flag_t.EVF_OUTPUT_EVENT]],
        [["ST_IDLE", []]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    gclass_create(
        "C_TWIN_SUB",
        [[EV_X, 0]],
        [["ST_IDLE", [[EV_X, ac_note, null]]]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );

    yuno = gobj_create_yuno("twin_yuno", "C_YUNO", {yuno_role: "twin_role"});
    gobj_start(yuno);
});

beforeEach(() => {
    arrivals = [];
    logged = [];
});

function make_sub(name)
{
    const sub = gobj_create(name, "C_TWIN_SUB", {}, yuno);
    gobj_start(sub);
    return sub;
}

function received(name)
{
    return arrivals.filter(a => a.name === name);
}

describe("a subscription that rewrites the kw gets its own", () => {
    test("__global__, __local__ and __filter__: each subscriber gets exactly its view", () => {
        const pub = gobj_create("pub_a", "C_TWIN_PUB", {}, yuno);
        gobj_start(pub);

        const forger = make_sub("forger");
        const stripper = make_sub("stripper");
        const filtered = make_sub("filtered");
        const plain = make_sub("plain");

        /*  Order matters: the forger and the stripper come first, so
         *  what they did to a shared kw reached the ones after them.  */
        gobj_subscribe_event(pub, EV_X,
            {__global__: {a: 99, forged: "yes", meta: {n: 1}}}, forger);
        gobj_subscribe_event(pub, EV_X,
            {__local__: {secret: 0}}, stripper);
        gobj_subscribe_event(pub, EV_X,
            {__filter__: {a: 1}}, filtered);
        gobj_subscribe_event(pub, EV_X, {}, plain);

        const nested = {x: 1};
        const kw = {a: 1, secret: "s", topic: "t", nested: nested};
        const original = JSON.parse(JSON.stringify(kw));

        gobj_publish_event(pub, EV_X, kw);

        /*  The forger sees its forgery.  */
        expect(received("forger").length).toBe(1);
        expect(received("forger")[0].snapshot).toEqual({
            a: 99, secret: "s", topic: "t", nested: {x: 1},
            forged: "yes", meta: {n: 1}
        });

        /*  The stripper sees the publisher's event minus its key, and
         *  nothing of the forgery.  */
        expect(received("stripper").length).toBe(1);
        expect(received("stripper")[0].snapshot).toEqual({
            a: 1, topic: "t", nested: {x: 1}
        });

        /*  The filter is evaluated on the publisher's kw: a:1 matches,
         *  whatever the forger's __global__ says.  */
        expect(received("filtered").length).toBe(1);
        expect(received("filtered")[0].snapshot).toEqual(original);

        /*  A subscriber that rewrites nothing shares the publisher's kw.  */
        expect(received("plain").length).toBe(1);
        expect(received("plain")[0].snapshot).toEqual(original);
        expect(received("plain")[0].kw).toBe(kw);

        /*  The publisher's kw is as it was.  */
        expect(kw).toEqual(original);

        /*  The twin is shallow: a new top-level object, nested values
         *  shared.  */
        expect(received("forger")[0].kw).not.toBe(kw);
        expect(received("forger")[0].kw.nested).toBe(nested);

        gobj_destroy(plain);
        gobj_destroy(filtered);
        gobj_destroy(stripper);
        gobj_destroy(forger);
        gobj_destroy(pub);
    });

    test("a receiver changing its twin does not change the subscription's __global__", () => {
        const pub = gobj_create("pub_b", "C_TWIN_PUB", {}, yuno);
        gobj_start(pub);
        const sub = make_sub("mutator");

        gobj_subscribe_event(pub, EV_X, {__global__: {meta: {n: 1}}}, sub);

        gobj_publish_event(pub, EV_X, {v: 1});
        received("mutator")[0].kw.meta.n = 2;

        gobj_publish_event(pub, EV_X, {v: 2});
        expect(received("mutator")[1].snapshot).toEqual({v: 2, meta: {n: 1}});

        gobj_destroy(sub);
        gobj_destroy(pub);
    });
});

describe("C_IEVENT_CLI injecting a published event", () => {
    test("writes its ievent stack in a copy, not in the kw the others get", () => {
        const pub = gobj_create("pub_c", "C_TWIN_PUB", {}, yuno);
        gobj_start(pub);

        const ievent = gobj_create_service("twin_ievent", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://127.0.0.1:1",
        }, yuno);
        gobj_change_state(ievent, "ST_SESSION");

        /*  No socket is opened: a stand-in takes what would go on the wire.  */
        const wire = [];
        ievent.priv.websocket = {
            readyState: WebSocket.OPEN,
            send: (msg) => { wire.push(JSON.parse(msg)); },
        };

        const after = make_sub("after_transport");

        /*  The transport first: it is a plain subscriber, so it gets the
         *  shared kw.  */
        gobj_subscribe_event(pub, EV_X, {}, ievent);
        gobj_subscribe_event(pub, EV_X, {}, after);

        const md = {__msg_type__: "__publishing__", some_stack: [{k: 1}]};
        const kw = {__service__: "remote_service", value: 7};
        const kw2 = {value: 8, __md_iev__: md};
        const original = JSON.parse(JSON.stringify(kw));
        const original2 = JSON.parse(JSON.stringify(kw2));

        gobj_publish_event(pub, EV_X, kw);
        gobj_publish_event(pub, EV_X, kw2);

        /*  The transport sent its message, with its stack.  */
        expect(wire.length).toBe(2);
        expect(wire[0].event).toBe(EV_X);
        expect(wire[0].kw.__md_iev__.__msg_type__).toBe("__message__");
        expect(wire[0].kw.__md_iev__.ievent_gate_stack.length).toBe(1);
        expect(wire[0].kw.__service__).toBeUndefined();
        expect(wire[1].kw.__md_iev__.__msg_type__).toBe("__message__");
        expect(wire[1].kw.__md_iev__.ievent_gate_stack.length).toBe(1);

        /*  The subscriber after it got the publisher's event, untouched.  */
        expect(received("after_transport").length).toBe(2);
        expect(received("after_transport")[0].snapshot).toEqual(original);
        expect(received("after_transport")[1].snapshot).toEqual(original2);

        /*  And so the publisher's kw, including a nested __md_iev__.  */
        expect(kw).toEqual(original);
        expect(kw2).toEqual(original2);
        expect(kw2.__md_iev__).toBe(md);

        gobj_destroy(after);
        gobj_destroy(pub);
    });
});
