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
 *          of an event that is not public;
 *        - what the server got wrong is a WARNING, not an ERROR: bad
 *          bytes from a peer are not a broken invariant of ours;
 *        - a message addressed to no service, of an event that no gclass
 *          declares, is dropped with a WARNING, its name masked: it was
 *          published as it came, and its name reached the log raw in
 *          "Publish event WITHOUT subscribers" or "Event NOT DEFINED in
 *          state";
 *        - and so is one of an event no gclass declares PUBLIC, as the C
 *          transport refuses it (gclass_find_public_event()): it was
 *          published to the app as if the transport had said it;
 *        - the events the transport says ITSELF (EV_ON_OPEN, EV_ON_CLOSE,
 *          EV_ON_ID_NAK, EV_TIMEOUT...) are never taken from the server,
 *          in any case of letters, whoever else declares them public.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    SDATA_END,
    event_flag_t,
    gclass_create,
    gobj_subscribe_event,
    gobj_create_pure_child,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_service,
    gobj_start,
    gobj_send_event,
    gobj_change_state,
    gobj_set_gobj_trace,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
    set_log_callback,
} from "../src/index.js";

const YUNO_ROLE = "peer_logs_role";

let logged = [];
const heard = [];
let yuno = null;

beforeAll(() => {
    set_log_callback((level, msg) => {
        logged.push(`${level}: ${typeof msg === "string"? msg : JSON.stringify(msg)}`);
    });
    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();
    gclass_create(
        "C_PROBE_PEER_LISTENER",
        [
            ["EV_PEER_DECLARED", event_flag_t.EVF_PUBLIC_EVENT],
            ["EV_PEER_NOT_PUBLIC", 0],
            ["EV_ON_OPEN", 0], ["EV_ON_CLOSE", 0], ["EV_ON_OPEN_ERROR", 0],
            ["EV_ON_ID_NAK", 0], ["EV_TIMEOUT", 0], ["EV_ON_MESSAGE", 0],
        ],
        [["ST_IDLE", [
            ["EV_PEER_DECLARED", (g, ev, kw) => {
                heard.push(ev);
                return 0;
            }, null],
            ["EV_PEER_NOT_PUBLIC", (g, ev, kw) => {
                heard.push(ev);
                return 0;
            }, null],
            ...["EV_ON_OPEN", "EV_ON_CLOSE", "EV_ON_OPEN_ERROR", "EV_ON_ID_NAK", "EV_TIMEOUT", "EV_ON_MESSAGE"]
                .map(name => [name, (g, ev, kw) => {
                    heard.push(ev);
                    return 0;
                }, null]),
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    yuno = gobj_create_yuno("peer_logs_yuno", "C_YUNO", {yuno_role: YUNO_ROLE});
    gobj_start(yuno);
});

beforeEach(() => {
    logged = [];
    heard.length = 0;
});

function iev_kw(dst_service, dst_role = YUNO_ROLE, dst_yuno = "peer_logs_yuno")
{
    return {
        __md_iev__: {
            ievent_gate_stack: [{
                dst_yuno:    dst_yuno,
                dst_role:    dst_role,
                dst_service: dst_service,
                src_yuno:    "remote_yuno",
                src_role:    "remote_role",
                src_service: "remote_service",
            }],
            __msg_type__: "__message__",
        },
    };
}

function errors()
{
    return logged.filter(l => /^error/.test(l));
}

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

/*  An open socket that records its close: the server's faults close it.  */
function attach_socket(ievent)
{
    const ws = {
        readyState: 1,
        closed: false,
        close() {
            this.closed = true;
            this.readyState = 2;
        },
        send() {},
    };
    ievent.priv.websocket = ws;
    return ws;
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
        expect(logged.some(l => /^warning: .*not-session/.test(l))).toBe(true);
        expect(errors()).toEqual([]);
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
        expect(logged.some(l => /^warning: .*not my role/.test(l))).toBe(true);
        expect(errors()).toEqual([]);
        expect(shown("rl1-hunter2")).toEqual([]);
    });
});

describe("what the server gets wrong is a warning, and what no gclass declares is dropped", () => {
    test("an event the service it names does not take as public: a WARNING, its name masked", () => {
        const ievent = make_transport("t_not_public", true);
        const svc = gobj_create_service("peer_svc_not_public", "C_PROBE_PEER_LISTENER", {}, yuno);
        gobj_start(svc);
        receive(ievent, JSON.stringify({event: "EV_N token=np1-hunter2", kw: iev_kw("peer_svc_not_public")}));
        receive(ievent, JSON.stringify({event: "EV_PEER_NOT_PUBLIC", kw: iev_kw("peer_svc_not_public")}));
        expect(logged.filter(l => /^warning: .*no event or not public/.test(l)).length).toBe(2);
        expect(errors()).toEqual([]);
        expect(heard).toEqual([]);
        expect(shown("np1-hunter2")).toEqual([]);
    });

    test("a message to no service, of an event no gclass declares: dropped, a WARNING, its name masked", () => {
        const ievent = make_transport("t_undeclared", true);
        const listener = gobj_create_pure_child("t_undeclared_listener", "C_PROBE_PEER_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        receive(ievent, JSON.stringify({event: "EV_U password=ud1-hunter2", kw: iev_kw("")}));
        expect(heard).toEqual([]);
        expect(logged.filter(l => /^warning: .*no gclass declares.*DROPPED/.test(l)).length).toBe(1);
        expect(errors()).toEqual([]);
        expect(logged.some(l => /WITHOUT subscribers|NOT DEFINED/.test(l))).toBe(false);
        expect(shown("ud1-hunter2")).toEqual([]);
    });

    test("the same with nobody subscribed: no raw name in a 'WITHOUT subscribers'", () => {
        const ievent = make_transport("t_undeclared_alone", true);
        receive(ievent, JSON.stringify({event: "EV_U token=ud2-hunter2", kw: iev_kw("")}));
        expect(logged.some(l => /WITHOUT subscribers/.test(l))).toBe(false);
        expect(shown("ud2-hunter2")).toEqual([]);
    });

    test("a message to no service, of an event declared but not public: dropped, a WARNING", () => {
        const ievent = make_transport("t_not_public_no_svc", true);
        const listener = gobj_create_pure_child("t_not_public_no_svc_listener", "C_PROBE_PEER_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        receive(ievent, JSON.stringify({event: "EV_PEER_NOT_PUBLIC", kw: iev_kw("")}));
        expect(heard).toEqual([]);
        expect(logged.filter(l => /^warning: .*no gclass declares public.*DROPPED/.test(l)).length).toBe(1);
        expect(errors()).toEqual([]);
    });

    test("the events the transport says itself are never taken from the server", () => {
        gclass_create(
            "C_PROBE_PUBLIC_ON_OPEN",   // as C's C_PROT_HTTP_SR declares them
            [["EV_ON_OPEN", event_flag_t.EVF_PUBLIC_EVENT], ["EV_ON_CLOSE", event_flag_t.EVF_PUBLIC_EVENT]],
            [["ST_IDLE", [
                ["EV_ON_OPEN", () => 0, null],
                ["EV_ON_CLOSE", () => 0, null],
            ]]],
            {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
        );
        logged = [];
        const ievent = make_transport("t_own_events", true);
        const listener = gobj_create_pure_child("t_own_events_listener", "C_PROBE_PEER_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        const names = ["EV_ON_OPEN", "EV_ON_CLOSE", "EV_ON_OPEN_ERROR", "EV_ON_ID_NAK", "EV_TIMEOUT",
            "EV_ON_MESSAGE", "ev_on_open", "Ev_On_Close", "EV_IDENTITY_CARD_ACK"];
        for(const name of names) {
            receive(ievent, JSON.stringify({event: name,
                kw: {...iev_kw(""), username: "intruder", services_roles: {all: ["root"]}}}));
        }
        expect(heard).toEqual([]);
        expect(logged.filter(l => /^warning: .*event of the transport itself.*DROPPED/.test(l)).length)
            .toBe(names.length);
        expect(errors()).toEqual([]);
        expect(ievent.priv.inform_on_close).toBeFalsy();
    });

    test("a message to no service, of an event some gclass declares public: published", () => {
        const ievent = make_transport("t_declared", true);
        const listener = gobj_create_pure_child("t_declared_listener", "C_PROBE_PEER_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        receive(ievent, JSON.stringify({event: "EV_PEER_DECLARED", kw: iev_kw("")}));
        expect(heard).toEqual(["EV_PEER_DECLARED"]);
        expect(errors()).toEqual([]);
    });
});

describe("stats and commands the server asks of this client", () => {
    test("are not served: a WARNING each, the command masked, nothing published, the channel kept", () => {
        const ievent = make_transport("t_mt_asked", true);
        const listener = gobj_create_pure_child("t_mt_asked_listener", "C_PROBE_PEER_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        const ws = attach_socket(ievent);
        logged = [];
        receive(ievent, JSON.stringify({event: "EV_MT_STATS",
            kw: {...iev_kw(""), __stats__: "stats"}}));
        receive(ievent, JSON.stringify({event: "ev_mt_command",
            kw: {...iev_kw(""), __command__: "set-pin pin=hunter2"}}));
        expect(logged.filter(l => /^warning: .*EV_MT_STATS.*not served by this client.*'stats'/.test(l)).length)
            .toBe(1);
        expect(logged.filter(l => /^warning: .*EV_MT_COMMAND.*not served by this client/.test(l)).length)
            .toBe(1);
        expect(shown("hunter2")).toEqual([]);
        expect(heard).toEqual([]);
        expect(errors()).toEqual([]);
        expect(ws.closed).toBe(false);
    });
});

describe("the routing of a message, as the C transport checks it", () => {
    test("before the session only EV_IDENTITY_CARD_ACK: any other event is a WARNING and the channel goes", () => {
        const ievent = make_transport("t_pre_session", false);
        const ws = attach_socket(ievent);
        receive(ievent, JSON.stringify({event: "EV_MT_STATS", kw: iev_kw("")}));
        expect(logged.filter(l => /^warning: .*not-session state EV_MT_STATS/.test(l)).length).toBe(1);
        expect(errors()).toEqual([]);
        expect(ws.closed).toBe(true);
    });

    test("an empty dst_role is legal: the message is routed", () => {
        const ievent = make_transport("t_empty_role", true);
        const listener = gobj_create_pure_child("t_empty_role_listener", "C_PROBE_PEER_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        const ws = attach_socket(ievent);   // after: a subscription in session goes to the server
        receive(ievent, JSON.stringify({event: "EV_PEER_DECLARED", kw: iev_kw("", "", "")}));
        expect(heard).toEqual(["EV_PEER_DECLARED"]);
        expect(logged.filter(l => /^(warning|error)/.test(l))).toEqual([]);
        expect(ws.closed).toBe(false);
    });

    test("a role that is not mine: a WARNING, the names masked, and the channel goes", () => {
        const ievent = make_transport("t_role_close", true);
        const ws = attach_socket(ievent);
        receive(ievent, JSON.stringify({event: "EV_PEER_DECLARED password=rc1-hunter2",
            kw: iev_kw("", "other token=rc2-hunter2")}));
        expect(logged.filter(l => /^warning: .*not my role/.test(l)).length).toBe(1);
        expect(errors()).toEqual([]);
        expect(shown("rc1-hunter2")).toEqual([]);
        expect(shown("rc2-hunter2")).toEqual([]);
        expect(ws.closed).toBe(true);
    });

    test("a yuno name that is not mine: a WARNING, masked, and the channel goes", () => {
        const ievent = make_transport("t_name_close", true);
        const listener = gobj_create_pure_child("t_name_close_listener", "C_PROBE_PEER_LISTENER", {}, ievent);
        gobj_start(listener);
        gobj_subscribe_event(ievent, null, {}, listener);
        const ws = attach_socket(ievent);
        receive(ievent, JSON.stringify({event: "EV_PEER_DECLARED",
            kw: iev_kw("", YUNO_ROLE, "other_yuno pwd=nm1-hunter2")}));
        expect(heard).toEqual([]);
        expect(logged.filter(l => /^warning: .*not my name/.test(l)).length).toBe(1);
        expect(shown("nm1-hunter2")).toEqual([]);
        expect(ws.closed).toBe(true);
    });

    test("a name is shown capped at 128 characters, as C", () => {
        const ievent = make_transport("t_role_cap", true);
        attach_socket(ievent);
        receive(ievent, JSON.stringify({event: "EV_PEER_DECLARED", kw: iev_kw("", "r".repeat(300))}));
        const line = logged.find(l => /not my role/.test(l));
        expect(line).toContain("r".repeat(128));
        expect(line).not.toContain("r".repeat(129));
    });
});

describe("the close of the websocket", () => {
    /*  A close is no warning (ievent_close_logs.test.js); with the
     *  gclass's `ievents` trace on it is traced, its reason masked.  */
    test("the reason the server gives is masked in the trace", () => {
        const ievent = make_transport("t_close", true);
        gobj_set_gobj_trace(ievent, "ievents", true);
        gobj_send_event(ievent, "EV_ON_CLOSE",
            {url: "ws://127.0.0.1:1", code: 1008, reason: "bad token=cl1-hunter2", was_clean: true}, ievent);
        gobj_set_gobj_trace(ievent, "ievents", false);
        expect(logged.some(l => /WebSocket closed/.test(l))).toBe(true);
        expect(shown("cl1-hunter2")).toEqual([]);
    });
});
