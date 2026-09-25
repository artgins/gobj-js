/***********************************************************************
 *          kw_find_path.test.js
 *
 *      kw_find_path() answers as the C one (kwid.c, kw_find_path_depth)
 *      and so do the typed readers built on it:
 *        - a kw that is not a dict or a list is logged ("kw must be list
 *          or dict") and finds nothing, so the reader answers its
 *          DEFAULT;
 *        - a middle segment whose value is a scalar is logged the same
 *          way and finds nothing;
 *        - a middle segment that is absent or null finds nothing, logged
 *          only when verbose.
 *
 *      Before gobj-js 7.25.6 a bad kw answered 0: kw_get_int() and
 *      kw_get_real() answered 0 instead of the default, kw_get_str() and
 *      kw_get_bool() logged a second line ("path MUST BE ..."), and the
 *      first line went through gobj_short_name(null), which logged
 *      "gobj bad type" and printed "null: ...". A null middle segment
 *      threw a TypeError where C answers the default.
 *
 *      The log sink sees every line, and each test says exactly which
 *      ones it expects.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach, afterAll} from "vitest";
import {
    kw_find_path, kw_get_bool, kw_get_int, kw_get_real, kw_get_str,
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

describe("a kw that is not a dict or a list", () => {
    test("kw_find_path() answers undefined, logged once", () => {
        expect(kw_find_path(null, null, "x", false)).toBe(undefined);
        expect(kw_find_path(null, "abc", "x", false)).toBe(undefined);
        expect(logged.splice(0)).toEqual([
            "kw must be list or dict: 'x'",
            "kw must be list or dict: 'x'"
        ]);
    });

    test("kw_get_int() and kw_get_real() answer the default", () => {
        expect(kw_get_int(null, null, "x", 5, 0)).toBe(5);
        expect(kw_get_real(null, null, "x", 2.5, 0)).toBe(2.5);
        expect(logged.splice(0)).toEqual([
            "kw must be list or dict: 'x'",
            "kw must be list or dict: 'x'"
        ]);
    });

    test("kw_get_str() and kw_get_bool() answer the default with one line", () => {
        expect(kw_get_str(null, null, "x", "d", 0)).toBe("d");
        expect(kw_get_bool(null, 7, "x", true, 0)).toBe(true);
        expect(logged.splice(0)).toEqual([
            "kw must be list or dict: 'x'",
            "kw must be list or dict: 'x'"
        ]);
    });

    test("KW_CREATE does not try to write into a null kw, as C", () => {
        expect(kw_get_int(null, null, "x", 5, kw_flag_t.KW_CREATE)).toBe(5);
        expect(logged.splice(0)).toEqual([
            "kw must be list or dict: 'x'"
        ]);
    });
});

describe("a path through a segment that is not a container", () => {
    test("a null middle segment answers the default, silent", () => {
        expect(kw_get_str(null, {a: null}, "a`b", "d", 0)).toBe("d");
        expect(kw_get_int(null, {a: null}, "a`b", 3, 0)).toBe(3);
        expect(kw_find_path(null, {a: null}, "a`b", false)).toBe(undefined);
    });

    test("a null middle segment is logged when verbose", () => {
        expect(kw_find_path(null, {a: null}, "a`b", true)).toBe(undefined);
        expect(logged.splice(0)).toEqual([
            "path not found: 'a`b'"
        ]);
    });

    test("a scalar middle segment answers the default, logged as C", () => {
        expect(kw_get_str(null, {a: 5}, "a`b", "d", 0)).toBe("d");
        expect(logged.splice(0)).toEqual([
            "kw must be list or dict: 'a`b'"
        ]);
    });

    test("a path through lists and dicts still finds its value", () => {
        expect(kw_find_path(null, {a: [{b: 1}, {b: 2}]}, "a`1`b", false)).toBe(2);
        expect(kw_find_path(null, {a: {b: null}}, "a`b", false)).toBe(null);
        expect(kw_find_path(null, {a: {}}, "a`b", false)).toBe(undefined);
    });
});
