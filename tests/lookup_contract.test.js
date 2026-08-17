/***********************************************************************
 *          lookup_contract.test.js
 *
 *      What the two lookups answer when they find NOTHING: `null`, and
 *      the same `null` whatever `verbose` says.
 *
 *      This is pinned because it broke real code. Both helpers read a
 *      plain object by key, and a missing key answers `undefined` — so a
 *      caller writing the obvious
 *
 *          if(gclass_find_by_name("C_FOO") === null) { … }
 *
 *      got FALSE for a gclass that was not registered, and skipped the
 *      guard. gobj-ui had four of those, one of them the "not registered
 *      by the app" message that could therefore never print: what the
 *      operator saw instead was "can't access property jn_attrs, e is
 *      null", thrown a frame later by whoever used the gobj that
 *      gobj_create had refused to build.
 *
 *      gobj_find_service was worse than wrong, it was inconsistent: it
 *      returned `null` with verbose and `undefined` without it, so the
 *      same absent service answered a different falsy value depending on
 *      a logging flag. Handing that `undefined` to a DTP_POINTER attr
 *      logs "attr undefined" on every use.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
    SDATA_END,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_service,
    gobj_start,
    gclass_find_by_name,
    gobj_find_service,
    set_log_callback,
} from "../src/index.js";

const GCLASS_NAME = "C_LOOKUP_PROBE";

beforeAll(() => {
    /*  Quiet: the verbose paths log on purpose and this file asserts the
     *  RETURN, not the log.  */
    set_log_callback(() => {});
    gobj_start_up(null, null, null, null, null, null, null);

    /*  A gclass with no attrs still needs a table holding SDATA_END().  */
    gclass_create(GCLASS_NAME, [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);

    /*  The yuno takes the probe gclass too: "C_YUNO" is only a name until
     *  register_c_yuno() runs, and a yuno that fails to create leaves the
     *  service below with no parent — which is what made the positive
     *  control of this file fail the first time.  */
    const yuno = gobj_create_yuno("lookup_yuno", GCLASS_NAME, {});
    gobj_start(yuno);
    gobj_create_service("probe_service", GCLASS_NAME, {}, yuno);
});

describe("gclass_find_by_name", () => {
    test("answers the gclass when it is registered", () => {
        expect(gclass_find_by_name(GCLASS_NAME)).toBeTruthy();
    });

    test("answers NULL for a name it does not hold — not undefined", () => {
        expect(gclass_find_by_name("C_NOT_THERE")).toBe(null);
    });

    test("the same null with verbose", () => {
        expect(gclass_find_by_name("C_NOT_THERE", true)).toBe(null);
    });

    test("so `=== null` is a usable guard, which is how callers write it", () => {
        expect(gclass_find_by_name("C_NOT_THERE") === null).toBe(true);
        expect(gclass_find_by_name(GCLASS_NAME) === null).toBe(false);
    });
});

describe("gobj_find_service", () => {
    test("answers the service when it exists", () => {
        expect(gobj_find_service("probe_service")).toBeTruthy();
    });

    test("answers NULL for an absent service", () => {
        expect(gobj_find_service("no_such_service")).toBe(null);
    });

    test("and the SAME null with verbose — a log flag must not change the value", () => {
        expect(gobj_find_service("no_such_service", true))
            .toBe(gobj_find_service("no_such_service", false));
        expect(gobj_find_service("no_such_service", true)).toBe(null);
    });
});
