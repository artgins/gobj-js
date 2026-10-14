/***********************************************************************
 *          walk_destroyed.test.js
 *
 *      A walk of the tree whose callback destroys a gobj that the walk
 *      has not reached yet, or one it has passed.
 *
 *      The walks went over a COPY of each child list, so a child that an
 *      earlier callback had destroyed was still handed to the callback:
 *      gobj_start_tree() then started a destroyed gobj, and said
 *      "gobj NULL or DESTROYED". And the top list was the LIVE one,
 *      walked by index, so a callback that destroyed a child already
 *      passed moved the next one under the index: it was never visited,
 *      and gobj_start_tree() left it stopped. The C walk follows the live
 *      list and steps over a gobj that is gone; so does this one now.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
    SDATA_END,
    walk_type_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_start_tree,
    gobj_stop_tree,
    gobj_stop,
    gobj_destroy,
    gobj_is_running,
    gobj_is_destroying,
    gobj_walk_gobj_children_tree,
    gobj_name,
    set_log_callback,
} from "../src/index.js";

let errors = [];
set_log_callback((level, msg) => {
    if(level === "error") {
        errors.push(String(msg));
    }
});

/*  What a gobj does in its mt_start / mt_stop, by name  */
const on_start = new Map();
const on_stop = new Map();
const gmt = {
    mt_start: (gobj) => {
        const fn = on_start.get(gobj_name(gobj));
        if(fn) {
            fn();
        }
        return 0;
    },
    mt_stop: (gobj) => {
        const fn = on_stop.get(gobj_name(gobj));
        if(fn) {
            fn();
        }
        return 0;
    },
};

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_WALK_YUNO", [], [["ST_IDLE", []]], {}, null,
        [SDATA_END()], {}, null, null, null, 0);
    gclass_create("C_WALK_NODE", [], [["ST_IDLE", []]], gmt, null,
        [SDATA_END()], {}, null, null, null, 0);
    yuno = gobj_create_yuno("walk_yuno", "C_WALK_YUNO", {});
});

beforeEach(() => {
    errors = [];
    on_start.clear();
    on_stop.clear();
});

function node(name, parent)
{
    return gobj_create(name, "C_WALK_NODE", {}, parent);
}

describe("gobj_start_tree()", () => {
    test("a child destroyed by an earlier start is not started", () => {
        const root = node("r1", yuno);
        const p = node("r1_p", root);
        node("r1_a", p);
        const b = node("r1_b", p);
        node("r1_b_child", b);
        on_start.set("r1_a", () => gobj_destroy(b));

        gobj_start_tree(root);
        expect(gobj_is_destroying(b)).toBe(true);
        expect(errors).toEqual([]);
        gobj_destroy(root);
    });

    test("a child destroyed behind the walk does not hide the next one", () => {
        const root = node("r2", yuno);
        const z = node("r2_z", root);
        node("r2_a", root);
        const c = node("r2_c", root);
        const c_child = node("r2_c_child", c);
        on_start.set("r2_a", () => {
            gobj_stop(z);
            gobj_destroy(z);
        });

        gobj_start_tree(root);
        expect(gobj_is_running(c)).toBe(true);
        expect(gobj_is_running(c_child)).toBe(true);
        expect(errors).toEqual([]);
        gobj_stop_tree(root);
        gobj_destroy(root);
    });
});

describe("gobj_stop_tree()", () => {
    test("a child destroyed behind the walk does not hide the next one", () => {
        const root = node("r3", yuno);
        const z = node("r3_z", root);
        node("r3_a", root);
        const c = node("r3_c", root);
        gobj_start_tree(root);
        on_stop.set("r3_a", () => gobj_destroy(z));

        gobj_stop_tree(root);
        expect(gobj_is_running(c)).toBe(false);
        expect(errors).toEqual([]);
        gobj_destroy(root);
    });
});

describe("gobj_walk_gobj_children_tree()", () => {
    const walks = [
        ["top to bottom", walk_type_t.WALK_TOP2BOTTOM],
        ["bottom to top", walk_type_t.WALK_BOTTOM2TOP],
        ["by level", walk_type_t.WALK_BYLEVEL | walk_type_t.WALK_FIRST2LAST],
        ["by level backwards", walk_type_t.WALK_BYLEVEL | walk_type_t.WALK_LAST2FIRST],
    ];
    for(const [what, walk_type] of walks) {
        for(const nested of [false, true]) {
            test(`${what}${nested? ", one level down" : ""}: ` +
                    "never hands the callback a destroyed gobj, nor skips a live one", () => {
                const tag = `w${nested? "n" : ""}_${walk_type}`;
                const root = node(tag, yuno);
                const top = nested? node(`${tag}_mid`, root) : root;
                const kids = [];
                for(let i = 0; i < 4; i++) {
                    const k = node(`${tag}_${i}`, top);
                    kids.push(k);
                    for(let j = 0; j < 2; j++) {
                        node(`${tag}_${i}_${j}`, k);
                    }
                }
                const seen = [];
                const handed_destroyed = [];
                let destroyed = false;
                gobj_walk_gobj_children_tree(root, walk_type, (child) => {
                    if(gobj_is_destroying(child)) {
                        handed_destroyed.push(gobj_name(child));
                        return 0;
                    }
                    seen.push(gobj_name(child));
                    if(!destroyed && gobj_name(child) === `${tag}_2_0`) {
                        destroyed = true;
                        gobj_destroy(kids[1]);  // a branch the walk may have passed or not
                        gobj_destroy(kids[3]);
                    }
                    return 0;
                });
                expect(handed_destroyed).toEqual([]);
                for(const name of [`${tag}_0`, `${tag}_0_0`, `${tag}_0_1`,
                        `${tag}_2`, `${tag}_2_0`, `${tag}_2_1`]) {
                    expect(seen).toContain(name);
                }
                expect(seen.length).toBe(new Set(seen).size);
                expect(errors).toEqual([]);
                gobj_destroy(root);
            });
        }
    }
});
