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
        const shown = JSON.stringify(c.value);
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
