/***********************************************************************
 *          ievent_pure_child.test.js
 *
 *      Who hears a C_IEVENT_CLI, and how. The C contract (c_ievent_cli.c):
 *      `mt_create` subscribes the `subscriber` attr, ELSE, for a pure
 *      child, its parent -- one subscription, so a parent that is also
 *      the explicit subscriber hears each event once -- and every event
 *      the transport emits is PUBLISHED.
 *
 *      Up to gobj-js 7.26.21 a pure child SENT EV_ON_ID_NAK, EV_ON_OPEN
 *      and every message that names no service to its parent, and
 *      subscribed nobody: so its parent never heard EV_ON_CLOSE nor
 *      EV_ON_OPEN_ERROR (published to no subscriber), a `subscriber`
 *      other than the parent never heard the three that were sent, and a
 *      host ending the transport in its EV_ON_ID_NAK did it inside an
 *      action of the transport instead of inside its publication -- the
 *      check of gobj_destroy() said another thing than C's.
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
    gobj_create_service,
    gobj_create_pure_child,
    gobj_start,
    gobj_name,
    gobj_send_event,
    gobj_change_state,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
    set_log_callback,
} from "../src/index.js";

const YUNO_ROLE = "pure_role";
const REMOTE_EVENT = "EV_PURE_TRACK";
const EVENTS = ["EV_ON_OPEN", "EV_ON_CLOSE", "EV_ON_ID_NAK", "EV_ON_OPEN_ERROR", REMOTE_EVENT];

let heard = [];
let logged = [];
let yuno = null;
let seq = 0;

beforeAll(() => {
    set_log_callback((level, msg) => {
        logged.push(`${level}: ${msg}`);
    });
    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();

    gclass_create(
        "C_PURE_HOST",
        EVENTS.map((ev) => [ev, event_flag_t.EVF_PUBLIC_EVENT]),
        [["ST_IDLE", EVENTS.map((ev) => [ev, (gobj, event) => {
            heard.push(`${gobj_name(gobj)}:${event}`);
            return 0;
        }, null])]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    yuno = gobj_create_yuno("pure_yuno", "C_YUNO", {yuno_role: YUNO_ROLE});
    gobj_start(yuno);
});

beforeEach(() => {
    heard = [];
    logged = [];
});

function iev_stack()
{
    return {
        ievent_gate_stack: [{
            dst_yuno:    "pure_yuno",
            dst_role:    YUNO_ROLE,
            dst_service: "",
            src_yuno:    "remote_yuno",
            src_role:    "remote_role",
            src_service: "remote_service",
        }],
    };
}

/*  A transport hosted as a PURE CHILD of `host`, with `kw` added.  */
function make_transport(host, kw)
{
    const iev = gobj_create_pure_child(`iev_${++seq}`, "C_IEVENT_CLI", Object.assign({
        remote_yuno_role:    "remote_role",
        remote_yuno_service: "remote_service",
        url:                 "ws://127.0.0.1:1",
    }, kw || {}), host);
    return iev;
}

function identity_ack(iev, result)
{
    gobj_change_state(iev, "ST_WAIT_IDENTITY_CARD_ACK");
    gobj_send_event(iev, "EV_IDENTITY_CARD_ACK", {
        result: result,
        comment: result < 0 ? "refused" : "",
        username: "u",
        __md_iev__: iev_stack(),
    }, iev);
}

function message(iev)
{
    const kw = {__md_iev__: Object.assign(iev_stack(), {
        __message__: [REMOTE_EVENT],
        __msg_type__: "__message__",
    })};
    gobj_send_event(iev, "EV_ON_MESSAGE", {
        url: "ws://127.0.0.1:1",
        data: JSON.stringify({event: REMOTE_EVENT, kw: kw}),
    }, iev);
}

describe("a C_IEVENT_CLI hosted as a pure child", () => {
    test("with no subscriber: its parent hears every event once, EV_ON_CLOSE too", () => {
        const host = gobj_create_service(`host_${++seq}`, "C_PURE_HOST", {}, yuno);
        const iev = make_transport(host);
        const h = gobj_name(host);

        identity_ack(iev, 0);
        message(iev);
        gobj_change_state(iev, "ST_SESSION");
        gobj_send_event(iev, "EV_ON_CLOSE", {code: 1006, reason: "", was_clean: false}, iev);

        expect(heard).toEqual([`${h}:EV_ON_OPEN`, `${h}:${REMOTE_EVENT}`, `${h}:EV_ON_CLOSE`]);
    });

    test("the parent as the explicit subscriber too: still once each", () => {
        const host = gobj_create_service(`host_${++seq}`, "C_PURE_HOST", {}, yuno);
        const iev = make_transport(host, {subscriber: host});
        const h = gobj_name(host);

        identity_ack(iev, -1);

        expect(heard).toEqual([`${h}:EV_ON_ID_NAK`]);
    });

    test("with a subscriber that is not its parent: the subscriber hears them, the parent does not", () => {
        const host = gobj_create_service(`host_${++seq}`, "C_PURE_HOST", {}, yuno);
        const other = gobj_create_service(`other_${++seq}`, "C_PURE_HOST", {}, yuno);
        const iev = make_transport(host, {subscriber: other});
        const o = gobj_name(other);

        identity_ack(iev, -1);
        identity_ack(iev, 0);
        message(iev);

        expect(heard).toEqual([`${o}:EV_ON_ID_NAK`, `${o}:EV_ON_OPEN`, `${o}:${REMOTE_EVENT}`]);
    });
});
