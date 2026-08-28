/***********************************************************************
 *          json_flat.test.js
 *
 *      The flat form of a json: one row per leaf, the id being the
 *      path of the item.
 *
 *      IT MUST AGREE WITH THE C SIDE, id by id. A flat json is written
 *      by one and read by the other -- the SPA saves what a node
 *      answered, a node applies what the SPA sends -- so the grammar
 *      cannot drift: the ids pinned here are the same ones pinned in
 *      tests/c/kw/test_json_flat.c.
 *
 *      Most of the list is what the FIRST C implementation got wrong,
 *      measured before rewriting it: a dict keyed "1630" came back as an
 *      array of 1631 elements, every empty container vanished, and any
 *      key holding a backtick was split in two.
 ***********************************************************************/
import { describe, test, expect } from "vitest";

import {
    json2flat,
    flat2json,
    flat_key_join,
    flat_key_split,
    flat_diff,
    flat_apply,
} from "../src/helpers.js";


describe("json2flat / flat2json: it comes back the same", () => {
    const cases = [
        ["nested object",       {a: {b: 1}, c: "x"},        {"a`b": 1, "c": "x"}],
        ["array of scalars",    {a: [1, 2, 3]},             {"a`[0]": 1, "a`[1]": 2, "a`[2]": 3}],
        ["array of objects",    {a: [{b: 1}, {b: 2}]},      {"a`[0]`b": 1, "a`[1]`b": 2}],
        ["array root",          [{a: 1}, {a: 2}],           {"[0]`a": 1, "[1]`a": 2}],
        ["array of arrays",     {m: [[1, 2], [3]]},         {"m`[0]`[0]": 1, "m`[0]`[1]": 2, "m`[1]`[0]": 3}],
        ["every scalar kind",   {s: "x", i: -3, r: 1.5, t: true, f: false, n: null}, null],

        /*  The one that broke the first implementation: a dict keyed by a
         *  yuno id. */
        ["numeric key (a yuno id)", {"1630": {role: "db_history_co"}}, {"1630`role": "db_history_co"}],
        ["numeric keys, several",   {"1620": 1, "1630": 2, "0": 3},    {"1620": 1, "1630": 2, "0": 3}],

        /*  An empty container has no leaves, so it IS a leaf. */
        ["empty object",        {a: {}, b: 1},              {"a": {}, "b": 1}],
        ["empty array",         {a: [], b: 1},              {"a": [], "b": 1}],
        ["empty deep",          {a: {b: {}}},               {"a`b": {}}],
        ["empty inside array",  {a: [{}, []]},              {"a`[0]": {}, "a`[1]": []}],

        /*  Escapes. */
        ["key with a backtick", {"a`b": 1},                 {"a``b": 1}],
        ["key of only backticks", {"`": 1},                 {"``": 1}],
        ["key that looks like an index", {"[0]": 1},        {"[[0]": 1}],
        ["key starting with a bracket",  {"[x": 1},         {"[[x": 1}],
        ["empty key",           {a: {"": 1}},               {"a`": 1}],
        ["empty key at the root", {"": 1},                  {"": 1}],
        ["key with a dot",      {"a.b": {c: 1}},            {"a.b`c": 1}],
    ];

    for(const [title, nested, expected_flat] of cases) {
        test(title, () => {
            const flat = json2flat(nested);
            if(expected_flat) {
                expect(flat).toEqual(expected_flat);
            }
            expect(flat2json(flat)).toEqual(nested);
        });
    }

    test("a treedb-ish schema, empties and all", () => {
        const schema = {
            topics: [{
                id: "device_groups",
                cols: {id: {flag: ["persistent", "required"]}, properties: {}}
            }],
            schema_version: 8
        };
        const flat = json2flat(schema);
        expect(flat["topics`[0]`cols`properties"]).toEqual({});
        expect(flat["topics`[0]`cols`id`flag`[1]"]).toBe("required");
        expect(flat2json(flat)).toEqual(schema);
    });
});


describe("flat2json refuses instead of guessing", () => {
    /*  The same id as a leaf and as a container: the nested result would
     *  depend on which key came first. */
    test("leaf then container", () => {
        expect(() => flat2json({"a": 1, "a`b": 2})).toThrow(/leaf and a container/);
    });
    test("container then leaf", () => {
        expect(() => flat2json({"a`b": 2, "a": 1})).toThrow(/written twice/);
    });
    test("object and array at once", () => {
        expect(() => flat2json({"a`b": 1, "a`[0]": 2})).toThrow(/already has a object/);
    });
    test("array and object at once", () => {
        expect(() => flat2json({"a`[0]": 1, "a`b": 2})).toThrow(/already has a array/);
    });
    test("both kinds of root", () => {
        expect(() => flat2json({"[0]": 1, "a": 2})).toThrow(/does not fit a array root/);
    });
    /*  One id must not materialise a million nulls. */
    test("index over the limit", () => {
        expect(() => flat2json({"a`[999999]": 1})).toThrow(/over the limit/);
    });
    test("not an object at all", () => {
        expect(() => flat2json([1, 2])).toThrow(/object of id -> value/);
    });
    /*  '[00]' is not a second spelling of '[0]'. */
    test("index with a leading zero", () => {
        expect(() => flat2json({"a`[0]": 1, "a`[00]": 2})).toThrow();
    });
});


describe("holes", () => {
    test("a hole inside an array is a null", () => {
        expect(flat2json({"a`[0]": 1, "a`[2]": 3})).toEqual({a: [1, null, 3]});
    });
});


describe("flat_key_join / flat_key_split", () => {
    test("a string is a key, a number is an index", () => {
        const segs = ["a", 0, "b`c", "[x"];
        const key = flat_key_join(segs);
        expect(key).toBe("a`[0]`b``c`[[x");
        expect(flat_key_split(key)).toEqual(segs);
    });

    test("a key that looks like an index survives as a key", () => {
        const key = flat_key_join(["[0]"]);
        expect(key).toBe("[[0]");
        expect(flat_key_split(key)).toEqual(["[0]"]);
    });

    test("and an index is a number, not the string '[0]'", () => {
        expect(flat_key_split("a`[0]")).toEqual(["a", 0]);
    });
});


describe("flat_diff / flat_apply", () => {
    const a = json2flat({cfg: {port: 2020, host: "old"}, list: [1, 2]});
    const b = json2flat({cfg: {port: 2020, host: "new"}, list: [1, 2, 3]});

    test("the diff names what changed and what was added", () => {
        const diff = flat_diff(a, b);
        expect(Object.keys(diff.changed)).toEqual(["cfg`host"]);
        expect(diff.changed["cfg`host"]).toEqual({from: "old", to: "new"});
        expect(Object.keys(diff.added)).toEqual(["list`[2]"]);
        expect(Object.keys(diff.removed)).toEqual([]);
    });

    test("applying it lands exactly on the target", () => {
        const work = json2flat({cfg: {port: 2020, host: "old"}, list: [1, 2]});
        flat_apply(work, flat_diff(a, b));
        expect(work).toEqual(b);
        expect(flat2json(work)).toEqual({cfg: {port: 2020, host: "new"}, list: [1, 2, 3]});
    });

    test("a removal removes", () => {
        const c = json2flat({x: 1, y: 2});
        const d = json2flat({x: 1});
        flat_apply(c, flat_diff(c, d));
        expect(c).toEqual(d);
    });

    test("an empty container that becomes filled is a change, not silence", () => {
        const before = json2flat({props: {}});
        const after  = json2flat({props: {a: 1}});
        const diff = flat_diff(before, after);
        expect(Object.keys(diff.removed)).toEqual(["props"]);
        expect(Object.keys(diff.added)).toEqual(["props`a"]);
    });
});
