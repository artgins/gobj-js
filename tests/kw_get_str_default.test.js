/***********************************************************************
 *          kw_get_str_default.test.js
 *
 *      kw_get_str() returns its default AS GIVEN, as the C one does
 *      (`const char *default_value`, where 0 is NULL). A default of 0
 *      or null that came back as the string "0" or "null" was TRUE, so
 *      an `if(value)` on the answer took an absent key for a present
 *      one: kwid_get_ids() added the id "0" for a record with no id,
 *      and the ievent client named a service "null" or "0" instead of
 *      falling back to its wanted service.
 *
 *      And it LOGS what C logs: a value that is there and is not a
 *      string ("path MUST BE a json str", required or not), never a
 *      null one, and with KW_REQUIRED a path that is not there. Before
 *      gobj-js 7.25.5 a value of another type was silent unless
 *      KW_REQUIRED was passed -- and then a null one was logged too,
 *      behind a "gobj bad type" for a caller with no gobj.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach, afterAll} from "vitest";
import {kw_get_str, kw_flag_t, kwid_get_ids, set_log_callback} from "../src/index.js";

/*  What the reader logs is part of what it answers, so every test that
 *  expects a log compares the WHOLE list, and every test ends by checking
 *  that nothing else was logged. The sink is taken away again, so it does
 *  not listen to the next test file.  */
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

describe("kw_get_str: the default comes back as given", () => {
    test("an absent key answers the default itself, never its string", () => {
        expect(kw_get_str(null, {}, "x", 0, 0)).toBe(0);
        expect(kw_get_str(null, {}, "x", null, 0)).toBe(null);
        expect(kw_get_str(null, {}, "x", undefined, 0)).toBe(undefined);
        expect(kw_get_str(null, {}, "x", "", 0)).toBe("");
        expect(kw_get_str(null, {}, "x", "d", 0)).toBe("d");
        expect(kw_get_str(null, {a: {}}, "a`x", 0, 0)).toBe(0);
    });

    test("a value that is not a string answers the default, and is logged", () => {
        expect(kw_get_str(null, {x: 5}, "x", "d", 0)).toBe("d");
        expect(kw_get_str(null, {x: true}, "x", 0, 0)).toBe(0);
        expect(kw_get_str(null, {x: {}}, "x", "", 0)).toBe("");
        expect(kw_get_str(null, {a: {x: [1]}}, "a`x", "", 0)).toBe("");
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json str: 'x'", "[object Object]",
            "path MUST BE a json str: 'x'", "[object Object]",
            "path MUST BE a json str: 'x'", "[object Object]",
            "path MUST BE a json str: 'a`x'", "[object Object]"
        ]);
    });

    test("a null value answers the default, and is not logged, required or not", () => {
        const R = kw_flag_t.KW_REQUIRED;
        expect(kw_get_str(null, {x: null}, "x", null, 0)).toBe(null);
        expect(kw_get_str(null, {x: null}, "x", "d", R)).toBe("d");
        expect(kw_get_str(null, {x: undefined}, "x", "d", R)).toBe("d");
        expect(kw_get_str(null, {a: {x: null}}, "a`x", "d", R)).toBe("d");
    });

    test("a string found is answered as it is", () => {
        expect(kw_get_str(null, {x: "abc"}, "x", 0, 0)).toBe("abc");
        expect(kw_get_str(null, {x: ""}, "x", "d", 0)).toBe("");
        expect(kw_get_str(null, {a: {x: "0"}}, "a`x", null, 0)).toBe("0");
    });

    test("KW_CREATE stores a string default, and null for any other", () => {
        let kw = {};
        expect(kw_get_str(null, kw, "x", "d", kw_flag_t.KW_CREATE)).toBe("d");
        expect(kw.x).toBe("d");

        kw = {};
        expect(kw_get_str(null, kw, "x", 0, kw_flag_t.KW_CREATE)).toBe(0);
        expect(kw).toHaveProperty("x", null);
    });

    test("KW_REQUIRED logs an absent key and a value that is not a string", () => {
        expect(kw_get_str(null, {}, "x", "d", kw_flag_t.KW_REQUIRED)).toBe("d");
        expect(kw_get_str(null, {a: {}}, "a`x", "d", kw_flag_t.KW_REQUIRED)).toBe("d");
        expect(logged.splice(0)).toEqual([
            "path not found: 'x'", "[object Object]",
            "path not found: 'a`x'", "[object Object]"
        ]);

        /*  With no gobj there is no name to give, and no "gobj bad type".  */
        expect(kw_get_str(null, {x: 5}, "x", "d", kw_flag_t.KW_REQUIRED)).toBe("d");
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json str: 'x'", "[object Object]"
        ]);
    });

    /*  Before gobj-js 7.25.4 the key was deleted BEFORE its type was
     *  looked at: a value that was not a string was lost, and the
     *  caller got the default.  */
    test("KW_EXTRACT takes out a string, and leaves a value it did not answer with", () => {
        let kw = {x: "abc", y: 1};
        expect(kw_get_str(null, kw, "x", "d", kw_flag_t.KW_EXTRACT)).toBe("abc");
        expect(kw).toEqual({y: 1});

        kw = {x: 5};
        expect(kw_get_str(null, kw, "x", "d", kw_flag_t.KW_EXTRACT)).toBe("d");
        expect(kw).toEqual({x: 5});
        expect(logged.splice(0)).toEqual([
            "path MUST BE a json str: 'x'", "[object Object]"
        ]);
    });

    test("kwid_get_ids() takes no id from a record that has none", () => {
        expect(kwid_get_ids(null, [{id: "a"}, {name: "no id"}, {id: "b"}]))
            .toEqual(["a", "b"]);
    });
});
