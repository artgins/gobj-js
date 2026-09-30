/***********************************************************************
 *          subscription_repeat.test.js
 *
 *      Which subscription is a REPEAT of another, and which one a
 *      withdrawal removes.
 *
 *      `_create_subscription()` takes `__own_event__` and
 *      `__hard_subscription__` out of the stored `__config__` (they become
 *      `subs_flag`), and the kw that looked for a repeat was compared as it
 *      came, keys included. Up to gobj-js 7.25.8 the same kw therefore
 *      matched nothing: a repeated `__own_event__` subscription was a
 *      second one (the subscriber got every event twice), and the
 *      withdrawal with the same kw found nothing and left it there. The C
 *      kernel had the same fault up to 7.25.4.
 *
 *      What stays in the stored `__config__` is still part of what a
 *      subscription IS: this runtime does not rename events, so
 *      `__rename_event_name__` stays there, and two subscriptions that
 *      differ in it are two, as they are in C.
 ***********************************************************************/
import { describe, test, expect, beforeAll } from "vitest";
import {
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
    gobj_unsubscribe_event,
    gobj_unsubscribe_list,
    gobj_find_subscriptions,
    gobj_publish_event,
    event_flag_t,
} from "../src/index.js";

let received = 0;

const yuno_attrs = [
SDATA(data_type_t.DTP_BOOLEAN, "trace_creation",   0, 0, "trace create/delete"),
SDATA(data_type_t.DTP_BOOLEAN, "trace_start_stop", 0, 0, "trace start/stop"),
SDATA_END()
];

function ac_note(gobj, event, kw, src)
{
    received++;
    return 0;
}

let yuno = null;
let pub = null;
let sub = null;

function count()
{
    return gobj_find_subscriptions(pub, "EV_ON_MESSAGE", {}, sub).length;
}

function renamed(event_name)
{
    return {__config__: {__rename_event_name__: event_name}};
}

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_YUNO_REPEAT", [], [["ST_IDLE", []]], {}, null,
        yuno_attrs, {}, null, null, null, 0);
    gclass_create(
        "C_TEST_PUB_REPEAT",
        [["EV_ON_MESSAGE", event_flag_t.EVF_OUTPUT_EVENT]],
        [["ST_IDLE", []]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    gclass_create(
        "C_TEST_SUB_REPEAT",
        [["EV_ON_MESSAGE", 0]],
        [["ST_IDLE", [["EV_ON_MESSAGE", ac_note, 0]]]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    yuno = gobj_create_yuno("test_yuno_repeat", "C_TEST_YUNO_REPEAT", {});
});

describe("a repeated subscription", () => {
    test("__own_event__ repeated is one, and the same kw withdraws it", () => {
        pub = gobj_create("pub1", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub1", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        const kw_own = {__config__: {__own_event__: true}};
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", kw_own, sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", kw_own, sub);
        expect(count()).toBe(1);

        received = 0;
        gobj_publish_event(pub, "EV_ON_MESSAGE", {});
        expect(received).toBe(1);

        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", kw_own, sub);
        expect(count()).toBe(0);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("__hard_subscription__ repeated is one, and only force removes it", () => {
        pub = gobj_create("pub2", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub2", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        const kw_hard = {__config__: {__hard_subscription__: true}};
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", kw_hard, sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", kw_hard, sub);
        expect(count()).toBe(1);

        received = 0;
        gobj_publish_event(pub, "EV_ON_MESSAGE", {});
        expect(received).toBe(1);

        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", kw_hard, sub);
        expect(count()).toBe(1);

        gobj_unsubscribe_list(pub, gobj_find_subscriptions(pub, "EV_ON_MESSAGE", {}, sub), true);
        expect(count()).toBe(0);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("a renamed subscription does not replace the plain one", () => {
        pub = gobj_create("pub3", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub3", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        expect(count()).toBe(2);

        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        expect(count()).toBe(1);
        expect(gobj_find_subscriptions(pub, "EV_ON_MESSAGE", {}, sub)[0].__config__)
            .toBeFalsy();

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("two renames of one event are two, and each withdraws its own", () => {
        pub = gobj_create("pub4", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub4", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_B"), sub);
        expect(count()).toBe(2);

        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        expect(count()).toBe(1);
        expect(gobj_find_subscriptions(pub, "EV_ON_MESSAGE", renamed("EV_B"), sub).length)
            .toBe(1);

        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_B"), sub);
        expect(count()).toBe(0);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("a renamed __own_event__ subscription repeated is one", () => {
        pub = gobj_create("pub5", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub5", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        const kw = {__config__: {__rename_event_name__: "EV_A", __own_event__: true}};
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", kw, sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", kw, sub);
        expect(count()).toBe(1);

        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", kw, sub);
        expect(count()).toBe(0);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });
});
