/***********************************************************************
 *          review_2026_10.test.js
 *
 *      What the review of 2026-10-10 found in the runtime, pinned:
 *
 *        - log_*() drop their arguments (printf promised, not done)
 *        - a filter on a false value (0, false, "") never matches
 *        - a number against a non-numeric string compared "equal"
 *        - a path or a flat id through "__proto__" wrote Object.prototype
 *        - DTP_JSON refused what C takes (null, a scalar)
 *        - a destroyed default service could not be built again
 *        - an action that throws lost the rest of the posted events
 *        - priv mirrored the raw value, not the one the attr holds
 *        - mt_writing / mt_child_* were looked up on the gobj, not the gclass
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
    gobj_create_default_service,
    gobj_default_service,
    gobj_find_gobj,
    gobj_destroy,
    gobj_post_event,
    gobj_posted_events_size,
    gobj_read_attr,
    gobj_write_attr,
    gobj_write_str_attr,
    gobj_write_integer_attr,
    gobj_change_parent,
    gobj_reset_volatil_attrs,
    set_log_callback,
    log_error,
    log_warning,
    kw_match_simple,
    kw_select,
    kw_set_dict_value,
    kw_get_dict,
    kw_get_dict_value,
    kw_clone_by_not_keys,
    kw_clone_by_keys,
    flat2json,
    json2flat,
    flat_apply,
    json_object_update,
    json_object_set,
} from "../src/index.js";

let logged = [];
set_log_callback((level, msg) => {
    logged.push({level, msg: String(msg)});
});

const turn = () => new Promise(resolve => setTimeout(resolve, 0));

const arrivals = [];
const writings = [];
const children = [];

function ac_note(gobj, event, kw, src)
{
    arrivals.push(kw.n);
    return 0;
}

function ac_throw(gobj, event, kw, src)
{
    throw new Error("boom");
}

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_REV_YUNO", [], [["ST_IDLE", []]], {}, null,
        [SDATA_END()], {}, null, null, null, 0);

    gclass_create(
        "C_REV_PROBE",
        [["EV_NOTE", 0], ["EV_THROW", 0]],
        [["ST_IDLE", [
            ["EV_NOTE",  ac_note,  0],
            ["EV_THROW", ac_throw, 0],
        ]]],
        {
            mt_create: (gobj) => {
                gobj.priv = {label: null, count: null, cfg: null};
            },
            mt_writing: (gobj, path) => {
                writings.push(path);
            },
            mt_child_added: (gobj, child) => {
                children.push(["added", child.gobj_name]);
            },
            mt_child_removed: (gobj, child) => {
                children.push(["removed", child.gobj_name]);
            },
        },
        null,
        [
            SDATA(data_type_t.DTP_STRING,  "label", 0, "", "a string"),
            SDATA(data_type_t.DTP_INTEGER, "count", sdata_flag_t.SDF_VOLATIL, 7, "an integer"),
            SDATA(data_type_t.DTP_JSON,    "cfg",   0, "", "any json"),
            SDATA_END()
        ],
        {}, null, null, null, 0
    );

    yuno = gobj_create_yuno("rev_yuno", "C_REV_YUNO", {});
});

beforeEach(() => {
    logged = [];
});

describe("log_*()", () => {
    test("substitute their arguments, printf style", () => {
        log_error("value %s here", "X");
        log_warning("n=%d", 42);
        expect(logged[0].msg).toBe("value X here");
        expect(logged[1].msg).toBe("n=42");
    });

    test("leave a composed message as it is, '%s' in its data included", () => {
        log_error(`a 50%s discount`);
        expect(logged[0].msg).toBe("a 50%s discount");
    });

    test("do not throw on a circular argument", () => {
        const a = {};
        a.self = a;
        expect(() => log_error("obj %o", a)).not.toThrow();
        expect(logged.length).toBe(1);
    });
});

describe("kw_match_simple()", () => {
    test("matches a false value: 0, false and the empty string", () => {
        expect(kw_match_simple({n: 0}, {n: 0})).toBe(true);
        expect(kw_match_simple({on: false}, {on: false})).toBe(true);
        expect(kw_match_simple({s: ""}, {s: ""})).toBe(true);
        expect(kw_match_simple({on: true}, {on: false})).toBe(false);
        expect(kw_match_simple({}, {n: 0})).toBe(false);
    });

    test("selects the records with a false value", () => {
        const rows = [{id: "a", online: false}, {id: "b", online: true}];
        expect(kw_select(null, rows, {online: false}).map(r => r.id)).toEqual(["a"]);
    });

    test("does not take a non-numeric string for every number", () => {
        expect(kw_match_simple({n: "abc"}, {n: 5})).toBe(false);
        expect(kw_match_simple({n: "5"}, {n: 5})).toBe(true);
    });
});

describe("a path through the prototype", () => {
    test("flat2json writes __proto__ as a key, not into Object.prototype", () => {
        const jn = flat2json(JSON.parse('{"__proto__`polluted": "yes"}'));
        expect(({}).polluted).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(jn, "__proto__")).toBe(true);
        expect(jn["__proto__"].polluted).toBe("yes");
    });

    test("kw_set_dict_value() does the same", () => {
        const kw = {};
        expect(kw_set_dict_value(null, kw, "__proto__`isAdmin", true)).toBe(0);
        expect(({}).isAdmin).toBeUndefined();
        kw_set_dict_value(null, kw, "constructor`x", 1);
        expect(kw.constructor).toEqual({x: 1});
    });

    test("a reader does not answer the prototype for a key the kw has not", () => {
        expect(kw_get_dict(null, {}, "__proto__", null, 0)).toBe(null);
        expect(kw_get_dict_value(null, {}, "constructor", undefined, 0)).toBeUndefined();
        expect(kw_get_dict_value(null, {constructor: 3}, "constructor", undefined, 0)).toBe(3);
    });
});

describe("an own '__proto__' key is copied as a key", () => {
    test("by the helpers that copy by assignment", () => {
        const src = JSON.parse('{"__proto__": {"admin": true}, "b": 1}');
        for(const out of [
            kw_clone_by_not_keys(null, src, "b"),
            kw_clone_by_keys(null, src, ["__proto__"]),
            json_object_update({}, src),
        ]) {
            expect(out.admin).toBeUndefined();
            expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
            expect(JSON.stringify(out)).toContain("__proto__");
        }
        const o = {};
        json_object_set(o, "__proto__", {admin: true});
        expect(o.admin).toBeUndefined();
    });

    test("json2flat and flat2json are symmetric on it", () => {
        const jn = JSON.parse('{"__proto__": 1, "a": 2}');
        const flat = json2flat(jn);
        expect(Object.keys(flat).sort()).toEqual(["__proto__", "a"]);
        expect(flat2json(flat)).toEqual(jn);
        const applied = flat_apply({}, {added: JSON.parse('{"__proto__": 3}'), removed: {}, changed: {}});
        expect(Object.getPrototypeOf(applied)).toBe(Object.prototype);
    });

    test("an inherited method is not a value", () => {
        expect(kw_get_dict_value(null, {}, "toString", undefined, 0)).toBeUndefined();
        expect(kw_match_simple({}, {valueOf: 0})).toBe(false);
    });
});

describe("kw_clone_by_not_keys()", () => {
    test("drops a key saved as false", () => {
        expect(kw_clone_by_not_keys(null, {dark: false, x: 1}, "dark")).toEqual({x: 1});
    });

    test("answers {} for a kw that is not there", () => {
        expect(kw_clone_by_not_keys(null, null, ["dark"])).toEqual({});
    });
});

describe("attrs", () => {
    test("DTP_JSON takes any json, as in C", () => {
        const g = gobj_create("p_json", "C_REV_PROBE", {cfg: null}, yuno);
        expect(logged.filter(l => l.level === "error")).toEqual([]);
        expect(gobj_read_attr(g, "cfg")).toBe(null);
        gobj_destroy(g);

        const g2 = gobj_create("p_json2", "C_REV_PROBE", {cfg: "hello"}, yuno);
        expect(gobj_read_attr(g2, "cfg")).toBe("hello");
        gobj_destroy(g2);

        const g3 = gobj_create("p_json3", "C_REV_PROBE", {cfg: '{"a":1}'}, yuno);
        expect(gobj_read_attr(g3, "cfg")).toEqual({a: 1});
        gobj_destroy(g3);

        /*  A string that does not encode a dict or a list stays a string.  */
        const g4 = gobj_create("p_json4", "C_REV_PROBE", {cfg: "42"}, yuno);
        expect(gobj_read_attr(g4, "cfg")).toBe("42");
        gobj_destroy(g4);
    });

    test("priv mirrors the value the attr holds", () => {
        const g = gobj_create("p_priv", "C_REV_PROBE", {}, yuno);
        gobj_write_integer_attr(g, "count", "12");
        expect(g.priv.count).toBe(12);
        gobj_reset_volatil_attrs(g);
        expect(g.priv.count).toBe(7);
        gobj_write_str_attr(g, "label", 5);
        expect(g.priv.label).toBe("5");
        gobj_destroy(g);
    });

    test("a write through a path reaches the gclass's mt_writing", () => {
        const parent = gobj_create("p_parent", "C_REV_PROBE", {}, yuno);
        gobj_create("p_kid", "C_REV_PROBE", {}, parent);
        writings.length = 0;
        expect(gobj_write_attr(parent, "p_kid`label", "z")).toBe(0);
        expect(writings).toEqual(["label"]);
        gobj_destroy(parent);
    });

    test("gobj_change_parent() tells both parents", () => {
        const a = gobj_create("p_a", "C_REV_PROBE", {}, yuno);
        const b = gobj_create("p_b", "C_REV_PROBE", {}, yuno);
        const kid = gobj_create("p_moved", "C_REV_PROBE", {}, a);
        children.length = 0;
        gobj_change_parent(kid, b);
        expect(children).toEqual([["removed", "p_moved"], ["added", "p_moved"]]);
        gobj_destroy(a);
        gobj_destroy(b);
    });
});

describe("the default service", () => {
    test("can be built again once destroyed", () => {
        const s1 = gobj_create_default_service("svc1", "C_REV_PROBE", {}, yuno);
        expect(gobj_default_service()).toBe(s1);
        gobj_destroy(s1);
        expect(gobj_find_gobj(null, "__default_service__")).toBe(null);

        const s2 = gobj_create_default_service("svc2", "C_REV_PROBE", {}, yuno);
        expect(s2).not.toBe(null);
        expect(gobj_default_service()).toBe(s2);
        gobj_destroy(s2);
    });
});

describe("an action that throws", () => {
    test("loses none of the events posted after it", async () => {
        const g = gobj_create("p_post", "C_REV_PROBE", {}, yuno);
        arrivals.length = 0;
        gobj_post_event(g, "EV_NOTE", {n: 1}, g);
        gobj_post_event(g, "EV_THROW", {}, g);
        gobj_post_event(g, "EV_NOTE", {n: 2}, g);
        gobj_post_event(g, "EV_NOTE", {n: 3}, g);

        /*  The drain runs from a setTimeout: its throw would be an
         *  uncaught exception of the test run, so drain it by hand.  */
        const { gobj_deliver_posted_events } = await import("../src/index.js");
        expect(() => gobj_deliver_posted_events()).toThrow("boom");
        expect(arrivals).toEqual([1]);
        expect(gobj_posted_events_size()).toBe(2);
        expect(logged.some(l => l.level === "error" && l.msg.includes("THREW"))).toBe(true);

        gobj_deliver_posted_events();
        expect(arrivals).toEqual([1, 2, 3]);
        await turn();
        gobj_destroy(g);
    });
});

/*
 *  Second check of the review (V2).
 */
describe("V2: own keys when copying, list paths, children lists", () => {
    test("flat_diff + flat_apply carry a __proto__ key there and back", async () => {
        const { json2flat, flat_diff, flat_apply } = await import("../src/helpers.js");
        const b = JSON.parse('{"__proto__": 5, "a": 1}');
        const diff = flat_diff({}, json2flat(b));
        expect(Object.keys(diff.added).sort()).toEqual(["__proto__", "a"]);
        const flat = flat_apply({}, diff);
        expect(Object.prototype.hasOwnProperty.call(flat, "__proto__")).toBe(true);
        expect(Object.getPrototypeOf(flat)).toBe(Object.prototype);
    });

    test("kwid_new_dict and kw_set_subdict_value write own keys", async () => {
        const { kwid_new_dict, kw_set_subdict_value } = await import("../src/helpers.js");
        const d = kwid_new_dict(null, [{id: "__proto__", v: 1}]);
        expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
        expect(d["__proto__"]).toEqual({id: "__proto__", v: 1});
        const kw = {};
        kw_set_subdict_value(null, kw, "sub", "__proto__", {x: 1});
        expect(Object.getPrototypeOf(kw.sub)).toBe(Object.prototype);
        expect(kw.sub.x).toBeUndefined();
    });

    test("duplicate_objects keeps a parsed __proto__ as a key", async () => {
        const { duplicate_objects } = await import("../src/helpers.js");
        const r = duplicate_objects(JSON.parse('{"__proto__": {"polluted": 1}}'));
        expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
        expect(r.polluted).toBeUndefined();
    });

    test("kw_find_path walks a list by index only", async () => {
        const { kw_find_path } = await import("../src/helpers.js");
        expect(kw_find_path(null, {a: [1, 2]}, "a`length", false)).toBeUndefined();
        expect(kw_find_path(null, {a: [1, 2]}, "a`1", false)).toBe(2);
        expect(kw_find_path(null, {a: [1, 2]}, "a`01", false)).toBe(2);   // atoi, as C
    });

});

/*
 *  Third check of the review (V3).
 */
describe("V3: path writers walk a list by index, as the reader", () => {
    test("kw_set_dict_value refuses a segment that is not an index of its list", async () => {
        const { kw_set_dict_value } = await import("../src/helpers.js");
        const kw = {a: [1, 2]};
        expect(kw_set_dict_value(null, kw, "a`length", 0)).toBe(-1);
        expect(kw.a).toEqual([1, 2]);
        expect(kw_set_dict_value(null, kw, "a`5", 0)).toBe(-1);
        expect(kw.a).toEqual([1, 2]);
        expect(kw_set_dict_value(null, kw, "a`01", 9)).toBe(0);    // atoi, as C
        expect(kw.a).toEqual([1, 9]);
        expect(Object.keys(kw.a)).toEqual(["0", "1"]);
    });

    test("kw_delete of a list item is refused, and does not throw", async () => {
        const { kw_delete } = await import("../src/helpers.js");
        const kw = {a: [1, 2]};
        expect(kw_delete(null, kw, "a`length")).toBe(-1);
        expect(kw_delete(null, kw, "a`0")).toBe(-1);
        expect(kw.a).toEqual([1, 2]);
    });

    test("jdb_update merges own keys: a parsed __proto__ is not the record's prototype", async () => {
        const { jdb_update } = await import("../src/helpers.js");
        const rec = {id: "x", v: 1};
        const jdb = {hook: "data", topics: {items: rec}};
        jdb_update(jdb, "items", "", JSON.parse('{"id": "x", "__proto__": {"admin": true}}'));
        expect(Object.getPrototypeOf(rec)).toBe(Object.prototype);
        expect(rec.admin).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(rec, "__proto__")).toBe(true);
    });
});


describe("V3: create_template_record writes own keys", () => {
    test("a parsed template with an own __proto__ does not set the record's prototype", async () => {
        const { create_template_record } = await import("../src/lib_treedb.js");
        const template = JSON.parse('{"id": "string", "__proto__": {"default": {"admin": true}}}');
        const rec = create_template_record(template, {id: "x"});
        expect(Object.getPrototypeOf(rec)).toBe(Object.prototype);
        expect(rec.admin).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(rec, "__proto__")).toBe(true);
        expect(JSON.parse(JSON.stringify(rec))).toHaveProperty("id", "x");
    });
});

describe("V4: kw_delete as C", () => {
    test("a missing key or parent, and a top-level list, are -1 and do not throw", async () => {
        const { kw_delete } = await import("../src/helpers.js");
        expect(kw_delete(null, {a: 1}, "b")).toBe(-1);
        expect(kw_delete(null, {a: {}}, "x`y")).toBe(-1);
        expect(kw_delete(null, [1, 2], "length")).toBe(-1);
        const kw = {a: 1, b: {c: 2}};
        expect(kw_delete(null, kw, "a")).toBe(0);
        expect(kw_delete(null, kw, "b`c")).toBe(0);
        expect(kw).toEqual({b: {}});
    });
});

