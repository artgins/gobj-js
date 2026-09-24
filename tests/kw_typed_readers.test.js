/***********************************************************************
 *          kw_typed_readers.test.js
 *
 *      kw_get_bool(), kw_get_int(), kw_get_real(), kw_get_dict() and
 *      kw_get_list() answer the way the C readers do: the value when it
 *      has the type of the reader, and otherwise the default (AS GIVEN
 *      for a dict or a list). KW_EXTRACT takes out only a value the
 *      reader answers with.
 *
 *      Before gobj-js 7.25.2 they passed everything through a JS
 *      constructor:
 *        - kw_get_list() answered Array(v), so a list found came back
 *          WRAPPED ({x: [1, 2]} gave [[1, 2]]), a default of [] gave
 *          [[]] and a default of null gave [null];
 *        - kw_get_dict() answered Object(default), so a null default
 *          came back as {} and a default of 0 as a Number object;
 *        - kw_get_bool() answered Boolean(v), so the string "false"
 *          was TRUE.
 *
 *      Before gobj-js 7.25.4 kw_get_int() and kw_get_real() deleted the
 *      value with KW_EXTRACT BEFORE they looked at its type, so a value
 *      that was not a number was lost and the default came back; they
 *      logged it only with KW_REQUIRED, ignored KW_WILD_NUMBER, and
 *      kw_get_int() truncated through parseInt(), which reads a number
 *      as its string: 1e-7 gave 1 and 1e21 gave 1.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach, afterAll} from "vitest";
import {
    kw_get_bool, kw_get_int, kw_get_real, kw_get_dict, kw_get_list,
    kw_set_subdict_value,
    kw_flag_t, set_log_callback
} from "../src/index.js";

const logged = [];

beforeAll(() => {
    set_log_callback((level, msg) => {
        logged.push(String(msg));
    });
});

beforeEach(() => {
    logged.length = 0;
});

afterEach(() => {
    expect(logged).toEqual([]);
});

afterAll(() => {
    set_log_callback(null);
});

describe("kw_get_list", () => {
    test("a list found comes back as it is, not wrapped", () => {
        const list = [1, 2];
        expect(kw_get_list(null, {x: list}, "x", [], 0)).toBe(list);
        expect(kw_get_list(null, {a: {x: []}}, "a`x", null, 0)).toEqual([]);
    });

    test("an absent key answers the default itself", () => {
        const dflt = [];
        expect(kw_get_list(null, {}, "x", dflt, 0)).toBe(dflt);
        expect(kw_get_list(null, {}, "x", null, 0)).toBe(null);
        expect(kw_get_list(null, {}, "x", undefined, 0)).toBe(undefined);
    });

    test("a value that is not a list answers the default itself", () => {
        expect(kw_get_list(null, {x: 5}, "x", null, 0)).toBe(null);
        expect(kw_get_list(null, {x: {}}, "x", [], 0)).toEqual([]);
        expect(kw_get_list(null, {x: "a,b"}, "x", [], 0)).toEqual([]);
    });

    test("KW_CREATE stores a list default, and nothing for null", () => {
        let kw = {};
        const got = kw_get_list(null, kw, "x", [], kw_flag_t.KW_CREATE);
        expect(got).toEqual([]);
        expect(kw.x).toBe(got);

        kw = {};
        expect(kw_get_list(null, kw, "x", null, kw_flag_t.KW_CREATE)).toBe(null);
        expect(kw).toEqual({});
    });

    test("KW_EXTRACT takes the list out of the kw", () => {
        const kw = {x: [1]};
        expect(kw_get_list(null, kw, "x", null, kw_flag_t.KW_EXTRACT)).toEqual([1]);
        expect(kw).toEqual({});
    });

    /*  The exact lines: before gobj-js 7.25.5 a caller with no gobj got a
     *  "gobj bad type" first, and a "null: " in front of the message.  */
    test("KW_REQUIRED logs an absent key and a value that is not a list", () => {
        expect(kw_get_list(null, {}, "x", null, kw_flag_t.KW_REQUIRED)).toBe(null);
        expect(logged.splice(0)).toEqual([
            "path not found: 'x'", "[object Object]"
        ]);

        expect(kw_get_list(null, {x: 5}, "x", null, kw_flag_t.KW_REQUIRED)).toBe(null);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json list: 'x'", "[object Object]"
        ]);
    });
});

describe("kw_get_dict", () => {
    test("a dict found comes back as it is", () => {
        const dict = {a: 1};
        expect(kw_get_dict(null, {x: dict}, "x", {}, 0)).toBe(dict);
    });

    test("an absent key answers the default itself", () => {
        const dflt = {};
        expect(kw_get_dict(null, {}, "x", dflt, 0)).toBe(dflt);
        expect(kw_get_dict(null, {}, "x", null, 0)).toBe(null);
        expect(kw_get_dict(null, {}, "x", 0, 0)).toBe(0);
    });

    test("a value that is not a dict answers the default itself", () => {
        expect(kw_get_dict(null, {x: [1]}, "x", null, 0)).toBe(null);
        expect(kw_get_dict(null, {x: "s"}, "x", {}, 0)).toEqual({});
        expect(kw_get_dict(null, {x: null}, "x", null, 0)).toBe(null);
    });

    test("KW_CREATE stores a dict default, and nothing for null", () => {
        let kw = {};
        const got = kw_get_dict(null, kw, "a`b", {}, kw_flag_t.KW_CREATE);
        expect(kw.a.b).toBe(got);

        kw = {};
        expect(kw_get_dict(null, kw, "x", null, kw_flag_t.KW_CREATE)).toBe(null);
        expect(kw).toEqual({});
    });

    test("KW_REQUIRED logs a value that is not a dict", () => {
        expect(kw_get_dict(null, {x: 5}, "x", null, kw_flag_t.KW_REQUIRED)).toBe(null);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json dict: 'x'", "[object Object]"
        ]);
    });

    test("kw_set_subdict_value() creates the dict it writes into", () => {
        const kw = {};
        expect(kw_set_subdict_value(null, kw, "a", "k", 1)).toBe(0);
        expect(kw).toEqual({a: {k: 1}});
    });
});

describe("kw_get_bool", () => {
    test("a boolean found comes back as it is", () => {
        expect(kw_get_bool(null, {x: true}, "x", false, 0)).toBe(true);
        expect(kw_get_bool(null, {x: false}, "x", true, 0)).toBe(false);
    });

    test("an absent key answers the default as a boolean", () => {
        expect(kw_get_bool(null, {}, "x", true, 0)).toBe(true);
        expect(kw_get_bool(null, {}, "x", 0, 0)).toBe(false);
    });

    /*  And SAYS so, required or not, as C's "path MUST BE a json
     *  boolean": a flag written as 1 or "true" is a caller that
     *  believes it set the flag, and the default it gets instead
     *  was silent.  */
    test("a value that is not a boolean answers the default, and is logged", () => {
        expect(kw_get_bool(null, {x: "false"}, "x", false, 0)).toBe(false);
        expect(kw_get_bool(null, {x: "true"}, "x", false, 0)).toBe(false);
        expect(kw_get_bool(null, {x: 1}, "x", false, 0)).toBe(false);
        expect(kw_get_bool(null, {x: {}}, "x", true, 0)).toBe(true);
        expect(kw_get_bool(null, {x: null}, "x", true, 0)).toBe(true);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json boolean: 'x'", "[object Object]",
            "path MUST BE a json boolean: 'x'", "[object Object]",
            "path MUST BE a json boolean: 'x'", "[object Object]",
            "path MUST BE a json boolean: 'x'", "[object Object]",
            "path MUST BE a json boolean: 'x'", "[object Object]"
        ]);
    });

    test("KW_WILD_NUMBER reads a number, a string or null as C does", () => {
        const W = kw_flag_t.KW_WILD_NUMBER;
        expect(kw_get_bool(null, {x: "false"}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: "FALSE"}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: "True"}, "x", false, W)).toBe(true);
        expect(kw_get_bool(null, {x: "0"}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: "7"}, "x", false, W)).toBe(true);
        expect(kw_get_bool(null, {x: "no"}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: 0}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: 2.5}, "x", false, W)).toBe(true);
        expect(kw_get_bool(null, {x: null}, "x", true, W)).toBe(false);
    });

    /*  C reads the string with atoi(): decimal only. Before gobj-js
     *  7.25.5 parseInt() with no base read "0x1F" as hex, so TRUE.  */
    test("KW_WILD_NUMBER reads a string as atoi() does, in base 10", () => {
        const W = kw_flag_t.KW_WILD_NUMBER;
        expect(kw_get_bool(null, {x: "0x1F"}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: "0X10"}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: "  -3abc"}, "x", false, W)).toBe(true);
        expect(kw_get_bool(null, {x: "010"}, "x", false, W)).toBe(true);
        expect(kw_get_bool(null, {x: "000"}, "x", true, W)).toBe(false);
    });

    test("KW_WILD_NUMBER on a list or a dict: false, and logged, as C does", () => {
        const W = kw_flag_t.KW_WILD_NUMBER;
        expect(kw_get_bool(null, {x: [true]}, "x", true, W)).toBe(false);
        expect(kw_get_bool(null, {x: {a: 1}}, "x", true, W)).toBe(false);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a simple json element: 'x'", "[object Object]",
            "path MUST BE a simple json element: 'x'", "[object Object]"
        ]);
    });

    test("KW_REQUIRED logs a value that is not a boolean", () => {
        expect(kw_get_bool(null, {x: "false"}, "x", true, kw_flag_t.KW_REQUIRED)).toBe(true);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json boolean: 'x'", "[object Object]"
        ]);
    });
});

describe("kw_get_int", () => {
    test("a number found comes back truncated toward zero, as C casts it", () => {
        expect(kw_get_int(null, {x: 7}, "x", 0, 0)).toBe(7);
        expect(kw_get_int(null, {x: 3.9}, "x", 0, 0)).toBe(3);
        expect(kw_get_int(null, {x: -3.9}, "x", 0, 0)).toBe(-3);
        expect(kw_get_int(null, {x: 1e-7}, "x", 5, 0)).toBe(0);
        expect(kw_get_int(null, {x: 1e21}, "x", 5, 0)).toBe(1e21);
    });

    test("an absent key answers the default as an integer", () => {
        expect(kw_get_int(null, {}, "x", 8080, 0)).toBe(8080);
        expect(kw_get_int(null, {}, "x", "8080", 0)).toBe(8080);
    });

    /*  C logs "path MUST BE a json integer" required or not.  */
    test("a value that is not a number answers the default, and is logged", () => {
        expect(kw_get_int(null, {x: "12"}, "x", 5, 0)).toBe(5);
        expect(kw_get_int(null, {x: true}, "x", 5, 0)).toBe(5);
        expect(kw_get_int(null, {x: null}, "x", 5, 0)).toBe(5);
        expect(kw_get_int(null, {x: [1]}, "x", 5, 0)).toBe(5);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json integer: 'x'", "[object Object]",
            "path MUST BE a json integer: 'x'", "[object Object]",
            "path MUST BE a json integer: 'x'", "[object Object]",
            "path MUST BE a json integer: 'x'", "[object Object]"
        ]);
    });

    test("KW_EXTRACT takes out a number, and leaves a value it did not answer with", () => {
        const X = kw_flag_t.KW_EXTRACT;
        let kw = {x: 4, y: 1};
        expect(kw_get_int(null, kw, "x", 0, X)).toBe(4);
        expect(kw).toEqual({y: 1});

        kw = {x: "4"};
        expect(kw_get_int(null, kw, "x", 0, X)).toBe(0);
        expect(kw).toEqual({x: "4"});
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json integer: 'x'", "[object Object]"
        ]);

        kw = {x: {a: 1}};
        expect(kw_get_int(null, kw, "x", 0, X | kw_flag_t.KW_WILD_NUMBER)).toBe(0);
        expect(kw).toEqual({x: {a: 1}});
        expect(logged.splice(0)).toEqual([
            "path MUST BE a simple json element: 'x'", "[object Object]"
        ]);
    });

    test("KW_WILD_NUMBER reads a boolean, a string or null as C does", () => {
        const W = kw_flag_t.KW_WILD_NUMBER;
        expect(kw_get_int(null, {x: true}, "x", 5, W)).toBe(1);
        expect(kw_get_int(null, {x: false}, "x", 5, W)).toBe(0);
        expect(kw_get_int(null, {x: "12"}, "x", 5, W)).toBe(12);
        expect(kw_get_int(null, {x: " -12abc"}, "x", 5, W)).toBe(-12);
        expect(kw_get_int(null, {x: "0x1F"}, "x", 5, W)).toBe(31);
        expect(kw_get_int(null, {x: "017"}, "x", 5, W)).toBe(15);
        expect(kw_get_int(null, {x: "abc"}, "x", 5, W)).toBe(0);
        expect(kw_get_int(null, {x: null}, "x", 5, W)).toBe(0);
        const kw = {x: "3"};
        expect(kw_get_int(null, kw, "x", 5, W | kw_flag_t.KW_EXTRACT)).toBe(3);
        expect(kw).toEqual({});
    });

    test("KW_WILD_NUMBER on a list or a dict: 0, and logged, as C does", () => {
        const W = kw_flag_t.KW_WILD_NUMBER;
        expect(kw_get_int(null, {x: [1]}, "x", 5, W)).toBe(0);
        expect(kw_get_int(null, {x: {a: 1}}, "x", 5, W)).toBe(0);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a simple json element: 'x'", "[object Object]",
            "path MUST BE a simple json element: 'x'", "[object Object]"
        ]);
    });

    test("KW_CREATE stores the default when the key is absent", () => {
        const kw = {};
        expect(kw_get_int(null, kw, "a`x", 3, kw_flag_t.KW_CREATE)).toBe(3);
        expect(kw).toEqual({a: {x: 3}});
    });

    test("KW_REQUIRED logs an absent key", () => {
        expect(kw_get_int(null, {}, "x", 5, kw_flag_t.KW_REQUIRED)).toBe(5);
        expect(logged.splice(0)).toEqual([
            "path not found: 'x'", "[object Object]"
        ]);
    });
});

describe("kw_get_real", () => {
    test("a number found comes back as it is", () => {
        expect(kw_get_real(null, {x: 2.5}, "x", 0, 0)).toBe(2.5);
        expect(kw_get_real(null, {x: 3}, "x", 0, 0)).toBe(3);
    });

    test("an absent key answers the default as a number", () => {
        expect(kw_get_real(null, {}, "x", 1.5, 0)).toBe(1.5);
        expect(kw_get_real(null, {}, "x", "2.5", 0)).toBe(2.5);
    });

    /*  C logs "path MUST BE a json real" required or not.  */
    test("a value that is not a number answers the default, and is logged", () => {
        expect(kw_get_real(null, {x: "1.5"}, "x", 2.5, 0)).toBe(2.5);
        expect(kw_get_real(null, {x: false}, "x", 2.5, 0)).toBe(2.5);
        expect(kw_get_real(null, {x: null}, "x", 2.5, 0)).toBe(2.5);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json real: 'x'", "[object Object]",
            "path MUST BE a json real: 'x'", "[object Object]",
            "path MUST BE a json real: 'x'", "[object Object]"
        ]);
    });

    test("KW_EXTRACT takes out a number, and leaves a value it did not answer with", () => {
        const X = kw_flag_t.KW_EXTRACT;
        let kw = {x: 1.5};
        expect(kw_get_real(null, kw, "x", 0, X)).toBe(1.5);
        expect(kw).toEqual({});

        kw = {x: "1.5"};
        expect(kw_get_real(null, kw, "x", 0, X)).toBe(0);
        expect(kw).toEqual({x: "1.5"});
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json real: 'x'", "[object Object]"
        ]);
    });

    test("KW_WILD_NUMBER reads a boolean, a string or null as C does", () => {
        const W = kw_flag_t.KW_WILD_NUMBER;
        expect(kw_get_real(null, {x: true}, "x", 5, W)).toBe(1);
        expect(kw_get_real(null, {x: "1.5"}, "x", 5, W)).toBe(1.5);
        expect(kw_get_real(null, {x: " -2.5e1xyz"}, "x", 5, W)).toBe(-25);
        expect(kw_get_real(null, {x: "abc"}, "x", 5, W)).toBe(0);
        expect(kw_get_real(null, {x: null}, "x", 5, W)).toBe(0);
    });

    test("KW_WILD_NUMBER on a list or a dict: 0, and logged, as C does", () => {
        const W = kw_flag_t.KW_WILD_NUMBER;
        expect(kw_get_real(null, {x: [1]}, "x", 5, W)).toBe(0);
        expect(logged.splice(0)).toEqual([
            "path MUST BE a simple json element: 'x'", "[object Object]"
        ]);
    });
});
