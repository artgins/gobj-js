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
 *      A corrupt entry that comes back after its removal is warned again,
 *      and so is a store blocked again after a good read. A store the
 *      browser blocks (reading window.localStorage itself throws) gives
 *      the default, -1 to a write, and never throws: every helper and
 *      node_uuid() threw, so an app that reads its locale at start did not
 *      start. The writer refuses a value with no json text, as a typed
 *      writer does: a function was stored as the text "undefined".
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import {
    kw_get_local_storage_value,
    kw_set_local_storage_value,
    kw_remove_local_storage_value,
    node_uuid,
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
const fake_window = {localStorage: fake_storage, console: globalThis.console, crypto: globalThis.crypto};
globalThis.window = fake_window;

let logged = [];
set_log_callback((level, msg) => {
    logged.push(`${level}: ${String(msg)}`);
});

afterAll(() => {
    globalThis.window = saved_window;
});

beforeEach(() => {
    globalThis.window = fake_window;
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

describe("a second corrupt value in the same key", () => {
    test("is warned again: the key is forgotten once its entry is removed", () => {
        store.set("pad", "{corrupt 1");
        expect(kw_get_local_storage_value("pad", 1, false)).toBe(1);
        expect(store.has("pad")).toBe(false);
        store.set("pad", "{corrupt 2");
        expect(kw_get_local_storage_value("pad", 1, false)).toBe(1);
        expect(store.has("pad")).toBe(false);
        expect(logged.filter(l => /^warning: .*"pad".*removed/.test(l)).length).toBe(2);
    });

    test("a store blocked again after a good read is warned again", () => {
        const getItem = fake_storage.getItem;
        const block = () => {
            fake_storage.getItem = () => {
                throw new Error("SecurityError");
            };
        };
        try {
            block();
            expect(kw_get_local_storage_value("flaky", 3, false)).toBe(3);
            fake_storage.getItem = getItem;
            store.set("flaky", "4");
            expect(kw_get_local_storage_value("flaky", 3, false)).toBe(4);
            block();
            expect(kw_get_local_storage_value("flaky", 3, false)).toBe(3);
        } finally {
            fake_storage.getItem = getItem;
        }
        expect(logged.filter(l => /^warning: .*"flaky"/.test(l)).length).toBe(2);
    });

    test("a corrupt value that cannot be removed is warned once, not on every read", () => {
        const removeItem = fake_storage.removeItem;
        fake_storage.removeItem = () => {
            throw new Error("SecurityError");
        };
        try {
            store.set("stuck", "{corrupt");
            expect(kw_get_local_storage_value("stuck", 5, false)).toBe(5);
            expect(kw_get_local_storage_value("stuck", 5, false)).toBe(5);
            expect(kw_get_local_storage_value("stuck", 5, false)).toBe(5);
        } finally {
            fake_storage.removeItem = removeItem;
        }
        expect(logged.filter(l => /^warning: .*"stuck".*cannot be removed/.test(l)).length).toBe(1);
        expect(logged.filter(l => /^warning: .*"stuck"/.test(l)).length).toBe(1);
    });
});

describe("kw_set_local_storage_value() of a value with no json text", () => {
    const circular = {a: 1};
    circular.self = circular;
    const cases = [
        ["a function", () => 1],
        ["a symbol", Symbol("s")],
        ["a BigInt", 10n],
        ["a circular object", circular],
        ["NaN", NaN],
        ["NaN inside", {width: NaN}],
        ["Infinity inside", [1, Infinity]],
        ["undefined in an array", [1, undefined]],
        ["a function in an array", [() => 1]],
        ["a hole in an array", [1, , 3]],   // eslint-disable-line no-sparse-arrays
        ["a toJSON()", {toJSON: () => "x"}],
        ["a Date", new Date(0)],
        ["a Map", new Map([["a", 1]])],
    ];
    for(const [what, value] of cases) {
        test(`${what}: refused with an ERROR, -1, nothing stored`, () => {
            store.set("refused", "\"before\"");
            expect(kw_set_local_storage_value("refused", value)).toBe(-1);
            expect(store.get("refused")).toBe("\"before\"");
            const errors = logged.filter(l => /^error: .*kw_set_local_storage_value.*"refused"/.test(l));
            expect(errors.length).toBe(1);
            expect(errors[0]).toMatch(/no json text/);
        });
    }

    test("a key of undefined in an object is an absent key, as everywhere", () => {
        expect(kw_set_local_storage_value("absent_key", {a: 1, b: undefined})).toBe(0);
        expect(store.get("absent_key")).toBe("{\"a\":1}");
        expect(logged).toEqual([]);
    });
});

/*
 *  With the site's data blocked (Chrome with cookies blocked, a sandboxed
 *  iframe), READING window.localStorage already throws a SecurityError --
 *  not only getItem(). Every app reads its locale at start, so the app did
 *  not start.
 */
describe("with the site's data blocked", () => {
    let reads = 0;
    beforeEach(() => {
        reads = 0;
        const blocked = {console: globalThis.console, crypto: globalThis.crypto};
        Object.defineProperty(blocked, "localStorage", {
            get() {
                reads++;
                throw new DOMException("The document is sandboxed and lacks the 'allow-same-origin' flag.",
                    "SecurityError");
            },
        });
        globalThis.window = blocked;
    });
    afterEach(() => {
        globalThis.window = fake_window;
    });

    test("a read answers the default, warned once per key", () => {
        expect(kw_get_local_storage_value("locale", "es", true)).toBe("es");
        expect(kw_get_local_storage_value("locale", "es", true)).toBe("es");
        expect(reads).toBeGreaterThan(0);
        expect(logged.filter(l => /^warning: .*"locale".*cannot be read/.test(l)).length).toBe(1);
        expect(logged.filter(l => /^error: /.test(l))).toEqual([]);   // the default is not written to a blocked store
    });

    test("a write is -1 with an ERROR: the value did not reach the store", () => {
        expect(kw_set_local_storage_value("theme", "dark")).toBe(-1);
        expect(logged.filter(l => /^error: .*cannot save "theme"/.test(l)).length).toBe(1);
    });

    test("a removal does not throw: a WARNING", () => {
        expect(() => kw_remove_local_storage_value("theme")).not.toThrow();
        expect(logged.filter(l => /^warning: .*cannot remove "theme"/.test(l)).length).toBe(1);
    });

    test("node_uuid() answers a uuid it cannot keep", () => {
        let uuid;
        expect(() => {
            uuid = node_uuid();
        }).not.toThrow();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
});

describe("node_uuid()", () => {
    test("is kept in the store and answered again", () => {
        const a = node_uuid();
        expect(store.get("host_uuid")).toBe(a);
        expect(node_uuid()).toBe(a);
    });
});
