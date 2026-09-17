/***********************************************************************
 *          current_timestamp.test.js
 *
 *      The log timestamp is the LOCAL wall clock with the local offset,
 *      as the C kernel writes it. It used to be UTC time followed by the
 *      local offset: two hours wrong at +0200.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { current_timestamp } from "../src/index.js";

describe("current_timestamp", () => {
    test("the time read back with its own offset is the real instant", () => {
        const now = new Date();
        const ts = current_timestamp(now);
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})([+-])(\d{2})(\d{2})$/.exec(ts);
        expect(m).not.toBeNull();
        const offset = (m[8] === "+" ? 1 : -1) * (Number(m[9]) * 60 + Number(m[10]));
        const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) - offset * 60000;
        expect(utc).toBe(now.getTime());
    });

    test("the fields are the local ones", () => {
        const now = new Date(2026, 8, 17, 13, 5, 35, 370);
        expect(current_timestamp(now).startsWith("2026-09-17T13:05:35.370")).toBe(true);
    });
});
