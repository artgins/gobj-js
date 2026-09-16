/***********************************************************************
 *          kwid.test.js
 *
 *      The `kwid_*` family serves ONE rule: the key of a data record
 *      is its `id`, and the rest of the record is value. A list of
 *      records carries `id` in each one; a dict of records is keyed
 *      by it, and the two shapes hold the same thing.
 *
 *      These helpers are what turn one shape into the other, and
 *      nothing covered them until now.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {
    kwid_match_id,
    kwid_collect,
    kwid_new_dict,
    kwid_new_list,
    kwid_find_one_record,
    kwid_get_ids
} from "../src/index.js";


describe("kwid_match_id", () => {
    test("no filter lets everything through", () => {
        expect(kwid_match_id(null, "a")).toBe(true);
        expect(kwid_match_id([], "a")).toBe(true);
        expect(kwid_match_id({}, "a")).toBe(true);
    });

    test("a list, a dict and a bare string all name ids", () => {
        expect(kwid_match_id(["a", "b"], "b")).toBe(true);
        expect(kwid_match_id(["a", "b"], "c")).toBe(false);
        expect(kwid_match_id({a: 1, b: 2}, "b")).toBe(true);
        expect(kwid_match_id({a: 1}, "b")).toBe(false);
        expect(kwid_match_id("a", "a")).toBe(true);
        expect(kwid_match_id("a", "b")).toBe(false);
    });
});


describe("kwid_collect", () => {
    const list = [
        {id: "a", role: "one"},
        {id: "b", role: "two"}
    ];
    const dict = {
        a: {id: "a", role: "one"},
        b: {id: "b", role: "two"}
    };

    test("collects from a list and from a dict alike", () => {
        expect(kwid_collect(null, list, null, null, null)).toHaveLength(2);
        expect(kwid_collect(null, dict, null, null, null)).toHaveLength(2);
    });

    test("filters by id and by a where", () => {
        expect(kwid_collect(null, list, "b", null, null))
            .toEqual([{id: "b", role: "two"}]);
        expect(kwid_collect(null, dict, null, {role: "one"}, null))
            .toEqual([{id: "a", role: "one"}]);
    });

    test("the LIST is new, its records are not copies", () => {
        /*  The comment used to promise clones, which javascript has no
         *  way of giving: a write through a collected row writes into
         *  the source.  */
        let out = kwid_collect(null, list, "a", null, null);
        expect(out).not.toBe(list);
        expect(out[0]).toBe(list[0]);
    });

    test("answers null for something that is neither", () => {
        expect(kwid_collect(null, null, null, null, null)).toBe(null);
    });
});


describe("kwid_find_one_record", () => {
    test("finds the first match", () => {
        const list = [{id: "a"}, {id: "b"}];
        expect(kwid_find_one_record(null, list, "b", null, null)).toEqual({id: "b"});
    });

    test("answers null when nothing matches", () => {
        expect(kwid_find_one_record(null, [{id: "a"}], "z", null, null)).toBe(null);
    });

    test("NO DATA is not a crash", () => {
        /*  kwid_collect() answers null for a kw that is not a list or a
         *  dict, and this read `list.length` off it: a TypeError thrown
         *  at the caller. One caller hands it the `data` of a command
         *  answer, which is missing exactly when the command found
         *  nothing.  */
        expect(() => kwid_find_one_record(null, undefined, null, null, null))
            .not.toThrow();
        expect(kwid_find_one_record(null, undefined, null, null, null)).toBe(null);
        expect(kwid_find_one_record(null, 42, null, null, null)).toBe(null);
        expect(kwid_find_one_record(null, "", null, null, null)).toBe(null);
    });
});


describe("kwid_new_dict", () => {
    test("a list of records becomes a dict keyed by id", () => {
        const list = [{id: "a", n: 1}, {id: "b", n: 2}];
        expect(kwid_new_dict(null, list)).toEqual({
            a: {id: "a", n: 1},
            b: {id: "b", n: 2}
        });
    });

    test("a dict comes back as itself, not as a copy", () => {
        /*  "new" is the C twin's word, where it means a new REFERENCE. */
        const dict = {a: {id: "a"}};
        expect(kwid_new_dict(null, dict)).toBe(dict);
    });

    test("reads a path when given one", () => {
        const kw = {data: [{id: "a"}]};
        expect(kwid_new_dict(null, kw, "data")).toEqual({a: {id: "a"}});
    });
});


describe("kwid_new_list", () => {
    test("a dict of records becomes a list, each keyed record carrying its id", () => {
        const dict = {a: {n: 1}, b: {n: 2}};
        expect(kwid_new_list(null, dict)).toEqual([
            {id: "a", n: 1},
            {id: "b", n: 2}
        ]);
    });

    test("the key WINS over an id that disagrees with it", () => {
        /*  The whole point of the normalizing function, and the C
         *  behaviour it is ported from: the key is the truth.  */
        const dict = {a: {id: "zzz", n: 1}};
        expect(kwid_new_list(null, dict)).toEqual([{id: "a", n: 1}]);
    });

    test("a list comes back as itself", () => {
        const list = [{id: "a"}];
        expect(kwid_new_list(null, list)).toBe(list);
    });

    test("reads a path when given one", () => {
        const kw = {data: {a: {n: 1}}};
        expect(kwid_new_list(null, kw, "data")).toEqual([{id: "a", n: 1}]);
    });

    test("anything else is an empty list and a logged error", () => {
        expect(kwid_new_list(null, 42)).toEqual([]);
        expect(kwid_new_list(null, null)).toEqual([]);
    });
});


describe("kwid_get_ids", () => {
    test("reads the ids out of every shape the rule allows", () => {
        expect(kwid_get_ids(null, "a")).toEqual(["a"]);
        expect(kwid_get_ids(null, ["a", "b"])).toEqual(["a", "b"]);
        expect(kwid_get_ids(null, {a: {}, b: {}})).toEqual(["a", "b"]);
        expect(kwid_get_ids(null, [{id: "a"}, "b"])).toEqual(["a", "b"]);
    });

    test("nothing in, nothing out", () => {
        expect(kwid_get_ids(null, null)).toEqual([]);
    });
});
