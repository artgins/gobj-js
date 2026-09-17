/****************************************************************************
 *          c_yuno.js
 *
 *          The default yuno in js
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved. ****************************************************************************/
import {
    YUNETA_VERSION,
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
    gclass_create,
    gobj_create_pure_child,
    gobj_start,
    gobj_play,
    gobj_pause,
    gobj_is_playing,
    gobj_is_running,
    gobj_default_service,
    gobj_stop_children,
    gobj_name,
    gobj_read_attr,
    gobj_publish_event,
    gobj_write_str_attr,
    gobj_write_attr,
    gobj_yuno_role,
    gobj_yuno_name,
    gclass_find_by_name,
    gobj_set_global_trace,
    gobj_set_global_no_trace,
    gobj_set_global_trace2,
    gobj_set_global_no_trace2,
    gobj_set_gclass_trace,
    gobj_set_gclass_no_trace,
    gobj_get_global_trace_level,
    gobj_get_global_trace_no_level,
    gobj_get_gclass_trace_level,
    gobj_get_gclass_trace_level2,
    gobj_get_gclass_trace_no_level,
    gobj_save_persistent_attrs,
    sdata_flag_t,
} from "./gobj.js";

import {
    current_timestamp,
    log_error, node_uuid,
    is_object,
    is_array,
} from "./helpers.js";

import {
    build_command_response,
} from "./command_parser.js";

import {
    set_timeout_periodic,
    clear_timeout
} from "./c_timer.js";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUNO";

/***************************************************************
 *              Data
 ***************************************************************/
/*---------------------------------------------*
 *          Attributes
 *---------------------------------------------*/
const attrs_table = [
SDATA(data_type_t.DTP_BOOLEAN,  "changesLost",          0,  false,  "Set true to warn about leaving page"),
SDATA(data_type_t.DTP_BOOLEAN,  "browser_beforeunload", 0,  false,  "Set true to refreshing browser"),
SDATA(data_type_t.DTP_STRING,   "__username__",         0,  "",     "Username"),
SDATA(data_type_t.DTP_STRING,   "start_date",           0,  "",     "Yuno starting date"),
SDATA(data_type_t.DTP_STRING,   "node_uuid",            0,  "",     "uuid of node"),
SDATA(data_type_t.DTP_STRING,   "yuno_role",            0,  "",     "Yuno role"),
SDATA(data_type_t.DTP_STRING,   "yuno_id",              0,  "",     "Yuno Id. Set by agent"),
SDATA(data_type_t.DTP_STRING,   "yuno_name",            0,  "",     "Yuno name. Set by agent"),
SDATA(data_type_t.DTP_STRING,   "yuno_tag",             0,  "",     "Tags of yuno. Set by agent"),
SDATA(data_type_t.DTP_STRING,   "yuno_release",         0,  "",     "Yuno Release. Set by agent"),
SDATA(data_type_t.DTP_STRING,   "yuno_version",         0,  "",     "Yuno version (APP_VERSION)"),
SDATA(data_type_t.DTP_STRING,   "yuneta_version",       0,  YUNETA_VERSION, "Yuneta version"),
SDATA(data_type_t.DTP_LIST,     "required_services",    0,  "[]",   "Required services"),
SDATA(data_type_t.DTP_DICT,     "trace_levels",         sdata_flag_t.SDF_PERSIST, "{}", "Trace levels"),
SDATA(data_type_t.DTP_DICT,     "no_trace_levels",      sdata_flag_t.SDF_PERSIST, "{}", "No trace levels"),
SDATA(data_type_t.DTP_POINTER,  "trace_ievent_callback",0,  null,   "Where the traffic trace goes (C_IEVENT_CLI levels ievents/ievents2); console when null"),
SDATA(data_type_t.DTP_BOOLEAN,  "developer",            0,  false,  "Developer mode enabled"),
SDATA(data_type_t.DTP_INTEGER,  "periodic_timeout",     0,  "1000", "Timeout periodic, in miliseconds."),
SDATA_END()
];

let PRIVATE_DATA = {
    gobj_timer: null,
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

    let date = current_timestamp();
    gobj_write_str_attr(gobj, "start_date", date);
    gobj_write_str_attr(gobj, "node_uuid", node_uuid());

    /*
     *  Create children
     */
    gobj.priv.gobj_timer = gobj_create_pure_child(gobj_name(gobj), "C_TIMER", {}, gobj);

    priv.periodic_timeout   = gobj_read_attr(gobj, "periodic_timeout");

    /*
     *  Traces: what the user persisted wins over what main() set by
     *  default. The persistent attrs are already loaded (a yuno is a
     *  service), as in the C kernel's C_YUNO.
     */
    set_user_gclass_traces(gobj);
    set_user_gclass_no_traces(gobj);
}

/***************************************************************
 *          Framework Method: Writing
 ***************************************************************/
function mt_writing(gobj, path)
{
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    set_timeout_periodic(gobj.priv.gobj_timer, gobj.priv.periodic_timeout);
    return 0;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    /*
     *  When yuno stops, it's the death of the app
     */
    clear_timeout(gobj.priv.gobj_timer);
    gobj_stop_children(gobj);
    return 0;
}

/***************************************************************
 *          Framework Method: Play
 ***************************************************************/
function mt_play(gobj)
{
    let default_service = gobj_default_service();
    if(!gobj_is_running(default_service)) {
        gobj_start(default_service);
    }
    if(!gobj_is_playing(default_service)) {
        gobj_play(default_service);
    }
    return 0;
}

/***************************************************************
 *          Framework Method: Pause
 ***************************************************************/
function mt_pause(gobj)
{
    gobj_pause(gobj_default_service());
    return 0;
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  Restore the trace levels the user persisted.
 *
 *  A saved scope REPLACES what is in force: main() sets its defaults
 *  (gobj_set_global_no_trace("timer_periodic"), a gclass it wants quiet)
 *  before the yuno is created, and a default the user turned off must
 *  stay off. A scope is saved whole, empty included (save_global_trace());
 *  a scope never saved keeps main()'s. The C kernel's C_YUNO does the same.
 ***************************************************************/
function set_user_gclass_traces(gobj)
{
    let jn_trace_levels = gobj_read_attr(gobj, "trace_levels");
    if(!is_object(jn_trace_levels)) {
        return 0;
    }

    let jn_global = jn_trace_levels["__global_trace__"];
    if(is_array(jn_global)) {
        gobj_set_global_trace2(0xFFFFFFFF, false);
        for(let level of jn_global) {
            gobj_set_global_trace(level, true);
        }
    }

    for(const [name, jn_levels] of Object.entries(jn_trace_levels)) {
        let gclass = gclass_find_by_name(name);
        if(!gclass) {
            /*  Not a gclass (__global_trace__) or one not registered in
             *  this app: nothing to restore, and nothing worth a log.  */
            continue;
        }
        if(!is_array(jn_levels)) {
            log_error(`${gobj_name(gobj)}: trace_levels of ${name} MUST be a list`);
            continue;
        }
        gobj_set_gclass_trace(gclass, null, false);
        for(let level of jn_levels) {
            gobj_set_gclass_trace(gclass, level, true);
        }
    }
    return 0;
}

/***************************************************************
 *  Restore the no-trace levels, see set_user_gclass_traces()
 ***************************************************************/
function set_user_gclass_no_traces(gobj)
{
    let jn_no_trace_levels = gobj_read_attr(gobj, "no_trace_levels");
    if(!is_object(jn_no_trace_levels)) {
        return 0;
    }

    let jn_global = jn_no_trace_levels["__global_no_trace__"];
    if(is_array(jn_global)) {
        gobj_set_global_no_trace2(0xFFFFFFFF, false);
        for(let level of jn_global) {
            gobj_set_global_no_trace(level, true);
        }
    }

    for(const [name, jn_levels] of Object.entries(jn_no_trace_levels)) {
        let gclass = gclass_find_by_name(name);
        if(!gclass) {
            continue;   // see set_user_gclass_traces()
        }
        if(!is_array(jn_levels)) {
            log_error(`${gobj_name(gobj)}: no_trace_levels of ${name} MUST be a list`);
            continue;
        }
        gobj_set_gclass_no_trace(gclass, null, false);
        for(let level of jn_levels) {
            gobj_set_gclass_no_trace(gclass, level, true);
        }
    }
    return 0;
}

/***************************************************************
 *  Save a scope WHOLE, from the levels in force (see
 *  set_user_gclass_traces()): a saved scope replaces main()'s, so it
 *  has to carry everything that must be in force.
 ***************************************************************/
function save_trace_scope(gobj, attr, scope, levels)
{
    let jn_levels = gobj_read_attr(gobj, attr);
    if(!is_object(jn_levels)) {
        jn_levels = {};
    }
    jn_levels[scope] = levels;
    gobj_write_attr(gobj, attr, jn_levels);
    return gobj_save_persistent_attrs(gobj, attr);
}

/***************************************************************
 *  "set" as the C command reads it: TRUE / set / 1, FALSE / reset / 0
 ***************************************************************/
function parse_set(value)
{
    if(value === true || value === false) {
        return value;
    }
    let v = String(value === undefined || value === null ? "" : value).toLowerCase();
    if(v === "true" || v === "set") {
        return true;
    }
    if(v === "false" || v === "reset") {
        return false;
    }
    if(v === "" || isNaN(Number(v))) {
        return null;
    }
    return Number(v) ? true : false;
}

function yuno_prefix()
{
    return `${gobj_yuno_role()}^${gobj_yuno_name()}`;
}




                    /***************************
                     *      Commands
                     ***************************/




/***************************************************************
 *  The trace commands of the C kernel's C_YUNO, same names and same
 *  parameters (`level`, `set`, `gclass_name` / `gclass`). Setting a
 *  level saves its scope.
 ***************************************************************/
function mt_command_parser(gobj, command, kw, src)
{
    kw = kw || {};
    switch(command) {
        case "get-global-trace":
            return build_command_response(gobj, 0, null, null, gobj_get_global_trace_level());
        case "get-global-no-trace":
            return build_command_response(gobj, 0, null, null, gobj_get_global_trace_no_level());
        case "set-global-trace":
        case "set-global-no-trace":
        {
            let no = (command === "set-global-no-trace");
            let level = kw.level;
            let set = parse_set(kw.set);
            if(!level) {
                return build_command_response(gobj, -1, `${yuno_prefix()}: what level?`, null, null);
            }
            if(set === null) {
                return build_command_response(gobj, -1, `${yuno_prefix()}: bitmask set or re-set?`, null, null);
            }
            let ret = no ? gobj_set_global_no_trace(level, set) : gobj_set_global_trace(level, set);
            if(ret < 0) {
                return build_command_response(
                    gobj, -1, `${yuno_prefix()}: global trace level not found: ${level}`, null, null
                );
            }
            if(no) {
                save_trace_scope(gobj, "no_trace_levels", "__global_no_trace__", gobj_get_global_trace_no_level());
                return build_command_response(gobj, 0, null, null, gobj_get_global_trace_no_level());
            }
            save_trace_scope(gobj, "trace_levels", "__global_trace__", gobj_get_global_trace_level());
            return build_command_response(gobj, 0, null, null, gobj_get_global_trace_level());
        }
        case "get-gclass-trace":
        case "get-gclass-no-trace":
        case "set-gclass-trace":
        case "set-gclass-no-trace":
        {
            let no = command.indexOf("no-trace") >= 0;
            let gclass_name = kw.gclass_name || kw.gclass || "";
            let gclass = gclass_find_by_name(gclass_name);
            if(!gclass) {
                return build_command_response(
                    gobj, -1, `${yuno_prefix()}: what gclass is '${gclass_name}'?`, null, null
                );
            }
            if(command.indexOf("get-") === 0) {
                return build_command_response(gobj, 0, null, null,
                    no ? gobj_get_gclass_trace_no_level(gclass) : gobj_get_gclass_trace_level(gclass)
                );
            }
            let level = kw.level;
            let set = parse_set(kw.set);
            if(!level) {
                return build_command_response(gobj, -1, `${yuno_prefix()}: what level?`, null, null);
            }
            if(set === null) {
                return build_command_response(gobj, -1, `${yuno_prefix()}: bitmask set or re-set?`, null, null);
            }
            let ret = no ? gobj_set_gclass_no_trace(gclass, level, set) : gobj_set_gclass_trace(gclass, level, set);
            if(ret < 0) {
                return build_command_response(
                    gobj, -1, `${yuno_prefix()}: trace level of ${gclass_name} not found: ${level}`, null, null
                );
            }
            if(no) {
                save_trace_scope(gobj, "no_trace_levels", gclass_name, gobj_get_gclass_trace_no_level(gclass));
                return build_command_response(gobj, 0, null, null, gobj_get_gclass_trace_no_level(gclass));
            }
            save_trace_scope(gobj, "trace_levels", gclass_name, gobj_get_gclass_trace_level2(gclass));
            return build_command_response(gobj, 0, null, null, gobj_get_gclass_trace_level(gclass));
        }
        default:
            return build_command_response(
                gobj, -1, `${yuno_prefix()}: command not available: ${command}`, null, null
            );
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *
 ***************************************************************/
function ac_timeout(gobj, event, kw, src)
{
    gobj_publish_event(gobj, event, kw);
    return 0;
}




                    /***************************
                     *          FSM
                     ***************************/




/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:  mt_create,
    mt_writing: mt_writing,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy,
    mt_play:    mt_play,
    mt_pause:   mt_pause,
    mt_command_parser: mt_command_parser,
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
    const st_idle = [
        ["EV_TIMEOUT_PERIODIC",     ac_timeout,     null]
    ];

    const states = [
        ["ST_IDLE",     st_idle]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_TIMEOUT_PERIODIC", event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        [0, 0]
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
        0,  // s_user_trace_level
        0   // gclass_flag
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
function register_c_yuno()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yuno };
