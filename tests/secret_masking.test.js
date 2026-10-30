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
 *      And a secret by its VALUE, under any key or none: a JWT and the
 *      token after "Bearer "; pass, pin and otp are secrets' names as
 *      WHOLE segments; a NUL in a string is read as a blank -- the same
 *      table as the C kernel's test_secret_attrs.
 *      And after "Bearer" or "Basic" only a word that can be a
 *      credential (never prose), a quoted or doubled one whatever its
 *      shape, a JWE, a JWT cut by a cap, a "name: value" of a secret's
 *      name, a scheme under a secret's name masked whole.
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

/*
 *  The C kernel's table of tests/c/secret_attrs/test_secret_attrs.c:
 *  the same texts, the same answers
 */
const SCHEME_WORD_SHAPES = [
    ["the bearer of this letter", null],
    ["Pay the Bearer Bond.", null],
    ["the bearer self-service and/or e.g. holder", null],
    ["bearer BOND", null],
    ["el portador bearer señor", null],
    ["a basic plan, BASIC programs, Basic Operations", null],
    ["Basic YWRtaW4=", null],
    ["Bearer mF_9.B5f-4.1JqM", "Bearer ********"],
    ["bearer abcdEFGHijkl", "bearer ********"],
    ["Bearer 12345678", "Bearer ********"],
    ["Bearer abcdefghijklmnopqrstuvwxyz", "Bearer ********"],
    ["Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln", "Bearer ********"],
    ["Bearer short1", null],
    ["x Basic dXNlcjpwYXNz y", "x Basic ******** y"],
    ["basic YTpi", "basic ********"],
    ["Bearer Bearer TOKEN", "Bearer Bearer ********"],
    ["Bearer \"tok\"", "Bearer ********"],
    ["bearer: tok", "bearer: ********"],
    ["x eyJhbGciOiJSU0EtT0FFUCJ9.OKOawDo.48V1_ALb.5eym8TW.XFBoMYUZ y", "x ******** y"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZX", "********"],
    ["the jwt eyJhbGciOiJIUzI1NiJ9.", null],     // its only dot ends the sentence: a header
    ["the jwt eyJhbGciOiJIUzI1NiJ9.eyJ", "the jwt ********"],     // cut after its header
    ["eyJhbGciOiJIUzI1NiJ9", null],
    ["token=Bearer abc x=1", "token=******** x=1"],
    ["password=Basic xyz", "password=********"],
    ["\"password\": Bearer abc, \"a\": 1", "\"password\": ********, \"a\": 1"],
    ["{\"password\": \"pw-hunter2\", \"user\": \"bob\"}", "{\"password\": ********, \"user\": \"bob\"}"],
    ["\"password\": hunter2", "\"password\": ********"],
    ["Authorization: Basic dXNlcjpwYXNz", "Authorization: ********"],
    ["X-Auth-Token: xat-hunter2; next", "X-Auth-Token: ********; next"],
    ["{'token': 'py-hunter2'}", "{'token': ********}"],
    ["token_endpoint: https://idp/token", null],
    ["at 12:30:45 on host:8080", null],
    ["Wrong token: try again", "Wrong token: ******** again"],

    /*
     *  Each rule judges the text as it came, and 7.26.9's reading of the
     *  parameters is kept whole -- texts whose secrets 7.26.9 masked
     */
    ["eyJzdWIiOiJ4In0.bearer12345678=sr1-hunter2", "********=********"],
    ["Bearer Bearer pwd=x \"sr2-hunter2\"", "Bearer Bearer ********"],
    ["x-auth-token: password=sr3,hunter2 c", "x-auth-token: ********"],
    ["x Bearer abc%2Bsr4hunter2 y", "x Bearer ******** y"],
    ["password12:30command='sr5-hunter2' y", "password12:******** y"],
    ["update-node x='{\\\"password\\\":\\\"sr6-hunter2\\\"}'",
     "update-node x='{\\\"password\\\":********}'"],

    /*
     *  gobj-js 7.26.22: a secret's name in a query string, after a word
     *  that is no secret's name ("file" is about a credential); what
     *  7.26.19 masked after the value of a name of a segment (pass, pin);
     *  a scheme and its credential under a secret's name, whole
     */
    ["GET https://my-file-server.com/get?token=qs1-hunter2&x=1",
     "GET https://my-file-server.com/get?token=********&x=1"],
    ["https://cdn.public.example/x?access_token=qs2-hunter2", "https://cdn.public.example/x?access_token=********"],
    ["db_pass='password'=qs3-hunter2", "db_pass=********=********"],
    ["pin='token=qs4'hunter2 x", "pin=********"],
    ["password=Basic qs5hunter2==", "password=********"],
    ["eyJhIjoxfQ. eyJhIjoxfQ..", null],  // headers whose dots end them

    /*
     *  gobj-js 7.26.24: a query name as a form writes it -- in brackets,
     *  %-encoded -- after a word that is no secret's name, and the password
     *  of the userinfo of a URL
     */
    ["GET https://my-file-server.com/get?user[password]=wn1-hunter2&x=1",
     "GET https://my-file-server.com/get?user[password]=********&x=1"],
    ["GET https://my-file-server.com/get?t%6Fken=wn2-hunter2", "GET https://my-file-server.com/get?t%6Fken=********"],
    ["GET https://my-file-server.com/f?user%5Bpin%5D=1234&a%5B0%5D=5",
     "GET https://my-file-server.com/f?user%5Bpin%5D=********&a%5B0%5D=5"],
    ["clone https://bob:wn3-hunter2@git.example/x.git", "clone https://bob:********@git.example/x.git"],
    ["redis://:wn4-hunter2@[::1]:6379/0", "redis://:********@[::1]:6379/0"],
    ["ssh://git@github.com:22/x http://[::1]:8080/y", null],     // a user, a port: no password
    ["x https://[dead:beef]:z@h", "x https://[dead:********@h"],   // a userinfo that begins with '['
    ["x https://[ab::cd]:80@h", "x https://[ab:********@h"],

    /*
     *  gobj-js 7.26.25: a URL or a query %-encoded inside the value of a
     *  parameter (redirect_uri=, next=, url=), and a name encoded twice,
     *  are read decoded too; a word of a value is not the name of the
     *  parameter after it
     */
    ["GET /cb?next=%2Flogin%3Fpassword%3Dnx1-hunter2", "GET /cb?next=%2Flogin%3Fpassword%3D********"],
    ["url=https%3A%2F%2Fbob%3Anx2-hunter2%40host", "url=https%3A%2F%2Fbob%3A********%40host"],
    ["redirect_uri=https%3A%2F%2Fapp%2Fcb%3Ftoken%3Dnx3-hunter2&state=1",
     "redirect_uri=https%3A%2F%2Fapp%2Fcb%3Ftoken%3D********"],
    ["%2570assword=nx4-hunter2", "%2570assword=********"],
    ["state=%7B%22token%22%3A%22nx5-hunter2%22%7D", "state=%7B%22token%22%3A********%7D"],
    ["next=https%253A%252F%252Fapp%252Fcb%253Fpassword%253Dnx6-hunter2",
     "next=https%253A%252F%252Fapp%252Fcb%253Fpassword%253D********"],
    ["GET /search?q=boarding+pass&lang=es", null],
    ["GET /x?q=1&db_pass=nx7-hunter2", "GET /x?q=1&db_pass=********"],
];

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
        // the words of a secret written with blanks are the secret
        expect(mask_secrets_inline("command='set-email-user password=correct horse battery'"))
            .toBe("command='set-email-user password=********'");
        expect(mask_secrets_inline('command="set-user-pwd password= hunter2"'))
            .toBe('command="set-user-pwd password=********"');
        expect(mask_secrets_inline("set-password password= note=x")).toBe(null);
        expect(mask_secrets_inline("x password=a b c user=bob"))
            .toBe("x password=******** user=bob");
        // the name is the word before the '=', as in C
        for(const name of ["'password'", "password'", '"password"', "user[password]",
                           'kw["password"]', "password[0]"]) {
            expect(mask_secrets_inline(name + "=x")).toBe(name + "=********");
        }
        // a long name is judged by its last characters
        const long_name = "x".repeat(130) + "_password";
        expect(mask_secrets_inline("attribute=" + long_name + " value=v"))
            .toBe("attribute=" + long_name + " value=********");
        expect(json_mask_secrets({[long_name]: "hunter2"})[long_name]).toBe("********");
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

describe("a secret by its value, and pass/pin/otp as whole segments (the C kernel's)", () => {
    test("pass, pin and otp are secrets' names as WHOLE segments only; key and cert are not", () => {
        for(const name of ["pass", "db_pass", "user-pin", "otp", "sim_pin", "PIN", "user[pin]", "otp.code"]) {
            expect(is_secret_name(name), name).toBe(true);
        }
        for(const name of ["passive", "bypass", "compass", "ping", "mapping", "spinner", "otpx", "pin2",
                           "pin_count", "key", "cert", "cert_pem"]) {
            expect(is_secret_name(name), name).toBe(false);
        }
    });

    test("a JWT, and the token after Bearer, by their shape: the C kernel's table", () => {
        const shapes = [
            ["note=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnLWh1bnRlcjI x=1", "note=******** x=1"],
            ["curl -H 'Authorization: Bearer abc-hunter2' x", "curl -H 'Authorization: ********' x"],
            ["BEARER   tok-hunter2", "BEARER   ********"],
            ["the jwt eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.c2ln.", "the jwt ********."],
            ["pin=1234 sim_pin=5678 ping=1", "pin=******** sim_pin=******** ping=1"],
            ["eyJabc.def x=eyJabc", "******** x=eyJabc"],  // two parts: a JWT a cap cut
            ["xeyJa.b.c", null],                // inside a word
            ["bearer=x", "bearer=********"],    // its name, as before
        ];
        for(const [text, shown] of shapes) {
            expect(mask_secrets_inline(text), text).toBe(shown);
        }
    });

    test("the word after Bearer or Basic, by its shape, and the name: value rule", () => {
        const shapes = SCHEME_WORD_SHAPES;
        for(const [text, shown] of shapes) {
            expect(mask_secrets_inline(text), text).toBe(shown);
        }
    });

    test("json_mask_secrets(): a JWT or a Bearer token under any key, a NUL read as a blank", () => {
        const shown = json_mask_secrets({
            note: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.jwtnote-hunter2",
            headers: "Authorization: Bearer hdr-hunter2",
            sim_pin: 4242,
            db_pass: "dbpass-hunter2",
            passive: "visible-passive",
            nul: "a\u0000password=nul-hunter2",
        });
        expect(shown.note).toBe("********");
        expect(shown.headers).toBe("Authorization: ********");
        expect(shown.sim_pin).toBe("********");
        expect(shown.db_pass).toBe("********");
        expect(shown.passive).toBe("visible-passive");
        expect(shown.nul).toBe("a password=********");     // as C: the NUL shown as a blank
    });

    test("json_mask_secrets(): a token in the query of a url", () => {
        const shown = json_mask_secrets({url: "https://cdn.public.example/x?access_token=urljson-hunter2"});
        expect(shown.url).toBe("https://cdn.public.example/x?access_token=********");
    });

    test("a name is judged as the C kernel judges it: its last 128 BYTES, its case folded in ASCII", () => {
        // 5 + 124 + 9 bytes: C judges the last 128, without "file_"
        const long_name = "file_" + "\u00e9".repeat(62) + "_password";
        expect(mask_secrets_inline(long_name + "=hunter2")).toBe(long_name + "=********");
        expect(json_mask_secrets({[long_name]: "hunter2"})[long_name]).toBe("********");
        // 2 + 5 + 116 + 6 bytes: the cut falls inside the e-acute, and what
        // is left of it is no joiner: "<byte>file" is no segment "file"
        const cut_name = "\u00e9file_" + "a".repeat(116) + "_token";
        expect(mask_secrets_inline(cut_name + "=hunter2")).toBe(cut_name + "=********");
        // the Kelvin sign is no 'k' (C folds ASCII only)
        expect(is_secret_name("to\u212aen")).toBe(false);
        expect(mask_secrets_inline("to\u212aen=hunter2")).toBe(null);
        expect(is_secret_name("TOKEN")).toBe(true);
    });

    test("json_mask_secrets(): a key with a NUL is judged by all of it, as C", () => {
        const shown = json_mask_secrets({"a\u0000password": "nulkey-hunter2", note: "visible"});
        expect(shown["a\u0000password"]).toBe("********");
        expect(shown.note).toBe("visible");
        expect(Object.keys(shown).length).toBe(2);
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
