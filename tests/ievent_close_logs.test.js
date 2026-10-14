/***********************************************************************
 *          ievent_close_logs.test.js
 *
 *      What C_IEVENT_CLI logs when its websocket closes, as the C
 *      transport does:
 *
 *        - a session that ends cleanly (a deliberate stop, or the
 *          server closing it with 1000 or 1001) is published as
 *          EV_ON_CLOSE and logged by nobody: up to 7.26.22 every close
 *          was a WARNING, also the clean one of a logout, which made a
 *          console check of an app pass or fail depending on when the
 *          close landed;
 *        - a session cut (not clean, or any other code: 1006, 1008,
 *          1011) is one WARNING, its reason masked: 7.26.23 logged
 *          nothing at all, so a cut session left no trace;
 *        - EV_ON_CLOSE carries the code, the reason (masked) and
 *          was_clean, so its subscriber can tell the two apart;
 *        - a socket that closes before it ever opened is the
 *          EV_ON_OPEN_ERROR WARNING, with the reason the server gives
 *          masked (it was logged raw).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    SDATA_END,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_service,
    gobj_create_pure_child,
    gobj_start,
    gobj_stop,
    gobj_subscribe_event,
    gobj_current_state,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
    set_log_callback,
} from "../src/index.js";

/*
 *  A WebSocket that does nothing on its own: the test fires its
 *  callbacks, in the order a browser can.
 */
const sockets = [];
class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this.sent = [];
        sockets.push(this);
    }
    send(data) {
        this.sent.push(JSON.parse(data));
    }
    close() {
        this.readyState = FakeWebSocket.CLOSING;
    }
    fire_open() {
        this.readyState = FakeWebSocket.OPEN;
        if(this.onopen) {
            this.onopen();
        }
    }
    fire_close(code, reason, was_clean = true) {
        this.readyState = FakeWebSocket.CLOSED;
        if(this.onclose) {
            this.onclose({code: code, reason: reason, wasClean: was_clean});
        }
    }
}

const published = [];
const published_kw = {};
let logged = [];
let yuno = null;
let seq = 0;

beforeAll(() => {
    globalThis.WebSocket = FakeWebSocket;
    set_log_callback((level, msg) => {
        logged.push(`${level}: ${typeof msg === "string"? msg : JSON.stringify(msg)}`);
    });

    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();

    gclass_create(
        "C_PROBE_CLOSE_LISTENER",
        [["EV_ON_OPEN", 0], ["EV_ON_CLOSE", 0], ["EV_ON_OPEN_ERROR", 0]],
        [["ST_IDLE", [
            ["EV_ON_OPEN", (g, ev) => {
                published.push(ev);
                return 0;
            }, null],
            ["EV_ON_CLOSE", (g, ev, kw) => {
                published.push(ev);
                published_kw[ev] = kw;
                return 0;
            }, null],
            ["EV_ON_OPEN_ERROR", (g, ev, kw) => {
                published.push(ev);
                published_kw[ev] = kw;
                return 0;
            }, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    yuno = gobj_create_yuno("close_logs_yuno", "C_YUNO", {yuno_role: "close_logs_role"});
    gobj_start(yuno);
});

beforeEach(() => {
    logged = [];
    published.length = 0;
    for(const k of Object.keys(published_kw)) {
        delete published_kw[k];
    }
});

/*  A started transport with a listener, and the socket it opened.  */
function make_link()
{
    const name = `close_link_${++seq}`;
    const ievent = gobj_create_service(name, "C_IEVENT_CLI", {
        remote_yuno_role:    "remote_role",
        remote_yuno_service: "remote_service",
        url:                 "ws://close.test",
    }, yuno);
    const listener = gobj_create_pure_child(`${name}_listener`, "C_PROBE_CLOSE_LISTENER", {}, ievent);
    gobj_start(listener);
    gobj_subscribe_event(ievent, null, {}, listener);
    gobj_start(ievent);
    return {ievent, ws: sockets[sockets.length - 1]};
}

/*  The identity card is the first frame; its ack puts the link in session. */
function into_session(ievent, ws)
{
    ws.fire_open();
    ws.onmessage({data: JSON.stringify({
        event: "EV_IDENTITY_CARD_ACK",
        kw: {
            result: 0,
            data: {},
            __md_iev__: {
                ievent_gate_stack: [{
                    dst_yuno: "close_logs_yuno", dst_role: "close_logs_role", dst_service: "",
                    src_yuno: "remote", src_role: "remote_role", src_service: "remote_service",
                }],
                __msg_type__: "__answer__",
            },
        },
    })});
    expect(gobj_current_state(ievent)).toBe("ST_SESSION");
}

function warnings()
{
    return logged.filter(l => /^(warning|error)/i.test(l));
}

/*  The close is posted to the transport's FSM: a few turns.  */
async function settle()
{
    for(let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

describe("the close of a session", () => {
    test("a deliberate stop publishes EV_ON_CLOSE and logs nothing", async () => {
        const {ievent, ws} = make_link();
        into_session(ievent, ws);
        published.length = 0;
        logged = [];
        gobj_stop(ievent);
        ws.fire_close(1000, "");
        await settle();
        expect(published).toContain("EV_ON_CLOSE");
        expect(warnings()).toEqual([]);
    });

    test("a deliberate stop whose socket then closes badly logs nothing either", async () => {
        const {ievent, ws} = make_link();
        into_session(ievent, ws);
        published.length = 0;
        logged = [];
        gobj_stop(ievent);
        ws.fire_close(1006, "", false);
        await settle();
        expect(published).toContain("EV_ON_CLOSE");
        expect(warnings()).toEqual([]);
    });

    test("the server closing the session with 1000 or 1001 publishes EV_ON_CLOSE and logs nothing", async () => {
        for(const code of [1000, 1001]) {
            const {ievent, ws} = make_link();
            into_session(ievent, ws);
            published.length = 0;
            logged = [];
            ws.fire_close(code, "going away");
            await settle();
            expect(published).toContain("EV_ON_CLOSE");
            expect(warnings()).toEqual([]);
            expect(published_kw.EV_ON_CLOSE).toMatchObject({code: code, reason: "going away", was_clean: true});
            gobj_stop(ievent);
        }
    });

    test("a session the server cuts with another code is one WARNING, its reason masked", async () => {
        const {ievent, ws} = make_link();
        into_session(ievent, ws);
        published.length = 0;
        logged = [];
        ws.fire_close(1008, "bad token=cs1-hunter2");
        await settle();
        expect(published).toContain("EV_ON_CLOSE");
        expect(warnings().length).toBe(1);
        expect(warnings()[0]).toMatch(/^warning: .*session closed.*Code: 1008/);
        expect(logged.some(l => l.includes("cs1-hunter2"))).toBe(false);
        expect(published_kw.EV_ON_CLOSE.code).toBe(1008);
        expect(published_kw.EV_ON_CLOSE.was_clean).toBe(true);
        expect(published_kw.EV_ON_CLOSE.reason).toContain("bad token=");
        expect(published_kw.EV_ON_CLOSE.reason).not.toContain("cs1-hunter2");
        gobj_stop(ievent);
    });

    test("a session cut without a clean close (1006) is one WARNING", async () => {
        const {ievent, ws} = make_link();
        into_session(ievent, ws);
        published.length = 0;
        logged = [];
        ws.fire_close(1006, "", false);
        await settle();
        expect(published).toContain("EV_ON_CLOSE");
        expect(warnings().length).toBe(1);
        expect(warnings()[0]).toMatch(/Code: 1006.*Clean: false/);
        expect(published_kw.EV_ON_CLOSE).toMatchObject({code: 1006, reason: "", was_clean: false});
        gobj_stop(ievent);
    });

    test("a clean code that was not a clean close (1000, was_clean false) is one WARNING too", async () => {
        const {ievent, ws} = make_link();
        into_session(ievent, ws);
        published.length = 0;
        logged = [];
        ws.fire_close(1000, "", false);
        await settle();
        expect(warnings().length).toBe(1);
        gobj_stop(ievent);
    });
});

describe("a socket that closes before it opened", () => {
    test("is the EV_ON_OPEN_ERROR warning, its reason masked", async () => {
        const {ievent, ws} = make_link();
        ws.fire_close(1008, "bad token=oe1-hunter2");
        await settle();
        expect(published).toContain("EV_ON_OPEN_ERROR");
        expect(warnings().some(l => /EV_ON_OPEN_ERROR/.test(l))).toBe(true);
        expect(logged.some(l => l.includes("oe1-hunter2"))).toBe(false);
        expect(published_kw.EV_ON_OPEN_ERROR.reason).toContain("bad token=");
        expect(published_kw.EV_ON_OPEN_ERROR.reason).not.toContain("oe1-hunter2");
        gobj_stop(ievent);
    });
});
