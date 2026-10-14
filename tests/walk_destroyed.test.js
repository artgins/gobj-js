/***********************************************************************
 *          walk_destroyed.test.js
 *
 *      A walk of the tree whose callback destroys a gobj that the walk
 *      has not reached yet, or one it has passed; or moves one with
 *      gobj_change_parent().
 *
 *      The walks went over a COPY of each child list below the top, so a
 *      child that an earlier callback had destroyed was still handed to
 *      the callback of gobj_walk_gobj_children_tree() (gobj_start_tree()
 *      did not start it: gobj_is_disabled() answers true for a destroyed
 *      gobj). And the top list was the LIVE one, walked by index, so a
 *      callback that destroyed a child already passed moved the next one
 *      under the index: it was never visited, and gobj_start_tree() left
 *      it stopped. The C walk follows the live list and steps over a gobj
 *      that is gone; so does this one (gobj-js 7.26.27).
 *
 *      Every list copied, a gobj MOVED away from it was handed there and
 *      again under its new parent (7.26.27). A gobj whose parent is no
 *      longer the owner of the list is stepped over now, and no gobj is
 *      handed twice in one walk (gobj-js 7.26.28).
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
    gobj_walk_gobj_children,
    gobj_change_parent,
    gobj_parent,
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

/*
 *  A gobj that a callback MOVES with gobj_change_parent() is no longer in
 *  the list the walk copied: it was visited there AND under its new
 *  parent (7.26.27). A walk steps over a gobj whose parent is no longer
 *  the owner of the list, as it steps over a destroyed one.
 */
describe("a gobj moved by a callback during the walk", () => {
    function family(tag)
    {
        const root = node(tag, yuno);
        const c1 = node(`${tag}_c1`, root);
        node(`${tag}_g1`, c1);
        const c2 = node(`${tag}_c2`, root);
        node(`${tag}_g2`, c2);
        const c3 = node(`${tag}_c3`, root);
        return {root, c1, c2, c3};
    }

    function short(names, tag)
    {
        return names.map(n => n.slice(tag.length + 1));
    }

    test("top to bottom: visited once, under its new parent", () => {
        const tag = "mv_t2b";
        const {root, c2, c3} = family(tag);
        const seen = [];
        gobj_walk_gobj_children_tree(root, walk_type_t.WALK_TOP2BOTTOM, (child) => {
            seen.push(gobj_name(child));
            if(gobj_name(child) === `${tag}_c1`) {
                gobj_change_parent(c2, c3);
            }
            return 0;
        });
        expect(short(seen, tag)).toEqual(["c1", "g1", "c3", "c2", "g2"]);
        expect(errors).toEqual([]);
        gobj_destroy(root);
    });

    test("moved to a branch already walked: not visited again", () => {
        const tag = "mv_back";
        const {root, c1, c3} = family(tag);
        const seen = [];
        gobj_walk_gobj_children_tree(root, walk_type_t.WALK_TOP2BOTTOM, (child) => {
            seen.push(gobj_name(child));
            if(gobj_name(child) === `${tag}_c2`) {
                gobj_change_parent(c3, c1);
            }
            return 0;
        });
        expect(short(seen, tag)).toEqual(["c1", "g1", "c2", "g2"]);
        gobj_destroy(root);
    });

    test("moved away and back to the same parent: visited once", () => {
        const tag = "mv_round";
        const {root, c2, c3} = family(tag);
        const seen = [];
        gobj_walk_gobj_children_tree(root, walk_type_t.WALK_TOP2BOTTOM, (child) => {
            seen.push(gobj_name(child));
            if(gobj_name(child) === `${tag}_c1`) {
                gobj_change_parent(c2, c3);
                gobj_change_parent(c2, root);
            }
            return 0;
        });
        expect(short(seen, tag)).toEqual(["c1", "g1", "c2", "g2", "c3"]);
        expect(gobj_parent(c2)).toBe(root);
        gobj_destroy(root);
    });

    const walks = [
        ["bottom to top", walk_type_t.WALK_BOTTOM2TOP, "c3", ["c3", "g2", "c2", "g1", "c1"]],
        ["by level", walk_type_t.WALK_BYLEVEL | walk_type_t.WALK_FIRST2LAST, "c1",
            ["c1", "c3", "g1", "c2", "g2"]],
        ["by level backwards", walk_type_t.WALK_BYLEVEL | walk_type_t.WALK_LAST2FIRST, "c3",
            ["c3", "c1", "c2", "g1", "g2"]],
    ];
    for(const [what, walk_type, mover, expected] of walks) {
        test(`${what}: no gobj visited twice`, () => {
            const tag = `mv_${walk_type}`;
            const {root, c1, c2, c3} = family(tag);
            const dst = (mover === "c3")? c1 : c3;
            const seen = [];
            gobj_walk_gobj_children_tree(root, walk_type, (child) => {
                seen.push(gobj_name(child));
                if(gobj_name(child) === `${tag}_${mover}`) {
                    gobj_change_parent(c2, dst);
                }
                return 0;
            });
            expect(short(seen, tag)).toEqual(expected);
            expect(seen.length).toBe(new Set(seen).size);
            gobj_destroy(root);
        });
    }

    /*
     *  A gobj moved AHEAD of the walk once it was handed (by its own
     *  callback, or by the walk of its children) is not handed again
     *  where it lands, and neither are its children.
     */
    const ahead = [
        ["top to bottom", walk_type_t.WALK_TOP2BOTTOM, "c1", "c1", "c3",
            ["c1", "g1", "c2", "g2", "c3"]],
        ["bottom to top", walk_type_t.WALK_BOTTOM2TOP, "g2", "c2", "c1",
            ["c3", "g2", "c2", "g1", "c1"]],
        ["by level", walk_type_t.WALK_BYLEVEL | walk_type_t.WALK_FIRST2LAST, "c1", "c1", "c3",
            ["c1", "c2", "c3", "g1", "g2"]],
    ];
    for(const [what, walk_type, mover, moved, dst, expected] of ahead) {
        test(`${what}: a gobj moved ahead after it was handed is not handed again`, () => {
            const tag = `mva_${walk_type}`;
            const f = family(tag);
            const seen = [];
            gobj_walk_gobj_children_tree(f.root, walk_type, (child) => {
                seen.push(gobj_name(child));
                if(gobj_name(child) === `${tag}_${mover}`) {
                    gobj_change_parent(f[moved], f[dst]);
                }
                return 0;
            });
            expect(short(seen, tag)).toEqual(expected);
            gobj_destroy(f.root);
        });
    }

    test("gobj_walk_gobj_children(): a child moved away is not visited", () => {
        const tag = "mv_list";
        const {root, c2, c3} = family(tag);
        const seen = [];
        gobj_walk_gobj_children(root, walk_type_t.WALK_FIRST2LAST, (child) => {
            seen.push(gobj_name(child));
            if(gobj_name(child) === `${tag}_c1`) {
                gobj_change_parent(c2, c3);
            }
            return 0;
        });
        expect(short(seen, tag)).toEqual(["c1", "c3"]);
        gobj_destroy(root);
    });
});
