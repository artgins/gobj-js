/***********************************************************************
 *          post_event.test.js
 *
 *      gobj_post_event() is gobj_send_event() deferred to the next turn.
 *      It exists to get out of the stack you are standing on, which is
 *      the case every time a subscriber has to destroy the publisher
 *      whose synchronous gobj_publish_event() is still below it.
 *
 *      The clauses pinned here are the ones the C side pins too, because
 *      the two have to be the same call:
 *
 *      - posting does NOT deliver
 *      - the events queued when a turn begins are the ones delivered in
 *        it, and what an action posts waits for the following turn
 *      - destroying the DESTINATION drops what it had pending
 *      - destroying the SOURCE clears src and keeps the event
 *      - an event the destination does not declare is refused when
 *        posted, not a turn later
 *      - the queue has a ceiling, because it is not a work queue
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
    gobj_destroy,
    gobj_post_event,
    gobj_posted_events_size,
    set_log_callback,
} from "../src/index.js";

const arrivals = [];
const logged = [];

set_log_callback((level, msg) => {
    if(level === "error") {
        logged.push(String(msg));
    }
});

/*  Waits for the drain, which is a macrotask: setTimeout(0) and not a
 *  microtask, so that the browser keeps its turn between one posted
 *  event and the next. One tick here is one turn there.  */
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

const yuno_attrs = [
SDATA(data_type_t.DTP_BOOLEAN, "trace_creation",   0, 0, "trace create/delete"),
SDATA(data_type_t.DTP_BOOLEAN, "trace_start_stop", 0, 0, "trace start/stop"),
SDATA_END()
];

function ac_note(gobj, event, kw, src)
{
    arrivals.push({event: event, n: kw?kw.n:undefined, src: src});
    return 0;
}

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_YUNO", [], [["ST_IDLE", []]], {}, null,
        yuno_attrs, {}, null, null, null, 0);
    gclass_create(
        "C_TEST_POST",
        [["EV_A", 0], ["EV_B", 0], ["EV_C", 0]],
        [["ST_IDLE", [
            ["EV_A", ac_note, 0],
            ["EV_B", ac_note, 0],
            ["EV_C", ac_note, 0]
        ]]],
        {}, null, [SDATA_END()], {}, null, null, null, 0
    );
    yuno = gobj_create_yuno("test_yuno", "C_TEST_YUNO", {});
});

describe("gobj_post_event", () => {
    test("posting does not deliver, and the order is kept", async () => {
        arrivals.length = 0;
        const gobj = gobj_create("order", "C_TEST_POST", {}, yuno);

        gobj_post_event(gobj, "EV_A", {n: 1}, gobj);
        gobj_post_event(gobj, "EV_B", {n: 2}, gobj);

        /*  the whole point: nothing ran yet  */
        expect(arrivals).toEqual([]);
        expect(gobj_posted_events_size()).toBe(2);

        await turn();

        expect(arrivals.map(a => a.event)).toEqual(["EV_A", "EV_B"]);
        expect(arrivals.map(a => a.n)).toEqual([1, 2]);
        expect(arrivals[0].src).toBe(gobj);
        gobj_destroy(gobj);
    });

    test("what an action posts waits for the following turn", async () => {
        arrivals.length = 0;
        const gobj = gobj_create("snapshot", "C_TEST_POST", {}, yuno);

        /*  EV_A's action posts EV_C: with a snapshot per turn it cannot
         *  arrive in the same drain as EV_A and EV_B.  */
        let posted_from_action = false;
        const gclass_action = (g, event, kw, src) => {
            arrivals.push({event: event, n: kw?kw.n:undefined, src: src});
            if(event === "EV_A" && !posted_from_action) {
                posted_from_action = true;
                gobj_post_event(g, "EV_C", {n: 3}, g);
            }
            return 0;
        };
        gclass_create(
            "C_TEST_SNAPSHOT",
            [["EV_A", 0], ["EV_B", 0], ["EV_C", 0]],
            [["ST_IDLE", [
                ["EV_A", gclass_action, 0],
                ["EV_B", gclass_action, 0],
                ["EV_C", gclass_action, 0]
            ]]],
            {}, null, [SDATA_END()], {}, null, null, null, 0
        );
        const g2 = gobj_create("snapshot2", "C_TEST_SNAPSHOT", {}, yuno);

        gobj_post_event(g2, "EV_A", {n: 1}, g2);
        gobj_post_event(g2, "EV_B", {n: 2}, g2);

        await turn();
        /*  the snapshot held two; EV_C is queued, not delivered  */
        expect(arrivals.map(a => a.event)).toEqual(["EV_A", "EV_B"]);
        expect(gobj_posted_events_size()).toBe(1);

        await turn();
        expect(arrivals.map(a => a.event)).toEqual(["EV_A", "EV_B", "EV_C"]);

        gobj_destroy(g2);
        gobj_destroy(gobj);
    });

    test("destroying the destination drops what it had pending", async () => {
        arrivals.length = 0;
        const gobj = gobj_create("doomed", "C_TEST_POST", {}, yuno);

        gobj_post_event(gobj, "EV_A", {n: 1}, gobj);
        expect(gobj_posted_events_size()).toBe(1);

        gobj_destroy(gobj);
        expect(gobj_posted_events_size()).toBe(0);

        await turn();
        expect(arrivals).toEqual([]);
    });

    test("destroying the source clears src and keeps the event", async () => {
        arrivals.length = 0;
        const dst = gobj_create("survivor", "C_TEST_POST", {}, yuno);
        const src = gobj_create("dying_sender", "C_TEST_POST", {}, yuno);

        gobj_post_event(dst, "EV_A", {n: 7}, src);
        gobj_destroy(src);

        /*  the destination still wants it  */
        expect(gobj_posted_events_size()).toBe(1);

        await turn();
        expect(arrivals.length).toBe(1);
        expect(arrivals[0].n).toBe(7);
        expect(arrivals[0].src).toBe(null);

        gobj_destroy(dst);
    });

    test("an event the destination does not declare is refused when posted", () => {
        const gobj = gobj_create("strict", "C_TEST_POST", {}, yuno);
        logged.length = 0;

        const ret = gobj_post_event(gobj, "EV_NOT_MINE", {}, gobj);

        expect(ret).toBe(-1);
        expect(gobj_posted_events_size()).toBe(0);
        expect(logged.join("\n")).toMatch(/NOT DEFINED in gclass/);
        gobj_destroy(gobj);
    });

    test("the queue has a ceiling", async () => {
        const gobj = gobj_create("flood", "C_TEST_POST", {}, yuno);
        logged.length = 0;
        arrivals.length = 0;

        let accepted = 0;
        while(accepted < 50000) {
            if(gobj_post_event(gobj, "EV_A", {n: accepted}, gobj) < 0) {
                break;
            }
            accepted++;
        }

        expect(accepted).toBeLessThan(50000);
        expect(logged.join("\n")).toMatch(/NOT a work queue/);

        gobj_destroy(gobj);
        await turn();
    });
});
