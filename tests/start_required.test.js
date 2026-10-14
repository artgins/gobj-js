/***********************************************************************
 *          start_required.test.js
 *
 *      gobj_start() refuses a gobj with an empty SDF_REQUIRED attribute,
 *      as gobj_start() does in C (gobj_check_required_attrs()): one ERROR
 *      naming the attributes, -1, and the gobj is not started (mt_start
 *      is not called). Empty is what C asks, type by type: a string "",
 *      a list, a dict or a json with nothing usable in it (empty_json():
 *      null, {}, [], "" and any scalar), a null pointer. A boolean, an
 *      integer or a real is never empty. The check was a TODO with the C
 *      code commented out, so a JS gobj started without what it needs.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    SDATA,
    SDATA_END,
    data_type_t,
    sdata_flag_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_start,
    gobj_start_tree,
    gobj_stop_tree,
    gobj_destroy,
    gobj_is_running,
    gobj_write_attr,
    gobj_name,
    set_log_callback,
} from "../src/index.js";

let errors = [];
set_log_callback((level, msg) => {
    if(level === "error") {
        errors.push(String(msg));
    }
});

const started = [];
const R = sdata_flag_t.SDF_RD | sdata_flag_t.SDF_WR | sdata_flag_t.SDF_REQUIRED;

const attrs_table = [
SDATA(data_type_t.DTP_STRING,   "url",      R,  "",     "A required string"),
SDATA(data_type_t.DTP_LIST,     "items",    R,  "[]",   "A required list"),
SDATA(data_type_t.DTP_DICT,     "config",   R,  "{}",   "A required dict"),
SDATA(data_type_t.DTP_JSON,     "any",      R,  "",     "A required json"),
SDATA(data_type_t.DTP_POINTER,  "peer",     R,  null,   "A required pointer"),
SDATA(data_type_t.DTP_BOOLEAN,  "flag",     R,  "false","Never empty"),
SDATA(data_type_t.DTP_INTEGER,  "count",    R,  "0",    "Never empty"),
SDATA(data_type_t.DTP_REAL,     "ratio",    R,  "0",    "Never empty"),
SDATA(data_type_t.DTP_STRING,   "note",     sdata_flag_t.SDF_WR,  "",  "Not required"),
SDATA_END()
];

const FULL = {
    url: "ws://localhost:1",
    items: [1],
    config: {a: 1},
    any: {b: 2},
};

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_REQ_YUNO", [], [["ST_IDLE", []]], {}, null,
        [SDATA_END()], {}, null, null, null, 0);
    gclass_create("C_REQ", [], [["ST_IDLE", []]], {
        mt_start: (gobj) => {
            started.push(gobj_name(gobj));
            return 0;
        },
    }, null, attrs_table, {}, null, null, null, 0);
    yuno = gobj_create_yuno("req_yuno", "C_REQ_YUNO", {});
});

beforeEach(() => {
    errors = [];
    started.length = 0;
});

function make(name, kw, parent = yuno)
{
    return gobj_create(name, "C_REQ", {peer: yuno, ...kw}, parent);
}

describe("gobj_start() with SDF_REQUIRED attributes", () => {
    test("all given: started, no error", () => {
        const g = make("req_full", FULL);
        expect(gobj_start(g)).toBe(0);
        expect(gobj_is_running(g)).toBe(true);
        expect(started).toEqual(["req_full"]);
        expect(errors).toEqual([]);
        gobj_destroy(g);
    });

    test("none given: refused, one ERROR naming the empty ones, not started", () => {
        const g = gobj_create("req_none", "C_REQ", {}, yuno);
        expect(gobj_start(g)).toBe(-1);
        expect(gobj_is_running(g)).toBe(false);
        expect(started).toEqual([]);
        expect(errors.length).toBe(1);
        expect(errors[0]).toMatch(/Cannot start without all required attributes/);
        expect(errors[0]).toMatch(/"url","items","config","any","peer"/);
        expect(errors[0]).not.toMatch(/flag|count|ratio|note/);
        gobj_destroy(g);
    });

    const one_missing = [
        ["an empty string", "url", ""],
        ["an empty list", "items", []],
        ["an empty dict", "config", {}],
        ["a json null", "any", null],
        ["a json scalar (nothing usable, as empty_json() in C)", "any", 5],
        ["a null pointer", "peer", null],
    ];
    for(const [what, attr, value] of one_missing) {
        test(`${what} in "${attr}": refused`, () => {
            const g = make(`req_${attr}_${String(value)}`, FULL);
            gobj_write_attr(g, attr, value);
            errors = [];
            expect(gobj_start(g)).toBe(-1);
            expect(gobj_is_running(g)).toBe(false);
            expect(errors.length).toBe(1);
            expect(errors[0]).toMatch(new RegExp(`\\["${attr}"\\]`));
            gobj_destroy(g);
        });
    }

    test("given later, before the start: started", () => {
        const g = gobj_create("req_later", "C_REQ", {}, yuno);
        for(const [k, v] of Object.entries({...FULL, peer: yuno})) {
            gobj_write_attr(g, k, v);
        }
        expect(gobj_start(g)).toBe(0);
        expect(errors).toEqual([]);
        gobj_destroy(g);
    });

    test("gobj_start_tree(): the gobj refused, its children started, as in C", () => {
        const p = gobj_create("req_parent", "C_REQ", {}, yuno);
        const c = make("req_child", FULL, p);
        gobj_start_tree(p);
        expect(gobj_is_running(p)).toBe(false);
        expect(gobj_is_running(c)).toBe(true);
        expect(errors.length).toBe(1);
        gobj_stop_tree(c);
        gobj_destroy(p);
    });
});
