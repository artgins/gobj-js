/***********************************************************************
 *          secret_masking.test.js
 *
 *      What a trace or a log shows of a credential. The rule is the C
 *      kernel's (helpers.c): a key whose NAME is a secret's
 *      (is_secret_name(): passw, pwd, token, secret, jwt, api_key,
 *      private_key...) is shown "********" at any depth, whatever the
 *      type of its value, and so is a "name=value" inside a string (a
 *      command line), and the "value" of a write-attr whose attribute
 *      names a secret.
 *
 *      Where it is used, and what went in clear up to gobj-js 7.25.9:
 *        - the commands trace of gobj_command(): the line and, with
 *          ev_kw, its kw;
 *        - the machine trace with ev_kw (an event sent, a publication);
 *        - the kw a kw_get_*() error dumps ("path MUST BE ...");
 *        - the ievents trace of C_IEVENT_CLI (trace_inter_event).
 *
 *      And subs_flag carries the C kernel's bits.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_start,
    gobj_send_event,
    gobj_command,
    gobj_subscribe_event,
    gobj_set_global_trace,
    is_secret_name,
    mask_secrets_inline,
    json_mask_secrets,
    kw_get_str,
    set_log_callback,
    event_flag_t,
} from "../src/index.js";

let lines = [];
set_log_callback((level, msg) => {
    lines.push(typeof msg === "string"? msg : JSON.stringify(msg));
});

function seen(text)
{
    return lines.filter(l => l.indexOf(text) >= 0).length;
}

const yuno_attrs = [
SDATA(data_type_t.DTP_BOOLEAN, "trace_creation",   0, 0, "trace create/delete"),
SDATA(data_type_t.DTP_BOOLEAN, "trace_start_stop", 0, 0, "trace start/stop"),
SDATA_END()
];

function ac_note(gobj, event, kw, src)
{
    return 0;
}

let yuno = null;
let gobj = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_YUNO_MASK", [], [["ST_IDLE", []]], {}, null,
        yuno_attrs, {}, null, null, null, 0);
    gclass_create(
        "C_TEST_MASK",
        [["EV_NOTE", event_flag_t.EVF_OUTPUT_EVENT]],
        [["ST_IDLE", [["EV_NOTE", ac_note, 0]]]],
        {mt_command_parser: (g, command, kw, src) => ({result: 0})},
        null, [SDATA_END()], {}, null, null, null, 0
    );
    yuno = gobj_create_yuno("test_yuno_mask", "C_TEST_YUNO_MASK", {});
    gobj = gobj_create("mask1", "C_TEST_MASK", {}, yuno);
    gobj_start(gobj);
});

beforeEach(() => {
    lines = [];
});

describe("the names of the secrets", () => {
    test("is_secret_name() as the C kernel's", () => {
        expect(is_secret_name("smtp_password")).toBe(true);
        expect(is_secret_name("X-Api-Key")).toBe(true);
        expect(is_secret_name("private_key")).toBe(true);
        expect(is_secret_name("__session_id__")).toBe(true);
        expect(is_secret_name("ssl_certificate_key")).toBe(false);
        expect(is_secret_name("username")).toBe(false);
        expect(is_secret_name("token_endpoint")).toBe(false);
        expect(is_secret_name("cookie_domain")).toBe(false);
        expect(is_secret_name("jwt_public_keys")).toBe(false);
        expect(is_secret_name("refresh_token_count")).toBe(false);
        expect(is_secret_name("access_token")).toBe(true);
    });

    test("mask_secrets_inline() masks a name=value, and keeps the rest", () => {
        expect(mask_secrets_inline("set-user-pwd username=bob password=hunter2"))
            .toBe("set-user-pwd username=bob password=********");
        expect(mask_secrets_inline("login token='a b c' x=1"))
            .toBe("login token=******** x=1");
        expect(mask_secrets_inline("write-attr attribute=password value=hunter2"))
            .toBe("write-attr attribute=password value=********");
        expect(mask_secrets_inline("list-yunos id=1")).toBe(null);
        expect(mask_secrets_inline("command='set-user-pwd password=hunter2'"))
            .toBe("command='set-user-pwd password=********'");
        // a quote inside an unquoted value is part of it
        expect(mask_secrets_inline("write-attr attribute=password value=ab'cd"))
            .toBe("write-attr attribute=password value=********");
        expect(mask_secrets_inline('command="set-user password=p\'q"'))
            .toBe('command="set-user password=********"');
        expect(mask_secrets_inline('token=abc"def"ghi x=1'))
            .toBe("token=******** x=1");
        expect(is_secret_name("authorization_header")).toBe(true);
    });

    test("json_mask_secrets() masks at any depth, any type, and leaves the kw", () => {
        const kw = {
            username: "bob",
            password: 1234,
            auth: {access_token: "eyJ.x.y"},
            list: [{api_key: "k"}],
            __command__: "set-user-pwd password=hunter2",
            attribute: "password", value: "hunter2",
            empty_secret: ""
        };
        const shown = json_mask_secrets(kw);
        expect(shown.username).toBe("bob");
        expect(shown.password).toBe("********");
        expect(shown.auth.access_token).toBe("********");
        expect(shown.list[0].api_key).toBe("********");
        expect(shown.__command__).toBe("set-user-pwd password=********");
        expect(shown.value).toBe("********");
        expect(shown.empty_secret).toBe("");
        expect(kw.password).toBe(1234);
        expect(kw.auth.access_token).toBe("eyJ.x.y");
        const plain = {a: 1};
        expect(json_mask_secrets(plain)).toBe(plain);
    });
});

describe("only json is walked, and masking never throws", () => {
    test("a cyclic object: the back-edge is <cycle>, never the original", () => {
        const kw = {password: "x", note: "n"};
        kw.self = kw;
        let shown;
        expect(() => { shown = json_mask_secrets(kw); }).not.toThrow();
        expect(shown.password).toBe("********");
        expect(shown.note).toBe("n");
        expect(shown.self).toBe("<cycle>");
    });

    test("an object met twice is masked both times", () => {
        const creds = {password: "x"};
        const shown = json_mask_secrets({first: creds, second: creds, list: [creds, creds]});
        expect(shown.first.password).toBe("********");
        expect(shown.second.password).toBe("********");
        expect(shown.list[0].password).toBe("********");
        expect(shown.list[1].password).toBe("********");
    });

    test("a gobj in the kw is passed as it is, not walked", () => {
        const kw = {window: gobj, password: "x"};
        let shown;
        expect(() => { shown = json_mask_secrets(kw); }).not.toThrow();
        expect(shown.window).toBe(gobj);
        expect(shown.password).toBe("********");
    });

    test("a DOM-like node (a class instance with a cycle) is not walked", () => {
        class FakeNode {
            constructor() {
                this.parentNode = null;
                this.childNodes = [];
                this.password = "inside-a-node";
            }
        }
        const parent = new FakeNode();
        const child = new FakeNode();
        child.parentNode = parent;
        parent.childNodes.push(child);
        const kw = {$container: parent, token: "t"};
        let shown;
        expect(() => { shown = json_mask_secrets(kw); }).not.toThrow();
        expect(shown.$container).toBe(parent);
        expect(shown.token).toBe("********");
    });

    test("a typed array and a function are passed as they are", () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const fn = () => 1;
        const shown = json_mask_secrets({bytes: bytes, fn: fn, api_key: 1});
        expect(shown.bytes).toBe(bytes);
        expect(shown.fn).toBe(fn);
        expect(shown.api_key).toBe("********");
    });

    test("a trace of a kw holding a gobj does not throw", () => {
        gobj_set_global_trace("machine", true);
        gobj_set_global_trace("ev_kw", true);
        expect(() => {
            gobj_send_event(gobj, "EV_NOTE", {window: gobj, password: "p"}, gobj);
        }).not.toThrow();
        gobj_set_global_trace("ev_kw", false);
        gobj_set_global_trace("machine", false);
        expect(() => {
            kw_get_str(gobj, {window: gobj, password: 1}, "password", "", 0);
        }).not.toThrow();
    });

    test("a nesting deeper than the limit is not shown, and does not throw", () => {
        let deep = {};
        let p = deep;
        for(let i=0; i<10000; i++) {
            p.next = {};
            p = p.next;
        }
        expect(() => json_mask_secrets(deep)).not.toThrow();
    });
});

describe("what the traces and logs show", () => {
    test("the commands trace of gobj_command()", () => {
        gobj_set_global_trace("commands", true);
        gobj_set_global_trace("ev_kw", true);
        gobj_command(gobj, "set-user-pwd username=bob password=cmd-hunter2",
            {passwd: "kw-hunter2"}, gobj);
        gobj_set_global_trace("ev_kw", false);
        gobj_set_global_trace("commands", false);
        expect(seen("set-user-pwd username=bob password=********")).toBe(1);
        expect(seen("hunter2")).toBe(0);
    });

    test("the machine trace with ev_kw", () => {
        gobj_set_global_trace("machine", true);
        gobj_set_global_trace("ev_kw", true);
        gobj_send_event(gobj, "EV_NOTE", {client_secret: "ev-hunter2", note: "visible"}, gobj);
        gobj_set_global_trace("ev_kw", false);
        gobj_set_global_trace("machine", false);
        expect(seen("visible")).toBeGreaterThan(0);
        expect(seen("hunter2")).toBe(0);
    });

    test("the kw a kw_get_*() error dumps", () => {
        kw_get_str(gobj, {password: 5555555555555, note: "visible"}, "password", "", 0);
        expect(seen("visible")).toBeGreaterThan(0);
        expect(seen("5555555555555")).toBe(0);
    });

    test("subs_flag carries the C kernel's bits", () => {
        const subs = gobj_subscribe_event(gobj, "EV_NOTE",
            {__config__: {__hard_subscription__: true, __own_event__: true}}, yuno);
        expect(subs.subs_flag).toBe(0x2 | 0x4);
    });
});
