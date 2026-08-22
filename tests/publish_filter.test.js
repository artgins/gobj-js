/***********************************************************************
 *          publish_filter.test.js
 *
 *      `__filter__` on a subscription decides who gets the event.
 *
 *      It had never decided anything in this runtime:
 *      `kw_match_simple()` answers a BOOLEAN and the guard compared it
 *      with `topublish === 0` — and `false === 0` is FALSE — so a
 *      subscription whose filter did not match was published to anyway.
 *      The machine trace printed 👎 on the line right above the delivery.
 *
 *      What it cost, in the app where it was found: one host subscribed
 *      to the same event once per topic of a treedb, so ONE delete
 *      arrived five times and four of them looked for a row in the wrong
 *      table and logged an error.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
    gobj_play,
    gobj_is_playing,
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gobj_start_up,
    gobj_create_yuno,
    gobj_create,
    gobj_start,
    gobj_destroy,
    gobj_subscribe_event,
    gobj_publish_event,
    event_flag_t,
} from "../src/index.js";

const arrivals = [];

const yuno_attrs = [
SDATA(data_type_t.DTP_BOOLEAN, "trace_creation",   0, 0, "trace create/delete"),
SDATA(data_type_t.DTP_BOOLEAN, "trace_start_stop", 0, 0, "trace start/stop"),
SDATA_END()
];

function ac_note(gobj, event, kw, src)
{
    arrivals.push(kw ? kw.topic_name : undefined);
    return 0;
}

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_YUNO2", [], [["ST_IDLE", []]], {}, null,
        yuno_attrs, {}, null, null, null, 0);
    gclass_create(
        "C_TEST_PUB",
        [["EV_NODE_DELETED", event_flag_t.EVF_OUTPUT_EVENT]],
        [["ST_IDLE", []]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    gclass_create(
        "C_TEST_SUB",
        [["EV_NODE_DELETED", 0]],
        [["ST_IDLE", [["EV_NODE_DELETED", ac_note, 0]]]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    yuno = gobj_create_yuno("test_yuno_filter", "C_TEST_YUNO2", {});
});

describe("__filter__ on a subscription", () => {
    test("one subscription per topic: only the matching one is published to", () => {
        arrivals.length = 0;
        const pub = gobj_create("pub", "C_TEST_PUB", {}, yuno);
        const sub = gobj_create("sub", "C_TEST_SUB", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        for(const topic of ["snaps", "roles", "users", "accesses"]) {
            gobj_subscribe_event(pub, "EV_NODE_DELETED",
                {__filter__: {treedb_name: "db", topic_name: topic}}, sub);
        }

        gobj_publish_event(pub, "EV_NODE_DELETED",
            {treedb_name: "db", topic_name: "users", node: {id: "x"}});

        expect(arrivals).toEqual(["users"]);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("a filter that matches nothing publishes to nobody", () => {
        arrivals.length = 0;
        const pub = gobj_create("pub2", "C_TEST_PUB", {}, yuno);
        const sub = gobj_create("sub2", "C_TEST_SUB", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_NODE_DELETED",
            {__filter__: {topic_name: "roles"}}, sub);

        gobj_publish_event(pub, "EV_NODE_DELETED", {topic_name: "users"});

        expect(arrivals).toEqual([]);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("no filter still publishes to everyone", () => {
        arrivals.length = 0;
        const pub = gobj_create("pub3", "C_TEST_PUB", {}, yuno);
        const sub = gobj_create("sub3", "C_TEST_SUB", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_NODE_DELETED", {}, sub);
        gobj_publish_event(pub, "EV_NODE_DELETED", {topic_name: "anything"});

        expect(arrivals).toEqual(["anything"]);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });
});

describe("the hooks that answer with a number in C and a boolean here", () => {
    test("mt_publication_pre_filter answering false does not publish", () => {
        arrivals.length = 0;
        gclass_create(
            "C_TEST_PREFILTER",
            [["EV_NODE_DELETED", event_flag_t.EVF_OUTPUT_EVENT]],
            [["ST_IDLE", []]],
            {mt_publication_pre_filter: () => false},
            null, [SDATA_END()], {}, null, null, null, 0
        );
        const pub = gobj_create("pub4", "C_TEST_PREFILTER", {}, yuno);
        const sub = gobj_create("sub4", "C_TEST_SUB", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_NODE_DELETED", {}, sub);
        gobj_publish_event(pub, "EV_NODE_DELETED", {topic_name: "users"});

        expect(arrivals).toEqual([]);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("mt_play answering false leaves the gobj NOT playing", () => {
        gclass_create(
            "C_TEST_PLAY",
            [], [["ST_IDLE", []]],
            {mt_play: () => false},
            null, [SDATA_END()], {}, null, null, null, 0
        );
        const gobj = gobj_create("player", "C_TEST_PLAY", {}, yuno);
        gobj_start(gobj);
        gobj_play(gobj);

        expect(gobj_is_playing(gobj)).toBe(false);

        gobj_destroy(gobj);
    });
});
