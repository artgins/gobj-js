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
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach, afterAll} from "vitest";
import {kw_get_str, kw_flag_t, kwid_get_ids, set_log_callback} from "../src/index.js";

/*  What the reader logs is part of what it answers: a plain read (flag 0)
 *  of an absent or mistyped key says nothing, a KW_REQUIRED one says it.
 *  Every test ends by checking what was logged, and the sink is taken
 *  away again, so it does not listen to the next test file.  */
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

    test("a value that is not a string answers the default itself", () => {
        expect(kw_get_str(null, {x: 5}, "x", "d", 0)).toBe("d");
        expect(kw_get_str(null, {x: 5}, "x", 0, 0)).toBe(0);
        expect(kw_get_str(null, {x: null}, "x", null, 0)).toBe(null);
        expect(kw_get_str(null, {x: {}}, "x", "", 0)).toBe("");
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
        expect(logged.some((m) => m.includes("path not found: 'x'"))).toBe(true);
        logged.length = 0;

        expect(kw_get_str(null, {x: 5}, "x", "d", kw_flag_t.KW_REQUIRED)).toBe("d");
        expect(logged.some((m) => m.includes("MUST BE a string"))).toBe(true);
        logged.length = 0;
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
    });

    test("kwid_get_ids() takes no id from a record that has none", () => {
        expect(kwid_get_ids(null, [{id: "a"}, {name: "no id"}, {id: "b"}]))
            .toEqual(["a", "b"]);
    });
});
