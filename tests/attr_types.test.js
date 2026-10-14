/***********************************************************************
 *          attr_types.test.js
 *
 *      A value written to an attribute is read as its declared type by
 *      the grammar of the C command parser, the same in C and in JS
 *      (command_parameter_from_json(), json2item()):
 *      - the table of tests/fixtures/attr_types_parity.json, which the C
 *        test tests/c/attr_types of yunetas reads too: the same inputs,
 *        the same outcomes;
 *      - json2item() (the kw of gobj_create(), gobj_write_attrs()): a
 *        value that does not read as the type is refused with one
 *        log_error naming the attr, its type and why, the value masked
 *        and capped (a SDF_SECRET one never shown), and the attr keeps
 *        its value.
 *      Up to 7.26.21 parseInt("12abc") was 12, Number("") 0, "maybe" a
 *      false boolean, and a refusal said only "attr NaN".
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import {
    SDATA,
    SDATA_END,
    data_type_t,
    sdata_flag_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_read_attr,
    gobj_write_attrs,
    gobj_write_attr,
    gobj_write_integer_attr,
    gobj_write_bool_attr,
    gobj_write_str_attr,
    set_timeout,
    clear_timeout,
    register_c_timer,
    command_parameter_from_json,
    json_text_of,
    command_parameter_from_text,
    set_log_callback,
} from "../src/index.js";

const parity = JSON.parse(readFileSync(
    new URL("./fixtures/attr_types_parity.json", import.meta.url), "utf8"
));

const TYPES = {
    boolean:    data_type_t.DTP_BOOLEAN,
    integer:    data_type_t.DTP_INTEGER,
    real:       data_type_t.DTP_REAL,
    list:       data_type_t.DTP_LIST,
    dict:       data_type_t.DTP_DICT,
    json:       data_type_t.DTP_JSON,
};

const errors = [];
set_log_callback((level, msg) => {
    if(level === "error") {
        errors.push(String(msg));
    }
});

const attrs_table = [
SDATA(data_type_t.DTP_BOOLEAN,  "flag",     sdata_flag_t.SDF_WR,    "false",    "A boolean"),
SDATA(data_type_t.DTP_INTEGER,  "count",    sdata_flag_t.SDF_WR,    "7",        "An integer"),
SDATA(data_type_t.DTP_REAL,     "ratio",    sdata_flag_t.SDF_WR,    "0.5",      "A real"),
SDATA(data_type_t.DTP_LIST,     "items",    sdata_flag_t.SDF_WR,    "[]",       "A list"),
SDATA(data_type_t.DTP_DICT,     "settings", sdata_flag_t.SDF_WR,    "{}",       "A dict"),
SDATA(data_type_t.DTP_INTEGER,  "pin",      sdata_flag_t.SDF_WR|sdata_flag_t.SDF_SECRET, "0", "A secret"),
SDATA(data_type_t.DTP_STRING,   "name",     sdata_flag_t.SDF_WR,    "",         "A string"),
SDATA_END()
];

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_ATTR_TYPES_YUNO", [], [["ST_IDLE", []]], {}, null,
        [SDATA_END()], {}, null, null, null, 0);
    gclass_create("C_TEST_ATTR_TYPES", [], [["ST_IDLE", []]], {}, null,
        attrs_table, {}, null, null, null, 0);
    register_c_timer();
    yuno = gobj_create_yuno("test_yuno", "C_TEST_ATTR_TYPES_YUNO", {});
});

describe("the parity table: the same inputs, the same outcomes as in C", () => {
    for(const c of parity.cases) {
        let shown = JSON.stringify(c.value);
        if(shown.length > 60) {
            shown = `${shown.substring(0, 40)}... (${shown.length} characters)`;
        }
        test(`${c.type} given ${shown}`, () => {
            const r = command_parameter_from_json(TYPES[c.type], c.value);
            const outcome = c.js || c;     // the outcome of C, unless JS cannot give it
            if(Object.prototype.hasOwnProperty.call(outcome, "expect")) {
                expect(r.refused).toBe(null);
                expect(r.value).toEqual(outcome.expect);
            } else {
                expect(r.value).toBe(undefined);
                expect(r.refused).toBe(outcome.refused);
            }
        });
    }

    test("undefined is no value, as a null", () => {
        expect(command_parameter_from_json(data_type_t.DTP_INTEGER, undefined))
            .toEqual({value: undefined, refused: null});
    });

    test("command_parameter_from_text(): an empty text is 0 or false, as the line of a command", () => {
        expect(command_parameter_from_text(data_type_t.DTP_INTEGER, "").value).toBe(0);
        expect(command_parameter_from_text(data_type_t.DTP_BOOLEAN, "").value).toBe(false);
        expect(command_parameter_from_text(data_type_t.DTP_INTEGER, "12abc").refused)
            .toBe("a text that does not read as one");
        expect(command_parameter_from_text(data_type_t.DTP_JSON, "word").value).toBe("word");
        expect(command_parameter_from_text(data_type_t.DTP_JSON, "{\"a\": ").refused)
            .toBe("a text that does not read as one");
    });
});

describe("json2item(): the kw of gobj_create(), gobj_write_attrs()", () => {
    test("text from the config is read as the type", () => {
        errors.length = 0;
        const gobj = gobj_create("from_config", "C_TEST_ATTR_TYPES", {
            flag: "yes", count: "42", ratio: "2.5", items: "[1, 2]", settings: "{\"a\": 1}"
        }, yuno);
        expect(gobj_read_attr(gobj, "flag")).toBe(true);
        expect(gobj_read_attr(gobj, "count")).toBe(42);
        expect(gobj_read_attr(gobj, "ratio")).toBe(2.5);
        expect(gobj_read_attr(gobj, "items")).toEqual([1, 2]);
        expect(gobj_read_attr(gobj, "settings")).toEqual({a: 1});
        expect(errors).toEqual([]);
    });

    test("a value that does not read as the type is refused, loudly, and the attr keeps its value", () => {
        const gobj = gobj_create("refusals", "C_TEST_ATTR_TYPES", {count: 3}, yuno);
        const cases = [
            ["count", "12abc", "an integer", "a text that does not read as one", "'12abc'"],
            ["count", "", "an integer", "no value (a null, or an empty text)", "''"],
            ["count", 2.7, "an integer", "a real with decimals", "'2.7'"],
            ["ratio", "nan", "a real", "a text that does not read as one", "'nan'"],
            ["flag", "maybe", "a boolean", "a text that does not read as one", "'maybe'"],
            ["items", "{\"a\": 1}", "a json array", "a text that does not read as one", "'{\"a\": 1}'"],
            ["settings", 5, "a json object", "an integer", "'5'"],
        ];
        for(const [attr, value, type, why, shown] of cases) {
            errors.length = 0;
            const before = JSON.stringify(gobj_read_attr(gobj, attr));
            const ret = gobj_write_attrs(gobj, {[attr]: value}, -1, gobj);
            expect(ret).toBeLessThan(0);
            expect(JSON.stringify(gobj_read_attr(gobj, attr))).toBe(before);
            expect(errors.length).toBe(1);
            expect(errors[0]).toContain("Attribute value of the wrong type, not written");
            expect(errors[0]).toContain(`attr '${attr}'`);
            expect(errors[0]).toContain(`type ${type}`);
            expect(errors[0]).toContain(`got ${why}`);
            expect(errors[0]).toContain(`value ${shown}`);
        }
        expect(gobj_read_attr(gobj, "count")).toBe(3);
    });

    test("the value of a SDF_SECRET attr is never shown, any other masked and capped", () => {
        const gobj = gobj_create("secrets", "C_TEST_ATTR_TYPES", {}, yuno);
        errors.length = 0;
        gobj_write_attrs(gobj, {pin: "pin-hunter2"}, -1, gobj);
        gobj_write_attrs(gobj, {settings: "{\"password\": \"cut-hunter2"}, -1, gobj);
        gobj_write_attrs(gobj, {items: "x".repeat(200)}, -1, gobj);
        expect(errors.length).toBe(3);
        expect(errors.join("\n")).not.toContain("hunter2");
        expect(errors[0]).toContain("value '********'");
        expect(errors[2]).toContain(`value '${"x".repeat(64)}'`);
        expect(errors[2]).not.toContain("x".repeat(65));
    });

    test("an undefined value is an absent key: nothing written, nothing logged", () => {
        const gobj = gobj_create("undefined_values", "C_TEST_ATTR_TYPES", {count: 3}, yuno);
        errors.length = 0;
        expect(gobj_write_attrs(gobj, {count: undefined, flag: undefined}, -1, gobj)).toBe(0);
        expect(gobj_read_attr(gobj, "count")).toBe(3);
        expect(gobj_read_attr(gobj, "flag")).toBe(false);
        expect(errors).toEqual([]);
    });

    test("gobj_write_attr() reads the value as the attr's type too, as C", () => {
        const gobj = gobj_create("write_attr", "C_TEST_ATTR_TYPES", {count: 3}, yuno);
        errors.length = 0;
        expect(gobj_write_attr(gobj, "count", "42")).toBe(0);
        expect(gobj_read_attr(gobj, "count")).toBe(42);
        expect(gobj_write_attr(gobj, "ratio", 3)).toBe(0);
        expect(gobj_read_attr(gobj, "ratio")).toBe(3);
        expect(gobj_write_attr(gobj, "flag", "on")).toBe(0);
        expect(gobj_read_attr(gobj, "flag")).toBe(true);
        expect(gobj_write_attr(gobj, "settings", "{\"a\": 1}")).toBe(0);
        expect(gobj_read_attr(gobj, "settings")).toEqual({a: 1});
        expect(gobj_write_attr(gobj, "name", null)).toBe(0);
        expect(gobj_read_attr(gobj, "name")).toBe("");
        expect(errors).toEqual([]);

        expect(gobj_write_attr(gobj, "count", "12abc")).toBeLessThan(0);
        expect(gobj_read_attr(gobj, "count")).toBe(42);
        expect(gobj_write_attr(gobj, "count", 2.5)).toBeLessThan(0);
        expect(gobj_read_attr(gobj, "count")).toBe(42);
        expect(errors.length).toBe(2);
        expect(errors[0]).toContain("Attribute value of the wrong type, not written: attr 'count'");
    });

    test("gobj_write_attr() of undefined to a typed attr is refused: an explicit write of nothing", () => {
        const gobj = gobj_create("write_undefined", "C_TEST_ATTR_TYPES", {count: 3}, yuno);
        errors.length = 0;
        expect(gobj_write_attr(gobj, "count", undefined)).toBeLessThan(0);
        expect(gobj_read_attr(gobj, "count")).toBe(3);
        expect(errors.length).toBe(1);
    });

    test("the typed writers read the value as their type, by the same grammar", () => {
        const gobj = gobj_create("typed_writers", "C_TEST_ATTR_TYPES", {count: 3}, yuno);
        errors.length = 0;
        expect(gobj_write_integer_attr(gobj, "count", "42")).toBe(0);
        expect(gobj_read_attr(gobj, "count")).toBe(42);
        expect(gobj_write_integer_attr(gobj, "count", 7)).toBe(0);
        expect(gobj_read_attr(gobj, "count")).toBe(7);
        expect(gobj_write_bool_attr(gobj, "flag", "yes")).toBe(0);
        expect(gobj_read_attr(gobj, "flag")).toBe(true);
        expect(gobj_write_bool_attr(gobj, "flag", 0)).toBe(0);
        expect(gobj_read_attr(gobj, "flag")).toBe(false);
        expect(gobj_write_str_attr(gobj, "name", null)).toBe(0);
        expect(gobj_read_attr(gobj, "name")).toBe("");
        expect(gobj_write_str_attr(gobj, "name", undefined)).toBe(0);
        expect(gobj_read_attr(gobj, "name")).toBe("");
        expect(gobj_write_str_attr(gobj, "name", 5)).toBe(0);
        expect(gobj_read_attr(gobj, "name")).toBe("5");
        expect(errors).toEqual([]);

        for(const [writer, attr, value, kept] of [
            [gobj_write_integer_attr, "count", "12abc", 7],
            [gobj_write_integer_attr, "count", 2.5, 7],
            [gobj_write_integer_attr, "count", NaN, 7],
            [gobj_write_integer_attr, "count", undefined, 7],
            [gobj_write_bool_attr, "flag", "maybe", false],
            [gobj_write_bool_attr, "flag", {}, false],
            [gobj_write_integer_attr, "pin", "pin-hunter2", 0],
        ]) {
            errors.length = 0;
            expect(writer(gobj, attr, value)).toBeLessThan(0);
            expect(gobj_read_attr(gobj, attr)).toBe(kept);
            expect(errors.length).toBe(1);
            expect(errors[0]).toContain(`Attribute value of the wrong type, not written: attr '${attr}'`);
            expect(errors[0]).not.toContain("hunter2");
        }
    });

    test("a value with no json text (circular, a BigInt) is refused, not thrown", () => {
        const gobj = gobj_create("circular", "C_TEST_ATTR_TYPES", {name: "kept", count: 3}, yuno);
        const circular = {};
        circular.self = circular;
        for(const [label, write, attr, kept] of [
            ["gobj_write_str_attr", () => gobj_write_str_attr(gobj, "name", circular), "name", "kept"],
            ["gobj_write_str_attr BigInt", () => gobj_write_str_attr(gobj, "name", 10n), "name", "kept"],
            ["gobj_write_attr string", () => gobj_write_attr(gobj, "name", circular), "name", "kept"],
            ["gobj_write_attrs string", () => gobj_write_attrs(gobj, {name: circular}, -1, gobj), "name", "kept"],
            ["gobj_write_integer_attr", () => gobj_write_integer_attr(gobj, "count", circular), "count", 3],
            ["gobj_write_attr integer", () => gobj_write_attr(gobj, "count", circular), "count", 3],
        ]) {
            errors.length = 0;
            let ret;
            expect(() => {
                ret = write();
            }, label).not.toThrow();
            expect(ret, label).toBeLessThan(0);
            expect(gobj_read_attr(gobj, attr), label).toBe(kept);
            expect(errors.length, label).toBe(1);
            expect(errors[0], label).toContain(`attr '${attr}'`);
        }
    });

    test("a value that is not json is refused for a dict, a list or a string, at the write", () => {
        const gobj = gobj_create("not_json", "C_TEST_ATTR_TYPES",
            {name: "kept", items: [1], settings: {a: 1}}, yuno);
        const circular = {};
        circular.self = circular;
        const deep_circular = {a: [{}]};
        deep_circular.a[0].back = deep_circular;
        const values = [
            ["a circular object", circular],
            ["a cycle deep inside", deep_circular],
            ["a gobj", gobj],
            ["a Map", new Map([["a", 1]])],
            ["a Set", new Set([1])],
            ["a Date", new Date(0)],
            ["a BigInt inside", [1n]],
            ["a Map inside", {m: new Map()}],
        ];
        for(const [label, value] of values) {
            for(const [attr, kept, write] of [
                ["settings", {a: 1}, () => gobj_write_attr(gobj, "settings", value)],
                ["items", [1], () => gobj_write_attrs(gobj, {items: value}, -1, gobj)],
                ["name", "kept", () => gobj_write_str_attr(gobj, "name", value)],
                ["name", "kept", () => gobj_write_attr(gobj, "name", value)],
            ]) {
                if(attr === "settings" && Array.isArray(value)) {
                    continue;   // the wrong shape: refused as "an array"
                }
                if(attr === "items" && !Array.isArray(value)) {
                    continue;
                }
                errors.length = 0;
                let ret;
                expect(() => {
                    ret = write();
                }, `${label} to ${attr}`).not.toThrow();
                expect(ret, `${label} to ${attr}`).toBeLessThan(0);
                expect(gobj_read_attr(gobj, attr), `${label} to ${attr}`).toEqual(kept);
                expect(errors.length, `${label} to ${attr}`).toBe(1);
                expect(errors[0], `${label} to ${attr}`).toContain("got a value with no json text");
            }
        }

        errors.length = 0;
        const shared = {x: 1};
        expect(gobj_write_attr(gobj, "settings", {a: shared, b: shared, c: undefined})).toBe(0);
        expect(gobj_write_attr(gobj, "items", [shared, [shared]])).toBe(0);
        expect(gobj_write_attr(gobj, "settings", Object.assign(Object.create(null), {n: 1}))).toBe(0);
        expect(errors).toEqual([]);
    });

    test("a json text deeper than 2048 levels is refused for a dict or a list, as jansson refuses it", () => {
        const nest = (n, inner) => "[".repeat(n) + inner + "]".repeat(n);
        const at_limit = nest(2048, "");
        const over = nest(2049, "");
        const scalar_over = nest(2048, "1");    // a scalar is a level too
        expect(command_parameter_from_json(data_type_t.DTP_LIST, at_limit).refused).toBe(null);
        expect(command_parameter_from_json(data_type_t.DTP_LIST, nest(2047, "1")).refused).toBe(null);
        expect(command_parameter_from_json(data_type_t.DTP_LIST, over).refused)
            .toBe("a text that does not read as one");
        expect(command_parameter_from_json(data_type_t.DTP_LIST, scalar_over).refused)
            .toBe("a text that does not read as one");
        const dict_over = "{\"a\": ".repeat(2048) + "1" + "}".repeat(2048);
        const dict_at = "{\"a\": ".repeat(2047) + "1" + "}".repeat(2047);
        expect(command_parameter_from_json(data_type_t.DTP_DICT, dict_over).refused)
            .toBe("a text that does not read as one");
        expect(command_parameter_from_json(data_type_t.DTP_DICT, dict_at).refused).toBe(null);
        expect(command_parameter_from_json(data_type_t.DTP_JSON, over).value).toBe(over);
    });

    test("an explicit write of no value to a boolean or a real is refused, the attr keeps its value", () => {
        const gobj = gobj_create("absent_values", "C_TEST_ATTR_TYPES", {flag: true, ratio: 1.5}, yuno);
        for(const value of [undefined, null, "", "maybe"]) {
            errors.length = 0;
            expect(gobj_write_bool_attr(gobj, "flag", value)).toBeLessThan(0);
            expect(gobj_read_attr(gobj, "flag")).toBe(true);
            expect(errors.length).toBe(1);
        }
        for(const value of [null, ""]) {
            errors.length = 0;
            expect(gobj_write_attr(gobj, "ratio", value)).toBeLessThan(0);
            expect(gobj_read_attr(gobj, "ratio")).toBe(1.5);
            expect(errors.length).toBe(1);
        }
    });

    test("set_timeout() arms a whole number of milliseconds: 0.3 * 1000 is 300", () => {
        const timer = gobj_create("attr_types_timer", "C_TIMER", {}, yuno);
        errors.length = 0;
        set_timeout(timer, 0.3 * 1000);
        expect(gobj_read_attr(timer, "msec")).toBe(300);
        clear_timeout(timer);
        expect(errors).toEqual([]);
    });

    test("DTP_STRING takes any json as its text, as in C", () => {
        const gobj = gobj_create("strings", "C_TEST_ATTR_TYPES", {name: 8080}, yuno);
        expect(gobj_read_attr(gobj, "name")).toBe("8080");
    });
});

describe("a value is json, or it is refused: never thrown, never changed by its text", () => {
    function expect_refused(gobj, label, attr, kept, write) {
        errors.length = 0;
        let ret;
        expect(() => {
            ret = write();
        }, label).not.toThrow();
        expect(ret, label).toBeLessThan(0);
        expect(gobj_read_attr(gobj, attr), label).toEqual(kept);
        expect(errors.length, label).toBe(1);
        expect(errors[0], label).toContain(`attr '${attr}'`);
    }

    test("a getter or a proxy trap that throws is a refusal, not an exception", () => {
        const gobj = gobj_create("throwing_values", "C_TEST_ATTR_TYPES",
            {name: "kept", items: [1], settings: {a: 1}}, yuno);
        const boom = {get a() { throw new Error("boom"); }};
        const revoked = Proxy.revocable({}, {});
        revoked.revoke();
        const trap = new Proxy({a: 1}, {ownKeys() { throw new Error("trap"); }});
        for(const [label, value] of [["a getter", boom], ["a revoked proxy", revoked.proxy],
                                     ["a trap", trap], ["a getter inside", {x: [boom]}]]) {
            expect_refused(gobj, `${label}: str`, "name", "kept", () => gobj_write_str_attr(gobj, "name", value));
            expect_refused(gobj, `${label}: string`, "name", "kept", () => gobj_write_attr(gobj, "name", value));
            expect_refused(gobj, `${label}: dict`, "settings", {a: 1}, () => gobj_write_attr(gobj, "settings", value));
            expect_refused(gobj, `${label}: list`, "items", [1], () => gobj_write_attr(gobj, "items", [value]));
            expect_refused(gobj, `${label}: kw`, "settings", {a: 1},
                () => gobj_write_attrs(gobj, {settings: value}, -1, gobj));
        }
    });

    test("an object of another realm (a vm, an iframe) is json when it is a plain one", () => {
        const gobj = gobj_create("other_realm", "C_TEST_ATTR_TYPES",
            {name: "kept", items: [1], settings: {a: 1}}, yuno);
        const foreign = vm.runInNewContext("({a: 1, b: [1, {c: 2}], n: Object.create(null)})");
        errors.length = 0;
        expect(gobj_write_attr(gobj, "settings", foreign)).toBe(0);
        expect(gobj_write_attr(gobj, "items", [foreign])).toBe(0);
        expect(gobj_write_str_attr(gobj, "name", foreign)).toBe(0);
        expect(gobj_read_attr(gobj, "name")).toBe("{\"a\":1,\"b\":[1,{\"c\":2}],\"n\":{}}");
        expect(errors).toEqual([]);
        expect(gobj_write_attr(gobj, "settings", {a: 1})).toBe(0);
        for(const [label, code] of [["a Map", "new Map([['a', 1]])"], ["a Date", "new Date(0)"],
                                    ["a class instance", "new (class A { constructor() { this.a = 1; } })()"]]) {
            const value = vm.runInNewContext(code);
            expect_refused(gobj, `${label} of another realm`, "settings", {a: 1},
                () => gobj_write_attr(gobj, "settings", value));
        }
    });

    test("a value its text would change is refused: toJSON, NaN, Infinity, a function or undefined in an array", () => {
        const gobj = gobj_create("changing_values", "C_TEST_ATTR_TYPES",
            {name: "kept", items: [1], settings: {a: 1}}, yuno);
        for(const [label, value] of [
            ["an own toJSON", {a: 1, toJSON() { return "x"; }}],
            ["a toJSON inside", {a: {toJSON() { return 1; }}}],
            ["NaN inside", {a: NaN}],
            ["Infinity inside", {a: [1, -Infinity]}],
            ["a function in an array", {a: [() => 1]}],
            ["undefined in an array", {a: [1, undefined]}],
            ["a hole in an array", {a: [1, , 3]}],      // eslint-disable-line no-sparse-arrays
            ["a symbol in an array", {a: [Symbol("s")]}],
        ]) {
            expect_refused(gobj, `${label}: dict`, "settings", {a: 1}, () => gobj_write_attr(gobj, "settings", value));
            expect_refused(gobj, `${label}: str`, "name", "kept", () => gobj_write_str_attr(gobj, "name", value));
        }
        for(const value of [NaN, Infinity]) {
            expect_refused(gobj, `${value} to a string, it was the text "null"`, "name", "kept",
                () => gobj_write_str_attr(gobj, "name", value));
        }
        errors.length = 0;
        expect(gobj_write_attr(gobj, "settings", {a: 1, b: undefined, f() {}, s: Symbol("s")})).toBe(0);
        expect(errors).toEqual([]);
    });

    test("a value nested deeper than 2048 levels is refused, as its text is (a scalar is a level too)", () => {
        const gobj = gobj_create("deep_values", "C_TEST_ATTR_TYPES", {items: [1], settings: {a: 1}}, yuno);
        const nest = (n, inner) => {
            let v = inner;
            for(let i = 0; i < n; i++) {
                v = [v];
            }
            return v;
        };
        errors.length = 0;
        expect(gobj_write_attr(gobj, "items", nest(2047, []))).toBe(0);     // 2048 levels
        expect(gobj_write_attr(gobj, "items", nest(2047, 1))).toBe(0);      // the scalar is the 2048th
        expect(errors).toEqual([]);
        expect_refused(gobj, "2049 levels", "items", nest(2047, 1), () => gobj_write_attr(gobj, "items", nest(2048, [])));
        expect_refused(gobj, "a scalar at 2049", "items", nest(2047, 1), () => gobj_write_attr(gobj, "items", nest(2048, 1)));
        /*  Walked without recursion: a small stack (here 100 KB, where 2048
         *  frames of a recursive walk do not fit) does not make it refuse  */
        const script = `
            const G = await import(${JSON.stringify(new URL("../src/index.js", import.meta.url).href)});
            let v = 1;
            for(let i = 0; i < 2047; i++) {
                v = [v];
            }
            const r = G.command_parameter_from_json(G.data_type_t.DTP_LIST, v);
            console.log(JSON.stringify({refused: r.refused, ok: r.value === v}));
        `;
        const run = spawnSync(process.execPath, ["--stack-size=100", "--input-type=module", "-e", script],
            {encoding: "utf8"});
        expect(run.stderr).toBe("");
        expect(JSON.parse(run.stdout.trim().split("\n").pop())).toEqual({refused: null, ok: true});

        let deep = {};
        let cur = deep;
        for(let i = 0; i < 200000; i++) {
            cur.a = {};
            cur = cur.a;
        }
        expect_refused(gobj, "200000 levels", "settings", {a: 1}, () => gobj_write_attr(gobj, "settings", deep));
    });

    test("an integer JS cannot hold within int64 is refused: 2^63 is out of range, as in C", () => {
        for(const value of [JSON.parse("9223372036854775807"), JSON.parse("9223372036854775808"),
                            JSON.parse("9223372036854776800"), 2 ** 63, "9223372036854775807",
                            "9223372036854775296"]) {
            expect(command_parameter_from_json(data_type_t.DTP_INTEGER, value), String(value))
                .toEqual({value: undefined, refused: "a number out of its range"});
        }
        expect(command_parameter_from_json(data_type_t.DTP_INTEGER, "9223372036854774784").value)
            .toBe(9223372036854774784);
        expect(command_parameter_from_json(data_type_t.DTP_INTEGER, -(2 ** 63)).value).toBe(-(2 ** 63));
        expect(command_parameter_from_json(data_type_t.DTP_LIST, 2 ** 63).refused).toBe("a real");
        expect(command_parameter_from_json(data_type_t.DTP_LIST, -(2 ** 63)).refused).toBe("an integer");
    });
});

describe("json_text_of(): the text a string attr and the local storage write", () => {
    test("a value with a text that says it", () => {
        expect(json_text_of({a: 1, b: undefined, c: () => 1})).toBe("{\"a\":1}");
        expect(json_text_of("text")).toBe("\"text\"");
        expect(json_text_of(null)).toBe("null");
        expect(json_text_of([1, "x", {y: [true]}])).toBe("[1,\"x\",{\"y\":[true]}]");
    });

    test("no text: what the text would turn into another value", () => {
        const circular = {};
        circular.self = circular;
        for(const v of [undefined, () => 1, Symbol("s"), 10n, NaN, Infinity, circular,
                new Date(0), new Map(), {toJSON: () => 1}, {w: NaN}, [1, undefined],
                [1, , 3], [() => 1], {get a() { throw new Error("boom"); }}]) {   // eslint-disable-line no-sparse-arrays
            expect(json_text_of(v)).toBe(undefined);
        }
    });
});
