/**************************************************************************
 *          c_ievent_cli.js
 *          Ievent_cli GClass.
 *
 *          Inter-event (client side)
 *          Simulate a remote service like a local gobj.
 *
 *      Licence: MIT (http://www.opensource.org/licenses/mit-license)
 *      Copyright (c) 2014,2024 Niyamaka.
 *      Copyright (c) 2025-2026, ArtGins.
 **************************************************************************/
import {
    YUNETA_VERSION,
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_flag_t,
    sdata_flag_t,
    event_flag_t,
    gclass_create,
    gobj_parent,
    gobj_short_name,
    gobj_yuno,
    gobj_trace_level,
    gobj_send_event,
    gobj_post_event,
    gobj_publish_event,
    gobj_read_integer_attr,
    gobj_read_str_attr,
    gobj_read_pointer_attr,
    gobj_write_str_attr,
    gobj_subscribe_event,
    gobj_is_pure_child,
    gobj_create_pure_child,
    gobj_name,
    gobj_current_state,
    gobj_is_destroying,
    gobj_yuno_name,
    gobj_yuno_role,
    gobj_find_subscriptions,
    gobj_is_running,
    gobj_is_playing,
    gobj_read_attr,
    gobj_yuno_id,
    gobj_has_event,
    gobj_find_event_type,
    gobj_find_service,
    gobj_change_state,
    gobj_read_bool_attr,

} from "./gobj.js";

import {
    log_error,
    log_debug,
    log_warning,
    trace_msg,
    current_timestamp,
    empty_string,
    msg_iev_push_stack,
    msg_iev_get_stack,
    kw_get_str,
    kw_get_int,
    kw_get_dict_value,
    node_uuid,
    msg_iev_set_msg_type,
    msg_iev_get_msg_type,
    trace_json,
    trace_json_masked,
    mask_secrets_inline,
    json_deep_copy,
    json_object_update,
    is_object,
    json_object_del,
    set_remote_log_functions, kw_flag_t,
} from "./helpers.js";

import {
    clear_timeout,
    set_timeout
} from "./c_timer.js";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_IEVENT_CLI";

const IEVENT_STACK_ID = "ievent_gate_stack";
const COMMAND_STACK_ID = "command_stack";
const STATS_STACK_ID   = "stats_stack";

/***************************************************************
 *              Data
 ***************************************************************/
/*---------------------------------------------*
 *          Attributes
 *---------------------------------------------*/
const attrs_table = [
/*-ATTR-type--------------------name----------------flag------------------------default-----description---------- */
SDATA (data_type_t.DTP_STRING,  "wanted_yuno_role", sdata_flag_t.SDF_RD,        "",         "wanted yuno role"),
SDATA (data_type_t.DTP_STRING,  "wanted_yuno_name", sdata_flag_t.SDF_RD,        "",         "wanted yuno name"),
SDATA (data_type_t.DTP_STRING,  "wanted_yuno_service",sdata_flag_t.SDF_RD,      "",         "wanted yuno service"),
SDATA (data_type_t.DTP_STRING,  "remote_yuno_role", sdata_flag_t.SDF_RD,        "",         "confirmed remote yuno role"),
SDATA (data_type_t.DTP_STRING,  "remote_yuno_name", sdata_flag_t.SDF_RD,        "",         "confirmed remote yuno name"),
SDATA (data_type_t.DTP_STRING,  "remote_yuno_service",sdata_flag_t.SDF_RD,      "",         "confirmed remote yuno service"),
SDATA (data_type_t.DTP_STRING,  "url",              sdata_flag_t.SDF_RD,        "",         "Url to connect"),
SDATA (data_type_t.DTP_STRING,  "jwt",              sdata_flag_t.SDF_PERSIST,   "",         "JWT"),
SDATA (data_type_t.DTP_STRING,  "cert_pem",         sdata_flag_t.SDF_PERSIST,   "",         "SSL server certification, PEM str format"),
SDATA (data_type_t.DTP_JSON,    "extra_info",       sdata_flag_t.SDF_RD,        "{}",       "dict data set by user, added to the identity card msg."),
SDATA (data_type_t.DTP_LIST,    "required_services",sdata_flag_t.SDF_RD,        "[]",       "Services this LINK requires (identity card). Empty = the yuno's `required_services`, as before. A yuno with several links to DIFFERENT backends must set it per link: the yuno-wide list is the union, so every backend is told the service names of all the others."),
SDATA (data_type_t.DTP_INTEGER, "timeout_retry",    sdata_flag_t.SDF_RD,        "5000",     "Base of the first reconnect delay (ms, ±20% jitter), at least 1000. It BACKS OFF from here, doubling up to timeout_retry_max, and resets when a session is reached"),
SDATA (data_type_t.DTP_INTEGER, "timeout_retry_max",sdata_flag_t.SDF_RD,        "60000",     "Cap of the reconnect backoff (ms). Set it equal to timeout_retry for the old fixed-interval behaviour"),
SDATA (data_type_t.DTP_INTEGER, "timeout_idack",    sdata_flag_t.SDF_RD,        "5000",     "timeout waiting idAck"),
SDATA (data_type_t.DTP_POINTER, "subscriber",       0,              0,          "subscriber of output-events. If null then subscriber is the parent"),
SDATA_END()
];

/*---------------------------------------------*
 *      GClass trace levels
 *  HACK strict ascendant value!
 *  required paired correlative strings
 *  in s_user_trace_level
 *---------------------------------------------*/
const TRACE_IEVENTS       = 0x0001;
const TRACE_IEVENTS2      = 0x0002;
const s_user_trace_level = [
    ["ievents",        "Trace inter-events with metadata of kw"],
    ["ievents2",       "Trace inter-events with full kw"],
    ["identity-card",  "Trace identity_card messages"],
];

/*  The traffic trace is this gclass's own level, as in the C kernel
 *  (`set-gclass-trace gclass=C_IEVENT_CLI level=ievents`). Where it goes
 *  is the yuno's `trace_ievent_callback`, the console when there is none. */
function is_traffic_tracing(gobj)
{
    return (gobj_trace_level(gobj) & (TRACE_IEVENTS|TRACE_IEVENTS2)) ? true : false;
}

/*---------------------------------------------*
 *              Private data
 *---------------------------------------------*/
let PRIVATE_DATA = {
    url:                null,
    remote_yuno_name:   null,
    remote_yuno_role:   null,
    remote_yuno_service:null,
    gobj_timer:         null,
    inform_on_close:    false,
    websocket:          null,
    inside_on_open:     false,  // avoid duplicates, no subscriptions while in on_open,
                                // they will send in resend_subscriptions
    retry_ms:           0,      // current backoff (0 = none yet); see next_retry()
    retry_ms_before_session: 0, // the backoff the ack reset; see close_for_peer_fault()
    session_since:      0,      // performance.now() of the ack; see close_for_peer_fault()
    retry_floor_warned: false,  // see retry_bounds()
};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    let priv = gobj.priv;

    /*
     *  Create children
     */
    priv.gobj_timer = gobj_create_pure_child(gobj_name(gobj), "C_TIMER", {}, gobj);
    priv.ws_seq = 0;    // identity of the current socket, see setup_websocket()

    priv.url = gobj_read_str_attr(gobj, "url");
    priv.remote_yuno_name = gobj_read_str_attr(gobj, "remote_yuno_name");
    priv.remote_yuno_role = gobj_read_str_attr(gobj, "remote_yuno_role");
    priv.remote_yuno_service = gobj_read_str_attr(gobj, "remote_yuno_service");

    gobj_write_str_attr(gobj, "wanted_yuno_name", priv.remote_yuno_name);
    gobj_write_str_attr(gobj, "wanted_yuno_role", priv.remote_yuno_role);
    gobj_write_str_attr(gobj, "wanted_yuno_service", priv.remote_yuno_service);

    /*
     *  SERVICE subscription model, and a pure child subscribes its parent:
     *  the C transport's. Every event is PUBLISHED, to one subscription.
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(subscriber) {
        gobj_subscribe_event(gobj, null, {}, subscriber);
    } else if(gobj_is_pure_child(gobj)) {
        subscriber = gobj_parent(gobj);
        gobj_subscribe_event(gobj, null, {}, subscriber);
    }
}

/***************************************************************
 *          Framework Method: Writing
 ***************************************************************/
function mt_writing(gobj, path)
{
    let priv = gobj.priv;

    switch(path) {
        case "url":
            priv.url = gobj_read_str_attr(gobj, "url");
            break;
        case "remote_yuno_name":
            priv.remote_yuno_name = gobj_read_str_attr(gobj, "remote_yuno_name");
            break;
        case "remote_yuno_role":
            priv.remote_yuno_role = gobj_read_str_attr(gobj, "remote_yuno_role");
            break;
        case "remote_yuno_service":
            priv.remote_yuno_service = gobj_read_str_attr(gobj, "remote_yuno_service");
            break;
    }
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    /*  Starting is a deliberate act (the operator pressed connect): it must
     *  not inherit the backoff a previous run had escalated to.  */
    priv.retry_ms = 0;
    priv.retry_ms_before_session = 0;

    if(gobj_current_state(gobj) !== "ST_DISCONNECTED") {
        /*
         *  A stop and a start in the same turn: the close of the old
         *  socket has not arrived yet, and it will now be ignored as
         *  stale (it carries an older ws_seq). Deliver that close here,
         *  so the old session ends (EV_ON_CLOSE published, FSM back in
         *  ST_DISCONNECTED) before the new socket can open.
         */
        gobj_send_event(
            gobj,
            "EV_ON_CLOSE",
            {
                url: priv.url, ws_seq: priv.ws_seq,
                code: 1000, reason: "restarted", was_clean: true
            },
            gobj
        );
        clear_timeout(priv.gobj_timer);
    }

    priv.websocket = setup_websocket(gobj);
    return 0;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    clear_timeout(priv.gobj_timer);

    if(priv.websocket) {
        /*
         *  Keep the .onclose handler wired: a deliberate stop that does
         *  NOT destroy the gobj (e.g. a frontend that stops
         *  __remote_service__ on logout and drives its UI teardown from
         *  the published EV_ON_CLOSE) still needs the async onclose to
         *  reach the FSM. This mirrors the C kernel, where mt_stop stops
         *  the bottom transport and ac_on_close publishes EV_ON_CLOSE.
         *  The stop+destroy-in-the-same-turn case is handled in the
         *  onclose handler itself (gobj_is_destroying guard).
         */
        close_websocket(gobj);
    }

    return 0;
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
}

/***************************************************************
 *          Framework Method: Stats
 *  Ask for stats to remote `kw.service` (or wanted_yuno_service)
 ***************************************************************/
function mt_stats(gobj, stats, kw, src)
{
    if(gobj_current_state(gobj) !== "ST_SESSION") {
        log_error(`Not in session`);
        return null;
    }

    if(!kw) {
        kw = {};
    }

    /*
     *      __REQUEST__ __MESSAGE__
     */
    let jn_ievent_id = build_cli_ievent_request(
        gobj,
        gobj_name(src),
        kw_get_str(gobj, kw, "service", null, 0)
    );

    let __md_stats__ = kw_get_dict_value(
        gobj, kw, "__md_stats__", null, kw_flag_t.KW_EXTRACT
    );
    if(__md_stats__) {
        //
    } else {
        __md_stats__ = {};
    }

    msg_iev_push_stack(
        gobj,
        kw,         // not owned
        STATS_STACK_ID,
        {
            "stats": stats,
            "kw": __md_stats__
        }
    );

    msg_iev_push_stack(
        gobj,
        kw,
        IEVENT_STACK_ID,
        jn_ievent_id
    );

    kw["__stats__"] = stats;
    msg_iev_set_msg_type(gobj, kw, "__stats__");

    send_static_iev(gobj, "EV_MT_STATS", kw, src);

    return null;   // return null on asynchronous response.
}

/***************************************************************
 *          Framework Method: Command
 *  Ask for command to remote `kw.service` (or wanted_yuno_service)
 ***************************************************************/
function mt_command(gobj, command, kw, src)
{
    if(gobj_current_state(gobj) !== "ST_SESSION") {
        log_error(`Not in session`);
        return null;
    }

    if(!kw) {
        kw = {};
    }

    /*
     *      __REQUEST__ __MESSAGE__
     */
    let jn_ievent_id = build_cli_ievent_request(
        gobj,
        gobj_name(src),
        kw_get_str(gobj, kw, "service", "", 0)
    );

    let __md_command__ = kw_get_dict_value(
        gobj, kw, "__md_command__", null, kw_flag_t.KW_EXTRACT
    );
    if(__md_command__) {
        //
    } else {
        __md_command__ = {};
    }

    msg_iev_push_stack(
        gobj,
        kw,         // not owned
        COMMAND_STACK_ID,
        {
            "command": command,
            "kw": __md_command__
        }
    );

    msg_iev_push_stack(
        gobj,
        kw,
        IEVENT_STACK_ID,
        jn_ievent_id
    );

    kw["__command__"] = command;
    msg_iev_set_msg_type(gobj, kw, "__command__");

    send_static_iev(gobj, "EV_MT_COMMAND", kw, src);

    return null;   // return null on asynchronous response.
}

/***************************************************************
 *          Framework Method: inject_event
 *  Send event to remote `kw.service` (or wanted_yuno_service)
 ***************************************************************/
function mt_inject_event(gobj, event, kw, src)
{
    if(gobj_current_state(gobj) !== "ST_SESSION") {
        window.console.error(`Not in session`); // Don't use log_error
        return -1;
    }

    /*
     *  Below, the kw is changed (the ievent stack, the message type, the
     *  __service__ key): change a kw of our own. The kw may be a published
     *  one, which gobj_publish_event() hands the SAME to every subscriber
     *  that does not rewrite it: up to 7.25.7 what this gobj wrote in it
     *  reached every subscriber after it, and the publisher. The copy is
     *  shallow, except __md_iev__, whose stacks are pushed in place.
     */
    kw = json_object_update({}, is_object(kw) ? kw : {});
    if(is_object(kw["__md_iev__"])) {
        kw["__md_iev__"] = json_deep_copy(kw["__md_iev__"]);
    }

    /*
     *      __MESSAGE__
     *  Put the ievent if it doesn't come with it,
     *  if it does come with it, it's because it will be a response
     */
    let jn_request = msg_iev_get_stack(gobj, kw, IEVENT_STACK_ID);
    if(jn_request) {
        /*
         *      __RESPONSE__
         */
    } else {
        /*
         *      __REQUEST__
         */
        let jn_ievent_id = build_cli_ievent_request(
            gobj,
            gobj_name(src),
            kw_get_str(gobj, kw, "__service__", 0, 0)
        );
        json_object_del(kw, "__service__");

        msg_iev_push_stack(
            gobj,
            kw,
            "__message__",
            event
        );

        msg_iev_push_stack(
            gobj,
            kw,
            IEVENT_STACK_ID,
            jn_ievent_id
        );
    }

    msg_iev_set_msg_type(gobj, kw, "__message__");

    return send_static_iev(gobj, event, kw, src);
}

/***************************************************************
 *      Framework Method subscription_added
 ***************************************************************/
function mt_subscription_added(gobj, subs)
{
    let priv = gobj.priv;

    if(gobj_current_state(gobj) !== "ST_SESSION" || !priv.websocket) {
        /*  on_open will send all subscriptions. The !websocket case is the
         *  teardown window: mt_stop already closed the socket but the async
         *  onclose hasn't moved the FSM out of ST_SESSION yet. */
        return 0;
    }

    if(priv.inside_on_open) {
        // avoid duplicates of subscriptions
        return 0;
    }
    return send_remote_subscription(gobj, subs);
}

/***************************************************************
 *      Framework Method subscription_deleted
 ***************************************************************/
function mt_subscription_deleted(gobj, subs)
{
    let priv = gobj.priv;
    // in C: return 0;
    // TODO hay algo mal, las subscripciones locales se interpretan como remotas

    if(gobj_current_state(gobj) !== "ST_SESSION" || !priv.websocket) {
        /*  Nothing to do: on open this subscription will not be re-sent.
         *  The !websocket case is the teardown window (stop+destroy in the
         *  same turn): the socket is gone but the async onclose hasn't moved
         *  the FSM out of ST_SESSION — the remote side drops the session's
         *  subscriptions on close anyway. */
        return 0;
    }

    if(priv.inside_on_open) {
        // avoid duplicates of subscriptions
        return 0;
    }
    if(empty_string(subs.event)) {
        // HACK only resend explicit subscriptions
        return 0;
    }

    let kw = {};

    let __global__ = subs.__global__;
    let __config__ = subs.__config__;
    let __filter__ = subs.__filter__;
    let __service__ = subs.__service__;
    let subscriber = subs.subscriber;

    if(__config__) {
        kw["__config__"] = __config__;
    }
    if(__global__) {
        kw["__global__"] = __global__;
    }
    if(__filter__) {
        kw["__filter__"] = __filter__;
    }

    /*
     *      __MESSAGE__
     */
    let jn_ievent_id = build_cli_ievent_request(
        gobj,
        gobj_name(subscriber),
        __service__
    );
    msg_iev_push_stack(
        gobj,
        kw,         // not owned
        IEVENT_STACK_ID,
        jn_ievent_id   // owned
    );

    msg_iev_set_msg_type(gobj, kw, "__unsubscribing__");

    return send_static_iev(gobj, subs.event, kw, gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  Setup WebSocket
 *  Mixin DOM events -> Yuneta events
 ***************************************************************/
function setup_websocket(gobj)
{
    if(gobj.priv.websocket) {
        log_error(`Websocket ALREADY setup`);
    }

    const url = gobj_read_str_attr(gobj, "url");
    log_debug(`====> Starting WebSocket to '${url}' (${gobj_short_name(gobj)})`);

    /*
     *  Every socket carries its sequence number into the kw of its
     *  events. A socket that is no longer the current one (a stop and a
     *  start in the same turn) is stale: its open, its frames and its
     *  close belong to a session that already ended, and letting them
     *  in put an EV_ON_OPEN into ST_SESSION (injected to the backend as
     *  a message) and a close that unwired the NEW socket.
     *  Counted BEFORE the socket is made: a url that fails to open must
     *  still make the old socket stale, or its late close is delivered
     *  a second time after the one mt_start() already delivered.
     */
    const ws_seq = ++gobj.priv.ws_seq;

    let websocket;
    try {
        websocket = new WebSocket(url);
    } catch (e) {
        log_error(`${gobj_short_name(gobj)}: Cannot open WebSocket to '${url}', Error: ${e.message}`);
        /*
         *  A url the browser refuses to even try (it throws instead of
         *  closing) is still a failed open: it goes the way of a close
         *  before the open, so EV_ON_OPEN_ERROR is published and the
         *  retry is armed. Posted, not sent: we may be inside mt_start().
         */
        let ret = gobj_post_event(
            gobj,
            "EV_ON_CLOSE",
            {
                url, ws_seq,
                code: 1006, reason: e.message, was_clean: false
            },
            gobj
        );
        if(ret < 0) {
            /*  Error already logged (the posted-events queue is full):
             *  at least the link keeps retrying.  */
            set_timeout(gobj.priv.gobj_timer, next_retry(gobj));
        }
        return null;
    }

    if (!websocket) {
        log_error(`${gobj_short_name(gobj)}: Failed to initialize WebSocket.`);
        return null;
    }

    websocket.onopen = () => {
        if(ws_seq !== gobj.priv.ws_seq || gobj_is_destroying(gobj)) {
            return;
        }
        gobj_send_event(gobj, "EV_ON_OPEN", { url, ws_seq }, gobj);
    };

    websocket.onmessage = (e) => {
        if(ws_seq !== gobj.priv.ws_seq || gobj_is_destroying(gobj)) {
            return;
        }
        gobj_send_event(gobj, "EV_ON_MESSAGE", { url, data: e.data }, gobj);
    };

    // not useful
    // websocket.onerror = (e) => {
    //     log_error(`${gobj_short_name(gobj)}: WebSocket error occurred.`);
    // };

    websocket.onclose = (e) => {
        /*
         *  A stop+destroy in the same turn (e.g. a wrapper tearing its
         *  transport down on logout) leaves this async onclose to fire
         *  AFTER the gobj is gone. gobj_is_destroying() covers both the
         *  destroying and destroyed flags; bail out so we don't send
         *  EV_ON_CLOSE to a dead gobj ("gobj dst DESTROYED"). A stop that
         *  keeps the gobj alive still gets its EV_ON_CLOSE.
         */
        if(gobj_is_destroying(gobj)) {
            return;
        }
        if(ws_seq !== gobj.priv.ws_seq) {
            return;     // stale, its close was delivered by mt_start()
        }
        if(!gobj_read_bool_attr(gobj_yuno(), "browser_beforeunload")) {
            /*  Plain json in the kw, not the DOM CloseEvent.  */
            gobj_send_event(
                gobj,
                "EV_ON_CLOSE",
                {
                    url, ws_seq,
                    code: e.code, reason: e.reason, was_clean: e.wasClean
                },
                gobj
            );
        } else {
            log_warning('Close websocket by unload page');
        }
    };

    return websocket; // Return the WebSocket instance
}

/***************************************************************
 *  Closes the WebSocket connection safely.
 ***************************************************************/
function close_websocket(gobj, code = 1000, reason = "")
{
    let priv = gobj.priv;

    let websocket = priv.websocket;
    priv.websocket = null;

    if (!websocket ||
        websocket.readyState === WebSocket.CLOSED ||
        websocket.readyState === WebSocket.CLOSING)
    {
        log_warning("WebSocket is already closed or in the process of closing.");
        return;
    }

    log_debug(`Closing WebSocket (Code: ${code}, Reason: "${reason}")`);

    try {
        websocket.close(code, reason);
    } catch (e) {
        log_error(`${gobj_short_name(gobj)}: Error closing WebSocket: ${e.message}`);
    }
}

/***************************************************************
 *  Close the channel for a fault of the server: a message for a role
 *  or a yuno that is not this one, an event out of its place.
 *
 *  Not with 1000: EV_ON_CLOSE would say the session ended well. A
 *  browser closes a WebSocket only with 1000 or 3000-4999 (1002, the
 *  protocol error, throws there), so it is 4002 -- and the server
 *  echoes it, so EV_ON_CLOSE carries it.
 *
 *  And a session the server broke at once was not a session reached:
 *  the backoff the ack reset is put back, or a server that breaks every
 *  session is reconnected at the first delay for ever, with an
 *  EV_ON_OPEN and an EV_ON_CLOSE in the app per round. A session that
 *  outlived the longest delay of the backoff (`timeout_retry_max`) was
 *  served: its fault starts the backoff over, as a clean end does, or
 *  one foreign message hours later is waited for with a delay escalated
 *  by failures long gone.
 ***************************************************************/
const CLOSE_PEER_FAULT = 4002;

function close_for_peer_fault(gobj, reason)
{
    let priv = gobj.priv;

    if(gobj_current_state(gobj) === "ST_SESSION") {
        const lived = performance.now() - priv.session_since;
        if(lived < retry_bounds(gobj).max) {
            priv.retry_ms = priv.retry_ms_before_session;
        }
        priv.retry_ms_before_session = 0;
    }
    close_websocket(gobj, CLOSE_PEER_FAULT, reason);
}

/***************************************************************
 *  A text of the server -- a frame, the name of an event, of a
 *  service, of a role -- as a log shows it: masked, then capped on a
 *  whole character (capped first, a credential the cap cut would
 *  show its first characters). As the C kernel shows the name of an
 *  event that is not public (mask_secrets_inline_capped()).
 ***************************************************************/
const PEER_NAME_SHOWN = 128;  // as the C transport
const PEER_FRAME_SHOWN = 256;

function peer_text_shown(text, max)
{
    let s = String(text);
    let masked = mask_secrets_inline(s);
    if(masked !== null) {
        s = masked;
    }
    if(s.length > max) {
        let n = max;
        let code = s.charCodeAt(n);
        if(code >= 0xDC00 && code <= 0xDFFF) {
            n--;    // not half of a pair of surrogates
        }
        s = s.substring(0, n);
    }
    return s;
}

/***************************************************************
 *      Trace intra event
 ***************************************************************/
function trace_inter_event(gobj, prefix, iev)
{
    let hora = current_timestamp();
    try {
        log_debug("\n" + hora + " " + prefix + "\n");
        //trace_msg(JSON.stringify(iev,  null, 4));
        trace_json_masked(iev);     // a command's password is not shown (up to 7.25.9 it was)
    } catch (e) {
        log_debug("ERROR in trace_inter_event: " + e);
    }
}

/************************************************************
 *  inter event container
 ************************************************************/
class InterEvent {
    constructor(event, kw) {
        this.event = event;
        this.kw = kw || {};
    }
}

/************************************************************
 *        Create inter-event
 ************************************************************/
function iev_create(
        event,
        kw)
{
    if(empty_string(event)) {
        log_error("iev_create() event NULL");
        return null;
    }

    return new InterEvent(event, kw);
}

/**************************************
 *  Send jsonify inter-event message
 **************************************/
function send_iev(gobj, iev)
{
    let priv = gobj.priv;

    let msg = JSON.stringify(iev);

    if(is_traffic_tracing(gobj)) {
        let url = gobj_read_str_attr(gobj, "url");
        let prefix = gobj_name(gobj_yuno()) + ' ==> ' + url;
        let trace_ievent_callback = gobj_read_attr(gobj_yuno(), "trace_ievent_callback");
        if(trace_ievent_callback) {
            let size = msg.length;
            trace_ievent_callback(prefix, iev, 1, size);
        } else {
            trace_inter_event(gobj, prefix, iev);
        }
    }

    if(!priv.websocket || priv.websocket.readyState !== WebSocket.OPEN) {
        /*  Socket gone or not open (teardown window, race with a drop):
         *  the message cannot be delivered. A warning, not one TypeError
         *  bomb per message. */
        log_warning(`${gobj_short_name(gobj)}: send_iev(): websocket not open, message lost`);
        return -1;
    }
    try {
        priv.websocket.send(msg);
    } catch (e) {
        log_error(`${gobj_short_name(gobj)}: send_iev(): ${e}`);
        //log_error(msg);
    }
    return 0;
}

/**************************************
 *
 **************************************/
function send_static_iev(gobj, event, kw, src)
{
    let iev = iev_create(
        event,
        kw
    );

    return send_iev(gobj, iev);
}

/***************************************************************
 *  __MESSAGE__
 ***************************************************************/
function build_cli_ievent_request(gobj, src_service, dst_service)
{
    if(empty_string(dst_service)) {
        dst_service = gobj_read_str_attr(gobj, "wanted_yuno_service");
    }

    return {
        "dst_yuno": gobj_read_str_attr(gobj, "wanted_yuno_name"),
        "dst_role": gobj_read_str_attr(gobj, "wanted_yuno_role"),
        "dst_service": dst_service,

        "src_yuno": gobj_yuno_name(),
        "src_role": gobj_yuno_role(),
        "src_service": src_service,
        "host": node_uuid()
    };
}

/***************************************************************
 *      Send identity card
 ***************************************************************/
function send_identity_card(gobj)
{
    let priv = gobj.priv;

    let playing = gobj_is_playing(gobj_yuno());
    let yuno_version = gobj_read_str_attr(gobj_yuno(), "yuno_version");
    let yuno_release = gobj_read_str_attr(gobj_yuno(), "yuno_release");
    let yuno_tag = gobj_read_str_attr(gobj_yuno(), "yuno_tag");

    /*
     *  The services THIS link needs authorized. A single-link yuno leaves it
     *  empty and the yuno-wide list is used, as it always was. A multi-link
     *  yuno (one C_IEVENT_CLI per backend) must set it per link: the yuno's
     *  list is necessarily the union of every backend's, so each backend would
     *  be handed the service names of all the others.
     */
    let required_services = gobj_read_attr(gobj, "required_services");
    if(!required_services || !required_services.length) {
        required_services = gobj_read_attr(gobj_yuno(), "required_services");
    }

    let kw = {
        "yuno_role": gobj_yuno_role(),
        "yuno_id": gobj_yuno_id(),
        "yuno_name": gobj_yuno_name(),
        "yuno_tag": yuno_tag,
        "yuno_version": yuno_version,
        "yuno_release": yuno_release,
        "yuneta_version": YUNETA_VERSION,
        "playing": playing,
        "pid": 0,
        "watcher_pid": 0,
        "jwt": gobj_read_str_attr(gobj, "jwt"),
        "username": gobj_read_str_attr(gobj_yuno(), "__username__"),
        "launch_id": 0,
        "yuno_startdate": gobj_read_str_attr(gobj_yuno(), "start_date"),
        "id": node_uuid(),
        "user_agent": typeof window !== "undefined" ? window.navigator.userAgent : "",
        "language": typeof window !== "undefined" ? window.navigator.language : "",
        "required_services": required_services
    };

    /*
     *      __REQUEST__ __MESSAGE__
     */
    let jn_ievent_id = build_cli_ievent_request(
        gobj,
        gobj_name(gobj_parent(gobj)), // TODO ??? in C is gobj_name(gobj),
        null
    );
    msg_iev_push_stack(
        gobj,
        kw,
        IEVENT_STACK_ID,
        jn_ievent_id   // owned
    );

    msg_iev_set_msg_type(gobj, kw, "__identity__");

    set_timeout(priv.gobj_timer, gobj_read_integer_attr(gobj, "timeout_idack"));

    return send_static_iev(gobj, "EV_IDENTITY_CARD", kw, gobj);
}

/********************************************
 *  Create iev from data received
 *  on websocket connection
 ********************************************/
function iev_create_from_json(gobj, data)
{
    let x;
    try {
        x = JSON.parse(data);
    } catch (e) {
        /*  Not the message of the error: it quotes a slice of the frame,
         *  and a slice that begins inside a secret's name is no name.  */
        let at = /position (\d+)/.exec(String(e && e.message));
        log_warning(`${gobj_short_name(gobj)}: parsing inter_event json: frame is not json` +
            `${at? ", at position " + at[1] : ""}, ${String(data).length} characters`);
        return null;
    }

    if(!(x instanceof Object)) {
        log_warning(`${gobj_short_name(gobj)}: parsing inter_event: websocket data not a json object`);
        return null;
    }
    let event = x['event'];
    if(!event) {
        log_warning(`${gobj_short_name(gobj)}: parsing inter_event: no event`);
        return null;
    }
    if(typeof event !== 'string') {
        log_warning(`${gobj_short_name(gobj)}: parsing inter_event: event not a string`);
        return null;
    }

    let kw = x['kw'];
    if(!kw) {
        log_warning(`${gobj_short_name(gobj)}: parsing inter_kw: no kw`);
        return null;
    }
    if(!(kw instanceof Object)) {
        log_warning(`${gobj_short_name(gobj)}: parsing inter_event: kw not a json object`);
        return null;
    }

    return {
        event: event,
        kw: kw || {}
    };
}

/************************************************
 *
 ************************************************/
function send_remote_subscription(gobj, subs)
{
    if(empty_string(subs.event)) {
        // HACK only resend explicit subscriptions
        return -1;
    }

    let kw = {};

    let __global__ = subs.__global__;
    let __config__ = subs.__config__;
    let __filter__ = subs.__filter__;
    let __service__ = subs.__service__;
    let subscriber = subs.subscriber;

    if(__config__) {
        kw["__config__"] = __config__;
    }
    if(__global__) {
        kw["__global__"] = __global__;
    }
    if(__filter__) {
        kw["__filter__"] = __filter__;
    }

    /*
     *      __REQUEST__ __MESSAGE__
     */
    let jn_ievent_id = build_cli_ievent_request(
        gobj,
        gobj_name(subscriber),
        __service__
    );
    msg_iev_push_stack(
        gobj,
        kw,         // not owned
        IEVENT_STACK_ID,
        jn_ievent_id   // owned
    );

    msg_iev_set_msg_type(gobj, kw, "__subscribing__");

    return send_static_iev(gobj, subs.event, kw, gobj);
}

/***************************************************************
 *  resend subscriptions
 ***************************************************************/
function resend_subscriptions(gobj)
{
    let dl_subs = gobj_find_subscriptions(
        gobj,
        null,   // event,
        null,   // kw (__config__, __global__, __local__)
        null    // subscriber
    );
    for(let i=0; i<dl_subs.length; i++) {
        let subs = dl_subs[i];
        send_remote_subscription(gobj, subs);
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *
 ***************************************************************/
function ac_timeout_disconnected(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(gobj_is_running(gobj)) {
        priv.websocket = setup_websocket(gobj);
    }
    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_on_open(gobj, event, kw, src)
{
    log_debug('Websocket opened: ' + gobj.priv.url);
    send_identity_card(gobj);
    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_on_close(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let url = kw.url;

    if(kw.ws_seq !== undefined && kw.ws_seq !== priv.ws_seq) {
        /*
         *  A posted failure of a socket that a later start already
         *  replaced: that start ended its session.
         */
        return 0;
    }

    set_remote_log_functions(); // clean remote log

    const reason_shown = peer_text_shown(kw.reason === undefined? "" : kw.reason, PEER_FRAME_SHOWN);

    /*  A session that ENDS (a stop, a logout, the server going away) is
     *  EV_ON_CLOSE and nobody's warning; one that is CUT is a warning
     *  (below), as an open that failed is.  */
    if(is_traffic_tracing(gobj)) {
        trace_msg(`${gobj_short_name(gobj)}: WebSocket closed ${url} (Code: ${kw.code}, ` +
            `Reason: "${reason_shown}", Clean: ${kw.was_clean})`);
    }

    // Cleanup WebSocket event handlers
    if(priv.websocket) {
        priv.websocket.onopen = null;
        priv.websocket.onmessage = null;
        priv.websocket.onerror = null;
        priv.websocket.onclose = null;
        priv.websocket = null;
    }

    if(priv.inform_on_close) {
        /*
         *  We had a real session (EV_ON_OPEN was published) and the
         *  channel just dropped.  Tell the subscribers — both backend
         *  FSMs that need to reset their state and any frontend that
         *  cares.  inform_on_close is one-shot: re-armed by
         *  ac_identity_card_ack on the next successful open.
         */
        priv.inform_on_close = false;
        const cut = !kw.was_clean || (kw.code !== 1000 && kw.code !== 1001);
        if(cut && gobj_is_running(gobj)) {     // a deliberate stop cut nothing
            log_warning(
                `${gobj_short_name(gobj)}: session closed ${url} (Code: ${kw.code}, ` +
                `Reason: "${reason_shown}", Clean: ${kw.was_clean})`
            );
        }
        gobj_publish_event(
            gobj,
            'EV_ON_CLOSE',
            {
                url:                    url,
                remote_yuno_name:       priv.remote_yuno_name,
                remote_yuno_role:       priv.remote_yuno_role,
                remote_yuno_service:    priv.remote_yuno_service,
                code:                   kw.code,
                reason:                 reason_shown,
                was_clean:              kw.was_clean
            }
        );
    } else if(!gobj_is_running(gobj)) {
        /*
         *  A deliberate stop while the socket was still connecting: no
         *  session ended and no open failed, there is nothing to tell.
         */
    } else {
        /*
         *  WebSocket closed BEFORE EV_ON_OPEN ever fired — typical
         *  causes: bad TLS cert (ERR_CERT_COMMON_NAME_INVALID), port
         *  closed, backend not running, firewall.  The framework
         *  policy is to keep retrying forever while the gobj is
         *  running (the operator may fix the issue at any time, the
         *  retry counter ends up in the logs and triggers monitors),
         *  so we do NOT stop and we do NOT publish EV_ON_CLOSE
         *  (would break the EV_ON_OPEN→EV_ON_CLOSE FSM contract on
         *  subscribers that only handle close in their connected
         *  state).  Instead we publish a separate event,
         *  EV_ON_OPEN_ERROR, that interactive subscribers (typical:
         *  a browser GUI showing a login form) can opt into.  The
         *  EVF_NO_WARN_SUBS flag keeps the framework quiet for the
         *  many subscribers (mostly backend FSMs) that don't care.
         *  Mirrors the WebSocket browser API split: .onopen /
         *  .onclose / .onerror.
         *
         *  log_warning leaves a precise trace per failed attempt so
         *  monitors / log aggregators can alert on it (the framework
         *  retries forever; without this line the only sign of
         *  trouble would be the WebSocket close in the browser
         *  console).
         */
        log_warning(
            `${gobj_short_name(gobj)}: EV_ON_OPEN_ERROR cannot open ` +
            `${url} (Code: ${kw.code}, ` +
            `Reason: "${reason_shown}", ` +
            `Clean: ${kw.was_clean})`
        );
        gobj_publish_event(
            gobj,
            'EV_ON_OPEN_ERROR',
            {
                url:                    url,
                remote_yuno_name:       priv.remote_yuno_name,
                remote_yuno_role:       priv.remote_yuno_role,
                remote_yuno_service:    priv.remote_yuno_service,
                code:                   kw.code,
                reason:                 reason_shown,
                was_clean:              kw.was_clean
            }
        );
    }

    if(gobj_is_running(gobj)) {
        set_timeout(priv.gobj_timer, next_retry(gobj));
    }

    return 0;
}

/***************************************************************
 *  The first delay of the backoff and its cap.
 *
 *  A first delay below RETRY_FLOOR_MS is raised to it, with a WARNING
 *  once: `timeout_retry` 0 never left 0 (0 doubled is 0), so a server
 *  that closed before the ack was reconnected in a loop with no wait,
 *  hundreds of connections a second.
 ***************************************************************/
const RETRY_FLOOR_MS = 1000;

function retry_bounds(gobj)
{
    let priv = gobj.priv;

    let base = gobj_read_integer_attr(gobj, "timeout_retry");
    let max = gobj_read_integer_attr(gobj, "timeout_retry_max");
    if(!(base >= RETRY_FLOOR_MS)) {
        if(!priv.retry_floor_warned) {
            priv.retry_floor_warned = true;
            log_warning(`${gobj_short_name(gobj)}: timeout_retry ${base} ms is below ` +
                `${RETRY_FLOOR_MS} ms: ${RETRY_FLOOR_MS} ms is used`);
        }
        base = RETRY_FLOOR_MS;
    }
    if(!(max >= base)) {
        max = base;     /*  equal = the old fixed-interval behaviour  */
    }
    return {base: base, max: max};
}

/***************************************************************
 *  How long to wait before the next reconnect attempt.
 *
 *  The delay used to be a constant (`timeout_retry`, 5s), for ever. A
 *  backend that is down — or a URL with a typo, which never comes back —
 *  was therefore hit every 5 seconds for the whole life of the tab, by
 *  EVERY link pointed at it, all in lockstep. It backs off now: from
 *  `timeout_retry`, doubling, capped at `timeout_retry_max`.
 *
 *  The jitter (±20%) is what breaks the lockstep. Without it, N links that
 *  went down together retry together for ever — a thundering herd against a
 *  backend that is just coming back up. It is the one place a random number
 *  earns its keep.
 *
 *  Reset to zero when a session is actually reached
 *  (ac_identity_card_ack), so a link that flaps once does not carry a
 *  minute-long penalty into its next real drop -- and put back when the
 *  server breaks that session (close_for_peer_fault()).
 ***************************************************************/
function next_retry(gobj)
{
    let priv = gobj.priv;

    const {base, max} = retry_bounds(gobj);
    priv.retry_ms = priv.retry_ms ? Math.min(priv.retry_ms * 2, max) : base;

    let jitter = priv.retry_ms * 0.2;
    let ms = priv.retry_ms - jitter + (Math.random() * 2 * jitter);
    return Math.max(1, Math.round(ms));
}

/********************************************
 *
 ********************************************/
function ac_timeout_wait_idAck(gobj, event, kw, src)
{
    send_identity_card(gobj);
    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_identity_card_ack(gobj, event, kw, src)
{
    let priv = gobj.priv;

    /*---------------------------------------*
     *  Clear timeout
     *---------------------------------------*/
    clear_timeout(priv.gobj_timer);

    /*---------------------------------------*
     *  Update remote values
     *---------------------------------------*/
    /*
     *  Here is the end point of the request.
     *  Don't pop the request, because
     *  the event can be publishing to more users.
     */
    /*
     *      __RESPONSE__ __MESSAGE__
     */
    let event_id = msg_iev_get_stack(gobj, kw, IEVENT_STACK_ID, true);
    let src_yuno = kw_get_str(gobj, event_id, "src_yuno", "");
    let src_role = kw_get_str(gobj, event_id, "src_role", "");
    let src_service = kw_get_str(gobj, event_id, "src_service", "");
    gobj_write_str_attr(gobj, "remote_yuno_name", src_yuno);
    gobj_write_str_attr(gobj, "remote_yuno_role", src_role);
    gobj_write_str_attr(gobj, "remote_yuno_service", src_service);

    // WARNING comprueba result, ahora puede venir negativo
    let result = kw_get_int(gobj, kw, "result", -1, 0);
    let comment = kw_get_str(gobj, kw, "comment", "", 0);
    let username_ = kw_get_str(gobj, kw, "username", "", 0);
    let services_roles = kw_get_dict_value(gobj, kw, "services_roles", {});
    if(result < 0) {
        close_websocket(gobj);

        let kw_nak = {
            "url": gobj_read_str_attr(gobj, "url"),
            "result": result,
            "comment": comment,
            "username": username_,
            "remote_yuno_name": src_yuno,
            "remote_yuno_role": src_role,
            "remote_yuno_service": src_service
        };

        gobj_publish_event(gobj, "EV_ON_ID_NAK", kw_nak);

    } else {
        gobj_change_state(gobj, "ST_SESSION");
        priv.inside_on_open = true;

        /*
         *  A session was reached: the backoff starts over. A link that flaps
         *  once must not carry a minute-long penalty into its next real drop.
         *  Kept, for a session the server breaks (close_for_peer_fault()).
         */
        priv.retry_ms_before_session = priv.retry_ms;
        priv.retry_ms = 0;
        priv.session_since = performance.now();

        if(!priv.inform_on_close) {
            priv.inform_on_close = true;
            let kw_on_open = {
                "username": username_,
                "remote_yuno_name": src_yuno,
                "remote_yuno_role": src_role,
                "remote_yuno_service": src_service,
                "services_roles": services_roles,
            };

            gobj_publish_event(gobj, "EV_ON_OPEN", kw_on_open);
        }

        priv.inside_on_open = false;

        /*
         *  Resend subscriptions
         */
        resend_subscriptions(gobj);
    }

    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_on_message(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let url = priv.url;

    /*------------------------------------------*
     *  Create inter_event from received data
     *------------------------------------------*/
    let iev_msg = iev_create_from_json(gobj, kw.data);
    if(!iev_msg) {
        /*  Bad bytes from the peer: a warning (already logged by the
         *  parser), a capped dump, and the frame is dropped.  */
        log_warning(
            `${gobj_short_name(gobj)}: frame dropped from ${url}: ` +
            `${peer_text_shown(kw.data, PEER_FRAME_SHOWN)}`
        );
        return -1;
    }

    /*---------------------------------------*
     *          trace inter_event
     *---------------------------------------*/
    if(is_traffic_tracing(gobj)) {
        let prefix = gobj_name(gobj_yuno()) + ' <== ' + url;
        let size = kw.data.length;
        let trace_ievent_callback = gobj_read_attr(gobj_yuno(), "trace_ievent_callback");
        if(trace_ievent_callback) {
            trace_ievent_callback(prefix, iev_msg, 2, size);
        } else {
            trace_inter_event(gobj, prefix, iev_msg);
        }
    }

    /*----------------------------------------*
     *
     *----------------------------------------*/
    let iev_event = iev_msg.event;
    let iev_kw = iev_msg.kw;

    /*-----------------------------------------*
     *  If state is not in SESSION, send self.
     *  Mainly process EV_IDENTITY_CARD_ACK
     *-----------------------------------------*/
    if(gobj_current_state(gobj) !== "ST_SESSION") {
        /*  Before the session the server says one thing only, as the C
         *  transport reads it: anything else is its fault, a WARNING, and
         *  the channel goes.  */
        if(String(iev_event).toLowerCase() === "ev_identity_card_ack") {
            /*  Handled unless the action says it FAILED. Not `=== 0`: an
             *  action that simply returns nothing answers `undefined`, which
             *  is not `=== 0`, and the session was then closed on a message
             *  that had just been processed fine.  */
            let ret = gobj_send_event(gobj, "EV_IDENTITY_CARD_ACK", iev_kw, gobj);
            if(!(ret < 0)) {
                return 0;
            }
        } else {
            log_warning(`${gobj_short_name(gobj)}: event UNKNOWN in not-session state ` +
                `${peer_text_shown(iev_event, PEER_NAME_SHOWN)}`);
        }
        close_for_peer_fault(gobj, "event out of session");
        return -1;
    }

    iev_msg = null;

    /*------------------------------------*
     *   Analyze inter_event
     *------------------------------------*/
    let msg_type = msg_iev_get_msg_type(gobj, iev_kw);

    /*----------------------------------------*
     *  Get inter-event routing information.
     *----------------------------------------*/
    let event_id = msg_iev_get_stack(gobj, iev_kw, IEVENT_STACK_ID);

    /*----------------------------------------*
     *  Check dst role^name
     *----------------------------------------*/
    /*  Both are optional in the protocol (an empty one is anybody's), as
     *  the C transport reads them. A wrong one is the server's fault: a
     *  WARNING, and the channel goes.  */
    let iev_dst_role = kw_get_str(gobj, event_id, "dst_role", "");
    if(!empty_string(iev_dst_role) &&
            iev_dst_role.toLowerCase() !== String(gobj_yuno_role()).toLowerCase()) {
        log_warning(`${gobj_short_name(gobj)}: It's not my role, ` +
            `dst_role: ${peer_text_shown(iev_dst_role, PEER_NAME_SHOWN)}, ` +
            `my_role: ${gobj_yuno_role()}, event: ${peer_text_shown(iev_event, PEER_NAME_SHOWN)}`);
        close_for_peer_fault(gobj, "not my role");
        return -1;
    }
    let iev_dst_yuno = kw_get_str(gobj, event_id, "dst_yuno", "");
    if(!empty_string(iev_dst_yuno) &&
            iev_dst_yuno.toLowerCase() !== String(gobj_yuno_name()).toLowerCase()) {
        log_warning(`${gobj_short_name(gobj)}: It's not my name, ` +
            `dst_yuno: ${peer_text_shown(iev_dst_yuno, PEER_NAME_SHOWN)}, ` +
            `my_name: ${gobj_yuno_name()}, event: ${peer_text_shown(iev_event, PEER_NAME_SHOWN)}`);
        close_for_peer_fault(gobj, "not my name");
        return -1;
    }

    /*----------------------------------------*
     *  Check dst service
     *----------------------------------------*/
    let iev_dst_service = kw_get_str(gobj, event_id, "dst_service", "");

    /*------------------------------------*
     *   Is the event a subscription?
     *------------------------------------*/
    if(msg_type === "__subscribing__") {
        /*
         *  it's a external subscription
         */
        log_warning(
            `${gobj_short_name(gobj)}: subscription event ignored, I'm client ` +
            `(service: ${peer_text_shown(iev_dst_service, PEER_NAME_SHOWN)}, ` +
            `event: ${peer_text_shown(iev_event, PEER_NAME_SHOWN)})`
        );
        return -1;
    }

    /*---------------------------------------*
     *   Is the event is a unsubscription?
     *---------------------------------------*/
    if(msg_type === "__unsubscribing__") {
        /*
         *  it's a external unsubscription
         */
        log_warning(
            `${gobj_short_name(gobj)}: unsubscription event ignored, I'm client ` +
            `(service: ${peer_text_shown(iev_dst_service, PEER_NAME_SHOWN)}, ` +
            `event: ${peer_text_shown(iev_event, PEER_NAME_SHOWN)})`
        );
        return -1;
    }

    /*-------------------------------------------------------*
     *  Filter public events of this gobj
     *
     *  The transport's own names, in any case of letters: of them
     *  the server sends only the public ones this state takes
     *  (EV_MT_STATS, EV_MT_COMMAND). What the transport says ITSELF
     *  (EV_ON_OPEN, EV_ON_CLOSE, EV_ON_ID_NAK, EV_TIMEOUT...) was
     *  published to the app as if it came from here, with the kw
     *  the server chose -- whoever else declares it public.
     *-------------------------------------------------------*/
    const declared = gobj_find_event_type(iev_event, 0, false);
    if(declared && gobj_has_event(gobj, declared.event_name, 0)) {
        const own_event = declared.event_name;
        if(!gobj_has_event(gobj, own_event, event_flag_t.EVF_PUBLIC_EVENT) ||
                own_event === "EV_IDENTITY_CARD_ACK") {     // the ack belongs before the session
            log_warning(`${gobj_short_name(gobj)}: event of the transport itself, or out of its place, ` +
                `DROPPED: ev '${peer_text_shown(iev_event, PEER_NAME_SHOWN)}'`);
            return -1;
        }
        /*
         *  It's mine (I manage inter-command and inter-stats)
         */
        gobj_send_event(gobj, own_event, iev_kw, gobj);
        return 0;
    }

    /*-------------------------------------------------------------*
     *  Dispatch the event
     *
     *  A MESSAGE THAT NAMES A SERVICE IS ADDRESSED TO IT, and when
     *  that service is gone the message is not for anybody else.
     *  Delivering it to the fallback below is how a view's private
     *  stream ends up on every other subscriber of this transport.
     *
     *  In an SPA that is not theoretical, and the shape is always the
     *  same: a view mounted under a service name subscribes to a
     *  backend event, the user navigates away, the view is destroyed,
     *  and the frames already in flight keep arriving addressed to a
     *  name nobody answers to. They were then published to everyone,
     *  which in practice means the application gobj -- subscribed to
     *  this transport with a NULL event, deliberately, because naming
     *  EV_ON_OPEN in a subscription forwards it upstream and the
     *  remote rejects it -- and a null subscription matches
     *  everything. Its FSM does not declare a device frame, so it said
     *  so, loudly, once per frame: 38 of them in one 26 ms burst on a
     *  node with 38 devices.
     *
     *  It is the ordinary end of a view's life and not a broken
     *  invariant -- an unsubscribe cannot recall what is already on
     *  the wire -- so the message is dropped with a WARNING that names
     *  what was lost, not with an error and a stack.
     *-------------------------------------------------------------*/
    if(!empty_string(iev_dst_service)) {
        let gobj_service = gobj_find_service(iev_dst_service, false);
        if(!gobj_service) {
            log_warning(`${gobj_short_name(gobj)}: event for a service that is gone, DROPPED: ` +
                `service '${peer_text_shown(iev_dst_service, PEER_NAME_SHOWN)}', ` +
                `ev '${peer_text_shown(iev_event, PEER_NAME_SHOWN)}'`);
            return 0;
        }
        if(!gobj_has_event(gobj_service, iev_event, event_flag_t.EVF_PUBLIC_EVENT)) {
            log_warning(`${gobj_short_name(gobj)}: Service found but no event or not public, DROPPED: ` +
                `service '${gobj_short_name(gobj_service)}', ev '${peer_text_shown(iev_event, PEER_NAME_SHOWN)}'`);
            return -1;
        }
        gobj_send_event(gobj_service, iev_event, iev_kw, gobj);
        return 0;
    }

    /*
     *  SERVICE subscription model: the message names NO destination,
     *  so it belongs to whoever subscribed here. This is the path the
     *  check above protects, not one it replaces.
     *
     *  Only an event that some gclass declares PUBLIC, as the C
     *  transport reads the frame (gclass_find_public_event() in
     *  iev_create_from_gbuffer()): a name nobody declares is the
     *  server's text, and published it reached the log raw ("Publish
     *  event WITHOUT subscribers", "Event NOT DEFINED in state"); one
     *  declared but not public is not the API of anybody.
     */
    let event_type = gobj_find_event_type(iev_event, event_flag_t.EVF_PUBLIC_EVENT, false);
    if(!event_type) {
        log_warning(`${gobj_short_name(gobj)}: event that no gclass declares public, DROPPED: ` +
            `ev '${peer_text_shown(iev_event, PEER_NAME_SHOWN)}'`);
        return -1;
    }
    gobj_publish_event(gobj, event_type.event_name, iev_kw);

    return 0;
}

/***************************************************************************
 *  The server asking this client for stats or a command. The C client
 *  serves them (gobj_stats() / gobj_command() of the service named, and
 *  an answer); a browser client does not run what its server asks, so it
 *  is refused: a WARNING naming what was asked, masked (a command line
 *  can carry a secret), and nothing else -- the protocol allows the ask,
 *  so the session goes on. Up to 7.26.25 it was dropped without a trace.
 ***************************************************************************/
function refuse_asked_by_server(gobj, event, kw, key)
{
    const asked = (kw && typeof kw[key] === "string")? kw[key] : "";
    const service = (kw && typeof kw.service === "string")? kw.service : "";
    log_warning(`${gobj_short_name(gobj)}: ${event} not served by this client, DROPPED: ` +
        `${key.replace(/_/g, "")} '${peer_text_shown(asked, PEER_NAME_SHOWN)}', ` +
        `service '${peer_text_shown(service, PEER_NAME_SHOWN)}'`);
    return -1;
}

/***************************************************************************
 *  remote asking for stats
 ***************************************************************************/
function ac_mt_stats(gobj, event, kw, src)
{
    return refuse_asked_by_server(gobj, event, kw, "__stats__");
}

/***************************************************************************
 *  remote asking for command
 ***************************************************************************/
function ac_mt_command(gobj, event, kw, src)
{
    return refuse_asked_by_server(gobj, event, kw, "__command__");
}

/***************************************************************************
 *  remote asking for play yuno
 ***************************************************************************/
function ac_play_yuno(gobj, event, kw, src)
{
    /*
     *      __RESPONSE__ __MESSAGE__
     */
    // TODO
    return -1;
}

/***************************************************************************
 *  remote asking for pause yuno
 ***************************************************************************/
function ac_pause_yuno(gobj, event, kw, src)
{
    /*
     *      __RESPONSE__ __MESSAGE__
     */
    // TODO
    return -1;
}




                    /***************************
                     *          FSM
                     ***************************/




/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:              mt_create,
    mt_writing:             mt_writing,
    mt_start:               mt_start,
    mt_stop:                mt_stop,
    mt_destroy:             mt_destroy,
    mt_stats:               mt_stats,
    mt_command_parser:      mt_command,
    mt_inject_event:        mt_inject_event,
    mt_subscription_added:  mt_subscription_added,
    mt_subscription_deleted: mt_subscription_deleted,
};


/***************************************************************
 *          Create the GClass
 ***************************************************************/
function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    /*---------------------------------------------*
     *          States
     *---------------------------------------------*/
    const st_disconnected = [
        ["EV_ON_OPEN",              ac_on_open,             "ST_WAIT_IDENTITY_CARD_ACK"],
        ["EV_ON_CLOSE",             ac_on_close,            null],
        ["EV_TIMEOUT",              ac_timeout_disconnected,null],
        [null, null, null]
    ];
    const st_wait_identity_card_ack = [
        ["EV_ON_MESSAGE",           ac_on_message,          null],
        ["EV_IDENTITY_CARD_ACK",    ac_identity_card_ack,   null],
        ["EV_ON_CLOSE",             ac_on_close,            "ST_DISCONNECTED"],
        ["EV_TIMEOUT",              ac_timeout_wait_idAck,  null],
        [null, null, null]
    ];
    const st_session = [
        ["EV_ON_MESSAGE",           ac_on_message,          null],
        ["EV_MT_STATS",             ac_mt_stats,            null],
        ["EV_MT_COMMAND",           ac_mt_command,          null],
        ["EV_ON_CLOSE",             ac_on_close,            "ST_DISCONNECTED"],
        [null, null, null]
    ];

    const states = [
        ["ST_DISCONNECTED",           st_disconnected],
        ["ST_WAIT_IDENTITY_CARD_ACK", st_wait_identity_card_ack],
        ["ST_SESSION",                st_session],
        [null, null]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_ON_MESSAGE",           event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_IDENTITY_CARD_ACK",    event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_ON_ID_NAK",            event_flag_t.EVF_OUTPUT_EVENT],

        ["EV_MT_STATS",             event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_MT_COMMAND",           event_flag_t.EVF_PUBLIC_EVENT],

        ["EV_ON_OPEN",              event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_ON_CLOSE",             event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_ON_OPEN_ERROR",        event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_TIMEOUT",              0],
        [null, 0]
    ];

    /*----------------------------------------*
     *          Create the gclass
     *----------------------------------------*/
    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt,
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table,
        0,  // command_table,
        s_user_trace_level,
        gclass_flag_t.gcflag_no_check_output_events // gclass_flag
    );
    if(!__gclass__) {
        // Error already logged
        return -1;
    }

    return 0;
}

/***************************************************************************
 *
 ***************************************************************************/
function register_c_ievent_cli()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_ievent_cli };
