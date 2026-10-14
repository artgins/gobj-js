/***********************************************************************
 *          ievent_peer_logs.test.js
 *
 *      What C_IEVENT_CLI logs of what the server sent: never a secret.
 *
 *        - a frame that is not json: the error of JSON.parse() quotes a
 *          slice of the frame, and the slice can begin inside a secret's
 *          name ('..."assword": hunter2}" is not valid JSON'), where no
 *          masking can tell it; the frame dropped was logged raw;
 *        - the name of an event, and of the service it is addressed to,
 *          are the server's text: masked, as the C kernel masks the name
 *          of an event that is not public.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_service,
    gobj_start,
    gobj_send_event,
    gobj_change_state,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
    set_log_callback,
} from "../src/index.js";

const YUNO_ROLE = "peer_logs_role";

let logged = [];
let yuno = null;

beforeAll(() => {
    set_log_callback((level, msg) => {
        logged.push(`${level}: ${typeof msg === "string"? msg : JSON.stringify(msg)}`);
    });
    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();
    yuno = gobj_create_yuno("peer_logs_yuno", "C_YUNO", {yuno_role: YUNO_ROLE});
    gobj_start(yuno);
});

beforeEach(() => {
    logged = [];
});

function make_transport(name, in_session)
{
    const ievent = gobj_create_service(name, "C_IEVENT_CLI", {
        remote_yuno_role:    "remote_role",
        remote_yuno_service: "remote_service",
        url:                 "ws://127.0.0.1:1",
    }, yuno);
    gobj_change_state(ievent, in_session? "ST_SESSION" : "ST_WAIT_IDENTITY_CARD_ACK");
    return ievent;
}

function receive(ievent, data)
{
    gobj_send_event(ievent, "EV_ON_MESSAGE", {url: "ws://127.0.0.1:1", data: data}, ievent);
}

function shown(secret)
{
    return logged.filter(l => l.indexOf(secret) >= 0);
}

describe("a frame that is not json", () => {
    test("its bytes are not logged as they came, nor the slice of the parse error", () => {
        const ievent = make_transport("t_not_json", true);
        receive(ievent, '{"event": "EV_X", "kw": {"password": nj1-hunter2}}');
        expect(logged.length).toBeGreaterThan(0);
        expect(shown("nj1-hunter2")).toEqual([]);
    });

    test("a slice that begins inside a secret's name shows nothing either", () => {
        // 60 bytes before the name: V8 quotes about ten on each side of the error
        const ievent = make_transport("t_not_json2", true);
        receive(ievent, '{"event": "EV_X", "kw": {"note": "' + "x".repeat(60) + '", "password": nj2hunter2}}');
        expect(shown("nj2hunter2")).toEqual([]);
    });
});

describe("the names the server sends", () => {
    test("an event out of session: its name masked", () => {
        const ievent = make_transport("t_not_session", false);
        receive(ievent, JSON.stringify({event: "EV_X password=ev1-hunter2", kw: {}}));
        expect(logged.some(l => /not-session/.test(l))).toBe(true);
        expect(shown("ev1-hunter2")).toEqual([]);
    });

    test("an event addressed to a service that is gone: both names masked", () => {
        const ievent = make_transport("t_gone", true);
        const kw = {
            __md_iev__: {
                ievent_gate_stack: [{
                    dst_yuno:    "peer_logs_yuno",
                    dst_role:    YUNO_ROLE,
                    dst_service: "gone token=sv1-hunter2",
                    src_yuno:    "remote_yuno",
                    src_role:    "remote_role",
                    src_service: "remote_service",
                }],
                __msg_type__: "__message__",
            },
        };
        receive(ievent, JSON.stringify({event: "EV_Y eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sv2-hunter2", kw: kw}));
        expect(logged.some(l => /DROPPED/.test(l))).toBe(true);
        expect(shown("sv1-hunter2")).toEqual([]);
        expect(shown("sv2-hunter2")).toEqual([]);
    });

    test("a subscription the client ignores: both names masked", () => {
        const ievent = make_transport("t_subs", true);
        const kw = {
            __md_iev__: {
                ievent_gate_stack: [{
                    dst_yuno:    "peer_logs_yuno",
                    dst_role:    YUNO_ROLE,
                    dst_service: "svc password=sb1-hunter2",
                    src_yuno:    "remote_yuno",
                    src_role:    "remote_role",
                    src_service: "remote_service",
                }],
                __msg_type__: "__subscribing__",
            },
        };
        receive(ievent, JSON.stringify({event: "EV_Z token=sb2-hunter2", kw: kw}));
        expect(logged.some(l => /subscription event ignored/.test(l))).toBe(true);
        expect(shown("sb1-hunter2")).toEqual([]);
        expect(shown("sb2-hunter2")).toEqual([]);
    });

    test("a role that is not mine: masked", () => {
        const ievent = make_transport("t_role", true);
        const kw = {
            __md_iev__: {
                ievent_gate_stack: [{
                    dst_yuno:    "peer_logs_yuno",
                    dst_role:    "other pwd=rl1-hunter2",
                    dst_service: "svc",
                    src_yuno:    "remote_yuno",
                    src_role:    "remote_role",
                    src_service: "remote_service",
                }],
                __msg_type__: "__message__",
            },
        };
        receive(ievent, JSON.stringify({event: "EV_R", kw: kw}));
        expect(logged.some(l => /not my role/.test(l))).toBe(true);
        expect(shown("rl1-hunter2")).toEqual([]);
    });
});

describe("the close of the websocket", () => {
    test("the reason the server gives is masked", () => {
        const ievent = make_transport("t_close", true);
        gobj_send_event(ievent, "EV_ON_CLOSE",
            {url: "ws://127.0.0.1:1", code: 1008, reason: "bad token=cl1-hunter2", was_clean: true}, ievent);
        expect(logged.some(l => /WebSocket closed/.test(l))).toBe(true);
        expect(shown("cl1-hunter2")).toEqual([]);
    });
});
