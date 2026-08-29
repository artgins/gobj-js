/***********************************************************************
 *          ievent_dispatch.test.js
 *
 *      Where an incoming inter-event goes, and — the part this file
 *      exists for — where it does NOT go.
 *
 *      A message that names a destination service is ADDRESSED to it.
 *      When that service is gone, the message is not for anybody else,
 *      and the transport used to hand it to the fallback path instead:
 *      publish it to every local subscriber. That is the SERVICE
 *      subscription model, and it is the right home for a message that
 *      names NO destination — running an addressed one through it
 *      delivers one view's private stream to everyone.
 *
 *      It bit a real SPA and the shape is the ordinary end of a view's
 *      life: a view mounted under a service name subscribes to a backend
 *      event, the user navigates away, the view is destroyed, and the
 *      frames already on the wire keep arriving addressed to a name
 *      nobody answers to. They were published to everyone, which in
 *      practice meant the application gobj — subscribed to the transport
 *      with a NULL event, deliberately, because naming EV_ON_OPEN in a
 *      subscription forwards it upstream and the remote rejects it, and
 *      a null subscription matches everything. Its FSM does not declare
 *      a device frame, so it said so: "Event NOT DEFINED in state", 38
 *      of them in one 26 ms burst on a node with 38 devices.
 *
 *      So the three cases are pinned here together, because the fix is
 *      only correct if the third one still works:
 *
 *        - addressed to a service that EXISTS   -> delivered to it alone
 *        - addressed to a service that is GONE  -> dropped, not published
 *        - addressed to NOBODY                  -> published, as before
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
    gobj_destroy,
    gobj_subscribe_event,
    gobj_send_event,
    gobj_change_state,
    register_c_yuno,
    register_c_timer,
    register_c_ievent_cli,
    set_log_callback,
} from "../src/index.js";

const YUNO_ROLE = "probe_role";
const REMOTE_EVENT = "EV_PROBE_TRACK";

/*  What each end of the wiring saw, reset before every test.  */
let seen = {addressed: 0, broadcast: 0};
let logged = [];

/*
 *  Two throwaway gclasses: the one a message can be addressed to, and
 *  the one that stands in for the application gobj — subscribed to the
 *  transport with a null event and NOT declaring the remote event, which
 *  is exactly the gobj the old behaviour shouted at.
 */
const C_ADDRESSEE = "C_PROBE_ADDRESSEE";
const C_LISTENER  = "C_PROBE_LISTENER";

/*  Every gobj below hangs from it: gobj_create_service() with a null
 *  parent answers "gobj NEEDS a parent!" and builds nothing.  */
let yuno = null;

beforeAll(() => {
    /*  The sink is called (level, msg, hora); the console keeps its own
     *  copy, which is why the failure paths below still print.  */
    set_log_callback((level, msg) => {
        logged.push(`${level}: ${msg}`);
    });

    gobj_start_up(null, null, null, null, null, null, null);
    register_c_yuno();
    register_c_timer();
    register_c_ievent_cli();

    gclass_create(
        C_ADDRESSEE,
        [[REMOTE_EVENT, event_flag_t.EVF_PUBLIC_EVENT]],
        [["ST_IDLE", [[REMOTE_EVENT, () => { seen.addressed++; return 0; }, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    /*
     *  The listener declares the event so it can COUNT a delivery. The
     *  real application gobj does not declare it at all -- that is why
     *  the old path produced "Event NOT DEFINED in state" -- but a test
     *  that asserted on a log line would pass for the wrong reason the
     *  day the message changed. Counting a delivery is the fact.
     */
    gclass_create(
        C_LISTENER,
        [[REMOTE_EVENT, event_flag_t.EVF_PUBLIC_EVENT]],
        [["ST_IDLE", [[REMOTE_EVENT, () => { seen.broadcast++; return 0; }, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    yuno = gobj_create_yuno("probe_yuno", "C_YUNO", {yuno_role: YUNO_ROLE});
    gobj_start(yuno);
});

/***************************************************************
 *  A transport standing in a session, with a listener on it.
 *
 *  No websocket is opened: the state is set by hand, which is
 *  all ac_on_message asks of it, and the message is injected as
 *  EV_ON_MESSAGE exactly as the socket's onmessage does.
 ***************************************************************/
function make_transport(name)
{
    const ievent = gobj_create_service(name, "C_IEVENT_CLI", {
        remote_yuno_role:    "remote_role",
        remote_yuno_service: "remote_service",
        url:                 "ws://127.0.0.1:1",
    }, yuno);

    const listener = gobj_create_pure_child(`${name}_listener`, C_LISTENER, {}, ievent);
    gobj_start(listener);

    /*  A NULL event: matches everything this transport publishes, which
     *  is the subscription the application really makes.  */
    gobj_subscribe_event(ievent, null, {}, listener);

    gobj_change_state(ievent, "ST_SESSION");
    return ievent;
}

/***************************************************************
 *  One frame off the wire, addressed to `dst_service` ("" for a
 *  message that names nobody).
 ***************************************************************/
function deliver(ievent, dst_service)
{
    const kw = {
        __md_iev__: {
            ievent_gate_stack: [{
                dst_yuno:    "probe_yuno",
                dst_role:    YUNO_ROLE,
                dst_service: dst_service,
                src_yuno:    "remote_yuno",
                src_role:    "remote_role",
                src_service: "remote_service",
            }],
            __message__:  [REMOTE_EVENT],
            __msg_type__: "__message__",
        },
        id: "A-DEVICE",
    };

    gobj_send_event(ievent, "EV_ON_MESSAGE", {
        url:  "ws://127.0.0.1:1",
        data: JSON.stringify({event: REMOTE_EVENT, kw: kw}),
    }, ievent);
}

beforeEach(() => {
    seen = {addressed: 0, broadcast: 0};
    logged = [];
});

describe("an inter-event addressed to a service", () => {
    test("reaches that service, and nobody else", () => {
        const ievent = make_transport("t_alive");
        gobj_start(gobj_create_service("view_alive", C_ADDRESSEE, {}, yuno));

        deliver(ievent, "view_alive");

        expect(seen.addressed).toBe(1);
        expect(seen.broadcast).toBe(0);
    });

    test("is DROPPED when that service is gone — never published to everyone", () => {
        const ievent = make_transport("t_gone");
        const view = gobj_create_service("view_gone", C_ADDRESSEE, {}, yuno);
        gobj_start(view);

        /*  The view goes; the frames already in flight do not.  */
        gobj_destroy(view);
        deliver(ievent, "view_gone");

        expect(seen.addressed).toBe(0);
        expect(seen.broadcast).toBe(0);
    });

    test("and says so, naming the service and the event", () => {
        const ievent = make_transport("t_says");
        deliver(ievent, "view_never_existed");

        const line = logged.find(l => /view_never_existed/.test(l));
        expect(line).toBeTruthy();
        expect(line).toMatch(/DROPPED/);
        expect(line).toMatch(new RegExp(REMOTE_EVENT));
    });
});

describe("an inter-event that names no destination", () => {
    /*
     *  The SERVICE subscription model, and the reason the check above is
     *  a check and not a removal: this is the path a publication with no
     *  addressee takes, and it has to keep working.
     */
    test("is published to whoever subscribed to the transport", () => {
        const ievent = make_transport("t_open");
        deliver(ievent, "");

        expect(seen.broadcast).toBe(1);
        expect(seen.addressed).toBe(0);
    });
});
