/***********************************************************************
 *          ievent_restart.test.js
 *
 *      A stop and a start of C_IEVENT_CLI in the same turn (a frontend
 *      that changes the url of its link: stop, write url, start).
 *
 *      The close of the OLD socket arrives after the new socket exists.
 *      It used to reach ac_on_close as the current one: it unwired the
 *      NEW socket's handlers and nulled priv.websocket, so the new link
 *      stayed open for ever with nobody listening. And the new socket's
 *      open, arriving while the FSM was still in ST_SESSION, was not a
 *      transport event there: it went to mt_inject_event and was sent
 *      to the backend as a message called EV_ON_OPEN.
 *
 *      Now each socket carries its sequence number, a stale one is
 *      ignored, and mt_start() ends the old session itself.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
    SDATA_END,
    event_flag_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_service,
    gobj_create_pure_child,
    gobj_start,
    gobj_stop,
    gobj_subscribe_event,
    gobj_current_state,
    gobj_write_str_attr,
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
        if(url === "ws://bad") {
            throw new SyntaxError("bad url");     // as the browser does for a malformed url
        }
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
        this.onopen && this.onopen();
    }
    fire_close() {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose && this.onclose({code: 1000, reason: "", wasClean: true});
    }
}

const published = [];
let yuno = null;

beforeAll(() => {
    globalThis.WebSocket = FakeWebSocket;
    set_log_callback(() => {});

    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();

    gclass_create(
        "C_PROBE_LINK_LISTENER",
        [["EV_ON_OPEN", 0], ["EV_ON_CLOSE", 0], ["EV_ON_OPEN_ERROR", 0]],
        [["ST_IDLE", [
            ["EV_ON_OPEN",       (g, ev) => { published.push(ev); return 0; }, null],
            ["EV_ON_CLOSE",      (g, ev) => { published.push(ev); return 0; }, null],
            ["EV_ON_OPEN_ERROR", (g, ev) => { published.push(ev); return 0; }, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    yuno = gobj_create_yuno("probe_yuno", "C_YUNO", {yuno_role: "probe_role"});
    gobj_start(yuno);
});

/*  The identity card is the first frame; its ack puts the link in session. */
function into_session(ievent, ws)
{
    ws.fire_open();
    expect(ws.sent[0].event).toBe("EV_IDENTITY_CARD");
    ws.onmessage({data: JSON.stringify({
        event: "EV_IDENTITY_CARD_ACK",
        kw: {
            result: 0,
            data: {},
            __md_iev__: {
                ievent_gate_stack: [{
                    dst_yuno: "probe_yuno", dst_role: "probe_role", dst_service: "",
                    src_yuno: "remote", src_role: "remote_role", src_service: "remote_service",
                }],
                __msg_type__: "__answer__",
            },
        },
    })});
    expect(gobj_current_state(ievent)).toBe("ST_SESSION");
}

describe("C_IEVENT_CLI stopped and started in the same turn", () => {
    test("ends the old session, and the new socket is the one listened to", () => {
        const ievent = gobj_create_service("link", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://old",
        }, yuno);
        const listener = gobj_create_pure_child("link_listener", "C_PROBE_LINK_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);

        gobj_start(ievent);
        const ws_old = sockets[sockets.length - 1];
        into_session(ievent, ws_old);
        published.length = 0;

        gobj_stop(ievent);
        gobj_write_str_attr(ievent, "url", "ws://new");
        gobj_start(ievent);
        const ws_new = sockets[sockets.length - 1];
        expect(ws_new).not.toBe(ws_old);
        expect(ws_new.url).toBe("ws://new");

        /*  The old session ended at the start, not at its late close.  */
        expect(published).toEqual(["EV_ON_CLOSE"]);
        expect(gobj_current_state(ievent)).toBe("ST_DISCONNECTED");

        /*  The late close of the old socket changes nothing ...  */
        ws_old.fire_close();
        expect(ws_new.onmessage).not.toBe(null);
        expect(ievent.priv.websocket).toBe(ws_new);

        /*  ... and the new one opens into a fresh session.  */
        into_session(ievent, ws_new);
        expect(ws_new.sent.map(m => m.event)).toEqual(["EV_IDENTITY_CARD"]);
        expect(published).toEqual(["EV_ON_CLOSE", "EV_ON_OPEN"]);
    });

    test("a stop alone still delivers its EV_ON_CLOSE when the socket closes", () => {
        const ievent = gobj_create_service("link2", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://only",
        }, yuno);
        const listener = gobj_create_pure_child("link2_listener", "C_PROBE_LINK_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);

        gobj_start(ievent);
        const ws = sockets[sockets.length - 1];
        into_session(ievent, ws);
        published.length = 0;

        gobj_stop(ievent);
        expect(published).toEqual([]);
        ws.fire_close();
        expect(published).toEqual(["EV_ON_CLOSE"]);
        expect(gobj_current_state(ievent)).toBe("ST_DISCONNECTED");
    });

    test("a start whose url fails still makes the old socket stale", () => {
        const ievent = gobj_create_service("link3", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://good",
        }, yuno);
        const listener = gobj_create_pure_child("link3_listener", "C_PROBE_LINK_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);

        gobj_start(ievent);
        const ws_old = sockets[sockets.length - 1];
        into_session(ievent, ws_old);
        published.length = 0;

        gobj_stop(ievent);
        gobj_write_str_attr(ievent, "url", "ws://bad");
        gobj_start(ievent);
        expect(published).toEqual(["EV_ON_CLOSE"]);

        /*  Its late close must not be delivered a second time (it was an
         *  EV_ON_OPEN_ERROR and a retry armed against the bad url).  */
        ws_old.fire_close();
        expect(published).toEqual(["EV_ON_CLOSE"]);
        gobj_stop(ievent);
    });

    test("a url the browser refuses still publishes EV_ON_OPEN_ERROR and retries", async () => {
        const ievent = gobj_create_service("link4", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://bad",
        }, yuno);
        const listener = gobj_create_pure_child("link4_listener", "C_PROBE_LINK_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        published.length = 0;

        const n_sockets = sockets.length;
        gobj_start(ievent);
        expect(sockets.length).toBe(n_sockets);     // the constructor threw
        expect(published).toEqual([]);              // posted, not sent from mt_start

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(published).toEqual(["EV_ON_OPEN_ERROR"]);
        expect(gobj_current_state(ievent)).toBe("ST_DISCONNECTED");

        /*  And the retry is armed (next_retry() moved the backoff).  */
        expect(ievent.priv.retry_ms).toBeGreaterThan(0);
        gobj_stop(ievent);
    });

    test("a stop while still connecting publishes nothing", () => {
        const ievent = gobj_create_service("link5", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://slow",
        }, yuno);
        const listener = gobj_create_pure_child("link5_listener", "C_PROBE_LINK_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        published.length = 0;

        gobj_start(ievent);
        const ws = sockets[sockets.length - 1];
        gobj_stop(ievent);
        ws.fire_close();
        expect(published).toEqual([]);
        expect(gobj_current_state(ievent)).toBe("ST_DISCONNECTED");
    });

    test("a posted failure of a socket that a later start replaced is ignored", async () => {
        const ievent = gobj_create_service("link6", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://bad",
        }, yuno);
        const listener = gobj_create_pure_child("link6_listener", "C_PROBE_LINK_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        published.length = 0;

        gobj_start(ievent);                     // posts the failure of ws://bad
        gobj_stop(ievent);
        gobj_write_str_attr(ievent, "url", "ws://good2");
        gobj_start(ievent);                     // a new socket, a new ws_seq
        const ws = sockets[sockets.length - 1];
        expect(ws.url).toBe("ws://good2");

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(published).toEqual([]);          // the stale failure said nothing
        expect(ievent.priv.websocket).toBe(ws);
        gobj_stop(ievent);
    });

    test("the backoff doubles on every failed open, up to its top", async () => {
        const ievent = gobj_create_service("link7", "C_IEVENT_CLI", {
            remote_yuno_role:    "remote_role",
            remote_yuno_service: "remote_service",
            url:                 "ws://bad",
            timeout_retry:       30,
            timeout_retry_max:   120,
        }, yuno);
        const listener = gobj_create_pure_child("link7_listener", "C_PROBE_LINK_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        published.length = 0;

        gobj_start(ievent);
        const seen = [];
        const n_errors = () => published.filter(e => e === "EV_ON_OPEN_ERROR").length;
        for(let i = 0; i < 200 && n_errors() < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
            const r = ievent.priv.retry_ms;
            if(r && seen[seen.length - 1] !== r) {
                seen.push(r);
            }
        }
        gobj_stop(ievent);
        expect(n_errors()).toBeGreaterThanOrEqual(5);
        expect(seen).toEqual([30, 60, 120]);     // doubles, then stays at its top
    });
});

