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
 *      `__rename_event_name__` is taken out of the stored `__config__`
 *      too, as in C, when some gclass declares the event: it becomes the
 *      subscription's `renamed_event`, what the subscriber is SENT (with
 *      `__original_event_name__` in the kw), and it is compared on its own.
 *      A renamed subscription over a plain one, and two renames of one
 *      event, are two; a plain kw is a wildcard, so a plain subscription
 *      over a renamed one replaces it, and a plain unsubscribe removes
 *      both. Up to gobj-js 7.25.8 the rename stayed in the stored
 *      `__config__` and nothing was renamed: a plain kw carrying the rest of
 *      that `__config__` made a second subscription, where C has one.
 *
 *      A subscription withdrawn by the mt_subscription_deleted() of an
 *      entry before it in the same unsubscribe is gone as asked: it is not
 *      taken for a hard subscription kept.
 *
 *      gobj_unsubscribe_list() removes the subscription OBJECT it is
 *      given. Up to gobj-js 7.25.8 it removed the first entry whose fields
 *      matched it, and a plain subscription matches every other of its
 *      event and subscriber: a stale plain one removed a live one.
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
    gobj_find_subscribings,
    gobj_publish_event,
    event_flag_t,
    set_log_callback,
} from "../src/index.js";

let received = 0;
let received_a = 0;
let original_a = "";
let withdraw_on_delete = null;
let logs = [];

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

function ac_note_a(gobj, event, kw, src)
{
    received_a++;
    original_a = kw.__original_event_name__;
    return 0;
}

/*
 *  The publisher that withdraws `withdraw_on_delete` when another of its
 *  subscriptions is deleted
 */
function mt_subscription_deleted(gobj, subs)
{
    let withdraw = withdraw_on_delete;
    if(withdraw && withdraw !== subs) {
        withdraw_on_delete = null;
        gobj_unsubscribe_list(gobj, [withdraw], false);
    }
    return 0;
}

function warnings(text)
{
    return logs.filter(([level, msg]) => level === "warning" && msg.indexOf(text) >= 0).length;
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
        "C_TEST_PUB_WITHDRAW",
        [["EV_ON_MESSAGE", event_flag_t.EVF_OUTPUT_EVENT]],
        [["ST_IDLE", []]],
        {mt_subscription_deleted: mt_subscription_deleted},
        null, [SDATA_END()], {}, null, null, null, 0
    );
    gclass_create(
        "C_TEST_SUB_REPEAT",
        [["EV_ON_MESSAGE", 0], ["EV_A", 0], ["EV_B", 0]],
        [["ST_IDLE", [
            ["EV_ON_MESSAGE", ac_note, 0],
            ["EV_A", ac_note_a, 0],
            ["EV_B", ac_note, 0]
        ]]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    yuno = gobj_create_yuno("test_yuno_repeat", "C_TEST_YUNO_REPEAT", {});
    set_log_callback((level, msg) => { logs.push([level, String(msg)]); });
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
        expect(gobj_find_subscriptions(pub, "EV_ON_MESSAGE", {}, sub)[0].renamed_event)
            .toBe("EV_B");

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

    test("a renamed subscription is delivered under its new name", () => {
        pub = gobj_create("pub7", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub7", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        const subs = gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        expect(subs.renamed_event).toBe("EV_A");
        expect(subs.__config__ && subs.__config__.__rename_event_name__).toBeFalsy();
        expect(subs.__global__.__original_event_name__).toBe("EV_ON_MESSAGE");

        received = 0;
        received_a = 0;
        original_a = "";
        gobj_publish_event(pub, "EV_ON_MESSAGE", {});
        expect(received_a).toBe(1);
        expect(received).toBe(0);
        expect(original_a).toBe("EV_ON_MESSAGE");

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("a kw with the rest of a renamed __config__ matches it, as in C", () => {
        pub = gobj_create("pub8", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub8", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE",
            {__config__: {x: 1, __rename_event_name__: "EV_A"}}, sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", {__config__: {x: 1}}, sub);
        expect(count()).toBe(1);
        expect(gobj_find_subscriptions(pub, "EV_ON_MESSAGE", {}, sub)[0].renamed_event)
            .toBeFalsy();

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("a plain subscription over a renamed one replaces it; a plain unsubscribe removes both", () => {
        pub = gobj_create("pub9", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub9", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        expect(count()).toBe(1);
        received = 0;
        received_a = 0;
        gobj_publish_event(pub, "EV_ON_MESSAGE", {});
        expect(received).toBe(1);
        expect(received_a).toBe(0);
        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        expect(count()).toBe(0);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        expect(count()).toBe(2);
        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        expect(count()).toBe(0);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("a rename no gclass declares stays in the __config__, and is logged", () => {
        pub = gobj_create("pub10", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub10", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        logs = [];
        const subs = gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_NOBODY"), sub);
        expect(subs.renamed_event).toBeFalsy();
        expect(subs.__config__.__rename_event_name__).toBe("EV_NOBODY");
        expect(logs.filter(([level, msg]) =>
            level === "error" && msg.indexOf("EVENT NOT FOUND") >= 0).length).toBe(1);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE", renamed("EV_A"), sub);
        expect(count()).toBe(2);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("one withdrawn by the deletion of another is not a hard one kept", () => {
        pub = gobj_create("pub11", "C_TEST_PUB_WITHDRAW", {}, yuno);
        sub = gobj_create("sub11", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        withdraw_on_delete = gobj_subscribe_event(pub, "EV_ON_MESSAGE",
            {__filter__: {wanted: true}}, sub);
        expect(count()).toBe(2);

        logs = [];
        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        expect(count()).toBe(0);
        expect(withdraw_on_delete).toBe(null);
        expect(warnings("Hard subscription not removed")).toBe(0);
        expect(warnings("No subscription found")).toBe(0);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });

    test("gobj_unsubscribe_list() removes the subscription it is given", () => {
        pub = gobj_create("pub6", "C_TEST_PUB_REPEAT", {}, yuno);
        sub = gobj_create("sub6", "C_TEST_SUB_REPEAT", {}, yuno);
        gobj_start(pub);
        gobj_start(sub);

        gobj_subscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        const dl_stale = gobj_find_subscriptions(pub, "EV_ON_MESSAGE", {}, sub);
        gobj_unsubscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        expect(count()).toBe(0);

        const subs_plain = gobj_subscribe_event(pub, "EV_ON_MESSAGE", {}, sub);
        const subs_filter = gobj_subscribe_event(pub, "EV_ON_MESSAGE",
            {__filter__: {wanted: true}}, sub);
        expect(count()).toBe(2);

        logs = [];
        gobj_unsubscribe_list(pub, dl_stale, false);
        expect(count()).toBe(2);
        expect(warnings("already removed")).toBe(1);
        expect(gobj_find_subscribings(sub, "EV_ON_MESSAGE", {}, pub).length).toBe(2);

        gobj_unsubscribe_list(pub, [subs_plain], false);
        const left = gobj_find_subscriptions(pub, "EV_ON_MESSAGE", {}, sub);
        expect(left.length).toBe(1);
        expect(left[0]).toBe(subs_filter);
        const left2 = gobj_find_subscribings(sub, "EV_ON_MESSAGE", {}, pub);
        expect(left2.length).toBe(1);
        expect(left2[0]).toBe(subs_filter);

        gobj_destroy(sub);
        gobj_destroy(pub);
    });
});
