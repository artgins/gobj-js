/***********************************************************************
 *          local_storage.test.js
 *
 *      kw_get_local_storage_value() of an entry that is not json (a
 *      corrupt or foreign write): one WARNING, the entry removed, the
 *      default answered -- and the next read finds no entry, so it
 *      warns no more. It used to console.warn on EVERY read, and every
 *      reader of gobj-ui (the dev window, the json viewer...) warned
 *      for ever. Its text is never shown: JSON.parse() quotes it in its
 *      error, and an entry can hold a token.
 *
 *      A json null is an ABSENT entry, as json_absent() in C: the
 *      default is answered, and written over it with `create`.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeEach, afterAll, vi } from "vitest";
import {
    kw_get_local_storage_value,
    kw_set_local_storage_value,
    set_log_callback,
} from "../src/index.js";

const store = new Map();
const fake_storage = {
    getItem(key) {
        return store.has(key)? store.get(key) : null;
    },
    setItem(key, value) {
        store.set(key, String(value));
    },
    removeItem(key) {
        store.delete(key);
    },
};

const saved_window = globalThis.window;
globalThis.window = {localStorage: fake_storage, console: globalThis.console};

let logged = [];
set_log_callback((level, msg) => {
    logged.push(`${level}: ${String(msg)}`);
});

afterAll(() => {
    globalThis.window = saved_window;
});

beforeEach(() => {
    store.clear();
    logged = [];
});

describe("kw_get_local_storage_value()", () => {
    test("an entry that is not json: warned ONCE, removed, the default answered", () => {
        const warn = vi.spyOn(globalThis.console, "warn").mockImplementation(() => {});
        store.set("dev_traffic_view", "token=hunter2 {not json");
        expect(kw_get_local_storage_value("dev_traffic_view", "collapsed", false)).toBe("collapsed");
        expect(kw_get_local_storage_value("dev_traffic_view", "collapsed", false)).toBe("collapsed");
        expect(kw_get_local_storage_value("dev_traffic_view", "collapsed", false)).toBe("collapsed");
        const warnings = logged.filter(l => /^warning: .*dev_traffic_view/.test(l));
        expect(warnings.length).toBe(1);
        expect(logged.filter(l => l.indexOf("hunter2") >= 0)).toEqual([]);
        expect(warn.mock.calls.filter(c => String(c.join(" ")).indexOf("dev_traffic_view") >= 0).length)
            .toBeLessThanOrEqual(1);
        expect(warn.mock.calls.filter(c => String(c.join(" ")).indexOf("hunter2") >= 0)).toEqual([]);
        expect(store.has("dev_traffic_view")).toBe(false);
        warn.mockRestore();
    });

    test("with `create`, the default is written in place of a corrupt entry", () => {
        store.set("locale", "{");
        expect(kw_get_local_storage_value("locale", "es", true)).toBe("es");
        expect(store.get("locale")).toBe("\"es\"");
        expect(logged.filter(l => /^warning: /.test(l)).length).toBe(1);
    });

    test("a json null is an absent entry: the default, no warning; written over with `create`", () => {
        store.set("theme", "null");
        expect(kw_get_local_storage_value("theme", "light", false)).toBe("light");
        expect(store.get("theme")).toBe("null");
        expect(kw_get_local_storage_value("theme", "light", true)).toBe("light");
        expect(store.get("theme")).toBe("\"light\"");
        expect(logged).toEqual([]);
    });

    test("a json value is read as it was written", () => {
        kw_set_local_storage_value("rect", {x: 1, y: 2, width: 3, height: 4});
        expect(kw_get_local_storage_value("rect", null, false)).toEqual({x: 1, y: 2, width: 3, height: 4});
        kw_set_local_storage_value("flag", false);
        expect(kw_get_local_storage_value("flag", true, false)).toBe(false);
        kw_set_local_storage_value("zero", 0);
        expect(kw_get_local_storage_value("zero", 7, false)).toBe(0);
        expect(kw_get_local_storage_value("missing", 7, false)).toBe(7);
        expect(logged).toEqual([]);
    });

    test("a store that refuses to be read is warned once per key, not on every read", () => {
        const getItem = fake_storage.getItem;
        fake_storage.getItem = () => {
            throw new Error("SecurityError");
        };
        try {
            expect(kw_get_local_storage_value("blocked_key", 3, false)).toBe(3);
            expect(kw_get_local_storage_value("blocked_key", 3, false)).toBe(3);
        } finally {
            fake_storage.getItem = getItem;
        }
        expect(logged.filter(l => /^warning: .*blocked_key/.test(l)).length).toBe(1);
    });
});
