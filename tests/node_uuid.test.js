/***********************************************************************
 *          node_uuid.test.js
 *
 *      node_uuid() answers ONE uuid for the life of the page: the one the
 *      store keeps, or, when the store cannot keep it (blocked, full, no
 *      localStorage, outside a browser), one this page made. It goes in
 *      the node_uuid attribute of the yuno, in the id of the identity card
 *      and in the `host` of every message the client sends, so a uuid that
 *      changes from one call to the next is a node that changes identity
 *      in the middle of a session. gobj-js 7.26.27 made a new one on every
 *      call when the store could not keep it.
 *
 *      Without crypto.randomUUID() (a page served over http without TLS
 *      is not a secure context) it answered null -- with a working store
 *      too, for ever, as nothing was written. A uuid v4 is made from
 *      crypto.getRandomValues(), or from Math.random() when there is no
 *      crypto at all.
 *
 *      Every test loads a FRESH module (vi.resetModules()): the uuid of
 *      the page is state of the module, and a page is one load of it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const saved_window = globalThis.window;
let logged = [];

/*
 *  One load of the module = one page
 */
async function load_page(win)
{
    if(win === undefined) {
        delete globalThis.window;
    } else {
        globalThis.window = win;
    }
    vi.resetModules();
    const helpers = await import("../src/helpers.js");
    helpers.set_log_callback((level, msg) => {
        logged.push(`${level}: ${String(msg)}`);
    });
    return helpers;
}

function map_storage(map, {full = false} = {})
{
    return {
        getItem(key) {
            return map.has(key)? map.get(key) : null;
        },
        setItem(key, value) {
            if(full) {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            }
            map.set(key, String(value));
        },
        removeItem(key) {
            map.delete(key);
        },
    };
}

function blocked_window(crypto)
{
    const win = {console: globalThis.console, crypto: crypto};
    Object.defineProperty(win, "localStorage", {
        get() {
            throw new DOMException("The document is sandboxed and lacks the 'allow-same-origin' flag.",
                "SecurityError");
        },
    });
    return win;
}

/*  An http page without TLS: crypto.getRandomValues() but no crypto.randomUUID()  */
const insecure_crypto = {
    getRandomValues: (a) => globalThis.crypto.getRandomValues(a),
};

function calls(node_uuid, n = 4)
{
    const out = [];
    for(let i = 0; i < n; i++) {
        out.push(node_uuid());
    }
    return out;
}

beforeEach(() => {
    logged = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.window = saved_window;
    if(saved_window === undefined) {
        delete globalThis.window;
    }
});

describe("node_uuid() with a store that keeps it", () => {
    test("is made once, written, and answered again", async () => {
        const map = new Map();
        const {node_uuid} = await load_page({localStorage: map_storage(map), console: globalThis.console, crypto: globalThis.crypto});
        const all = calls(node_uuid);
        expect(all[0]).toMatch(UUID_ANY);
        expect(new Set(all).size).toBe(1);
        expect(map.get("host_uuid")).toBe(all[0]);
        expect(logged).toEqual([]);
    });

    test("the uuid the store holds is the one answered, in the next page too", async () => {
        const map = new Map([["host_uuid", "11111111-2222-4333-8444-555555555555"]]);
        const win = {localStorage: map_storage(map), console: globalThis.console, crypto: globalThis.crypto};
        let h = await load_page(win);
        expect(calls(h.node_uuid)).toEqual(Array(4).fill("11111111-2222-4333-8444-555555555555"));
        h = await load_page(win);
        expect(h.node_uuid()).toBe("11111111-2222-4333-8444-555555555555");
    });

    test("an empty entry is no uuid: one is made and written", async () => {
        const map = new Map([["host_uuid", ""]]);
        const {node_uuid} = await load_page({localStorage: map_storage(map), console: globalThis.console,
            crypto: globalThis.crypto});
        const a = node_uuid();
        expect(a).toMatch(UUID_ANY);
        expect(map.get("host_uuid")).toBe(a);
    });

    test("the page keeps its first answer when the store changes under it", async () => {
        const map = new Map();
        const {node_uuid} = await load_page({localStorage: map_storage(map), console: globalThis.console,
            crypto: globalThis.crypto});
        const a = node_uuid();
        map.set("host_uuid", "11111111-2222-4333-8444-555555555555");   // another tab, or a clear
        expect(node_uuid()).toBe(a);
        map.clear();
        expect(node_uuid()).toBe(a);
    });

    test("without crypto.randomUUID (http without TLS): a uuid v4, written, not null", async () => {
        const map = new Map();
        const {node_uuid} = await load_page({localStorage: map_storage(map), console: globalThis.console, crypto: insecure_crypto});
        const all = calls(node_uuid);
        expect(all[0]).toMatch(UUID_V4);
        expect(new Set(all).size).toBe(1);
        expect(map.get("host_uuid")).toBe(all[0]);
    });
});

describe("node_uuid() with a store that cannot keep it: one uuid for the page", () => {
    const cases = [
        ["the site's data blocked", () => blocked_window(globalThis.crypto), true],
        ["a full store", () => ({localStorage: map_storage(new Map(), {full: true}), console: globalThis.console,
            crypto: globalThis.crypto}), true],
        ["no localStorage", () => ({localStorage: null, console: globalThis.console, crypto: globalThis.crypto}), false],
        ["outside a browser", () => undefined, false],
        ["blocked, without crypto.randomUUID", () => blocked_window(insecure_crypto), true],
    ];
    for(const [what, make_window, warns] of cases) {
        test(`${what}: the same uuid on every call`, async () => {
            const {node_uuid} = await load_page(make_window());
            const all = calls(node_uuid);
            expect(all[0]).toMatch(UUID_ANY);
            expect(all).toEqual(Array(4).fill(all[0]));
            const warnings = logged.filter(l => /^warning: .*node_uuid/.test(l));
            expect(warnings.length).toBe(warns? 1 : 0);
            expect(logged.filter(l => /^error: /.test(l))).toEqual([]);
        });
    }

    test("two pages make two uuids: it is made, not a constant", async () => {
        const a = (await load_page(blocked_window(globalThis.crypto))).node_uuid();
        const b = (await load_page(blocked_window(globalThis.crypto))).node_uuid();
        expect(a).not.toBe(b);
    });

    test("with no crypto at all: a uuid v4 made with Math.random(), stable, one per page", async () => {
        vi.stubGlobal("crypto", undefined);
        const a = await load_page(blocked_window(undefined));
        const all = calls(a.node_uuid);
        expect(all[0]).toMatch(UUID_V4);
        expect(all).toEqual(Array(4).fill(all[0]));
        const b = await load_page(blocked_window(undefined));
        expect(b.node_uuid()).not.toBe(all[0]);
    });
});
