/***********************************************************************
 *          ievent_peer_fault.test.js
 *
 *      A session that C_IEVENT_CLI closes because the server broke the
 *      protocol (a message for a role or a yuno that is not this one, an
 *      event out of session):
 *
 *        - is closed with a code that says so (4002), not with a clean
 *          1000: EV_ON_CLOSE carries the code, and its subscriber can tell
 *          a fault from a session that ended well;
 *        - does not count as a session reached: the reconnect backoff goes
 *          on growing. The ack had reset it, so a server that broke every
 *          session it was given was reconnected at the first delay for
 *          ever, with an EV_ON_OPEN and an EV_ON_CLOSE in the app per
 *          round.
 *
 *      A browser can close a WebSocket only with 1000 or 3000-4999: a
 *      1002 (protocol error) throws there, and the socket stays open.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll, vi } from "vitest";
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
        this.closed_with = null;
        sockets.push(this);
    }
    send(data) {
        this.sent.push(JSON.parse(data));
    }
    close(code, reason) {
        if(code !== undefined && code !== 1000 && !(code >= 3000 && code <= 4999)) {
            throw new DOMException("The code must be 1000 or 3000-4999", "InvalidAccessError");
        }
        this.closed_with = {code, reason};
        this.readyState = FakeWebSocket.CLOSING;
    }
    fire_open() {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen && this.onopen();
    }
    /*  The server echoes the code of the close it was sent  */
    fire_close(code = 1000) {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose && this.onclose({code: code, reason: "", wasClean: true});
    }
}

const published = [];
let logged = [];
let yuno = null;

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
        "C_PROBE_FAULT_LISTENER",
        [["EV_ON_OPEN", 0], ["EV_ON_CLOSE", 0], ["EV_ON_OPEN_ERROR", 0]],
        [["ST_IDLE", [
            ["EV_ON_OPEN",       (g, ev, kw) => { published.push([ev, kw]); return 0; }, null],
            ["EV_ON_CLOSE",      (g, ev, kw) => { published.push([ev, kw]); return 0; }, null],
            ["EV_ON_OPEN_ERROR", (g, ev, kw) => { published.push([ev, kw]); return 0; }, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    yuno = gobj_create_yuno("fault_yuno", "C_YUNO", {yuno_role: "fault_role"});
    gobj_start(yuno);
});

function stack(dst_role = "fault_role")
{
    return {
        ievent_gate_stack: [{
            dst_yuno: "fault_yuno", dst_role: dst_role, dst_service: "",
            src_yuno: "remote", src_role: "remote_role", src_service: "remote_service",
        }],
    };
}

function into_session(ievent, ws)
{
    ws.fire_open();
    ws.onmessage({data: JSON.stringify({
        event: "EV_IDENTITY_CARD_ACK",
        kw: {result: 0, data: {}, __md_iev__: {...stack(), __msg_type__: "__answer__"}},
    })});
    expect(gobj_current_state(ievent)).toBe("ST_SESSION");
}

function foreign_message(ws)
{
    ws.onmessage({data: JSON.stringify({
        event: "EV_MT_STATS",
        kw: {__md_iev__: {...stack("other_role"), __msg_type__: "__message__"}},
    })});
}

/*  The backoff starts at 1000 ms at least: fake time, a minute of it at most  */
async function next_socket_fake(count)
{
    for(let i = 0; i < 600 && sockets.length < count; i++) {
        await vi.advanceTimersByTimeAsync(100);
    }
    expect(sockets.length).toBe(count);
    return sockets[count - 1];
}

async function with_fake_timers(fn)
{
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "performance"]});
    try {
        await fn();
    } finally {
        vi.useRealTimers();
    }
}

async function next_socket(count)
{
    for(let i = 0; i < 200 && sockets.length < count; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(sockets.length).toBe(count);
    return sockets[count - 1];
}

describe("a session closed for a fault of the server", () => {
    test("is closed with 4002, and EV_ON_CLOSE says it", () => {
        const ievent = gobj_create_service("fault1", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://fault1",
        }, yuno);
        const listener = gobj_create_pure_child("fault1_listener", "C_PROBE_FAULT_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);

        gobj_start(ievent);
        const ws = sockets[sockets.length - 1];
        into_session(ievent, ws);
        published.length = 0;
        logged = [];

        foreign_message(ws);
        expect(ws.closed_with.code).toBe(4002);
        expect(logged.filter(l => /^error/.test(l))).toEqual([]);
        ws.fire_close(ws.closed_with.code);

        expect(published.map(p => p[0])).toEqual(["EV_ON_CLOSE"]);
        expect(published[0][1].code).toBe(4002);
        gobj_stop(ievent);
    });

    test("does not reset the backoff: it goes on growing, session after session", () => with_fake_timers(async () => {
        const ievent = gobj_create_service("fault2", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://fault2",
            timeout_retry:       1000,
            timeout_retry_max:   100000,
        }, yuno);
        gobj_start(ievent);
        let count = sockets.length;
        const seen = [];
        for(let round = 0; round < 3; round++) {
            const ws = sockets[count - 1];
            into_session(ievent, ws);
            expect(ievent.priv.retry_ms).toBe(0);
            foreign_message(ws);
            ws.fire_close(ws.closed_with.code);
            seen.push(ievent.priv.retry_ms);
            count++;
            await next_socket_fake(count);
        }
        expect(seen).toEqual([1000, 2000, 4000]);

        /*  A session that ends well starts the backoff over  */
        const ws = sockets[count - 1];
        into_session(ievent, ws);
        ws.fire_close(1000);
        expect(ievent.priv.retry_ms).toBe(1000);
        gobj_stop(ievent);
    }));

    test("a session that outlived the longest delay starts the backoff over, whatever came before", () => with_fake_timers(async () => {
        const ievent = gobj_create_service("fault4", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://fault4",
            timeout_retry:       1000,
            timeout_retry_max:   4000,
        }, yuno);
        gobj_start(ievent);
        let count = sockets.length;
        for(let round = 0; round < 3; round++) {
            const ws = sockets[count - 1];
            into_session(ievent, ws);
            foreign_message(ws);
            ws.fire_close(ws.closed_with.code);
            count++;
            await next_socket_fake(count);
        }
        expect(ievent.priv.retry_ms).toBe(4000);

        /*  Broken at once, the escalated delay is kept (above); after a
         *  session longer than timeout_retry_max, it is not  */
        const ws = sockets[count - 1];
        into_session(ievent, ws);
        await vi.advanceTimersByTimeAsync(4100);
        foreign_message(ws);
        expect(ws.closed_with.code).toBe(4002);
        ws.fire_close(ws.closed_with.code);
        expect(ievent.priv.retry_ms).toBe(1000);
        gobj_stop(ievent);
    }));

    test("with a timeout_retry below the floor, a session that broke at once keeps the backoff", () => with_fake_timers(async () => {
        const ievent = gobj_create_service("fault5", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://fault5",
            timeout_retry:       0,
            timeout_retry_max:   3000,
        }, yuno);
        gobj_start(ievent);
        let count = sockets.length;
        const seen = [];
        for(let round = 0; round < 3; round++) {
            const ws = sockets[count - 1];
            into_session(ievent, ws);
            foreign_message(ws);
            ws.fire_close(ws.closed_with.code);
            seen.push(ievent.priv.retry_ms);
            count++;
            await next_socket_fake(count);
        }
        expect(seen).toEqual([1000, 2000, 3000]);
        gobj_stop(ievent);
    }));

    test("an event out of session closes with 4002 too, and the backoff of the opens goes on", () => {
        const ievent = gobj_create_service("fault3", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://fault3",
        }, yuno);
        gobj_start(ievent);
        const ws = sockets[sockets.length - 1];
        ws.fire_open();
        ws.onmessage({data: JSON.stringify({
            event: "EV_MT_STATS",
            kw: {__md_iev__: {...stack(), __msg_type__: "__message__"}},
        })});
        expect(ws.closed_with.code).toBe(4002);
        gobj_stop(ievent);
    });
});
