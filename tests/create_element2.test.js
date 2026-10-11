// @vitest-environment jsdom
/***********************************************************************
 *          create_element2.test.js
 *
 *      createElement2() and its children list: a Text node or a string
 *      in the list is text, and up to 7.26.1 it was dropped in silence.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect } from "vitest";

describe("createElement2 children list", () => {
    test("createElement2 appends a Text node or a string in a children list", async () => {
        const { createElement2 } = await import("../src/helpers.js");
        const el = createElement2(["div", {}, [
            ["b", {}, "x"],
            document.createTextNode("<img src=x>"),
            "<i>y</i>",
        ]]);
        expect(el.childNodes.length).toBe(3);
        expect(el.textContent).toBe("x<img src=x><i>y</i>");
        expect(el.querySelector("img")).toBe(null);
        expect(el.querySelector("i")).toBe(null);
    });

    test("a bare string in the third slot is still markup", async () => {
        const { createElement2 } = await import("../src/helpers.js");
        const el = createElement2(["div", {}, "<i>y</i>"]);
        expect(el.querySelector("i")).not.toBe(null);
    });

    test("html_markup() is markup in the third slot and in a list, every node kept", async () => {
        const { createElement2, html_markup } = await import("../src/helpers.js");
        const a = createElement2(["span", {}, html_markup('<i class="yi-copy"></i><b>x</b>')]);
        expect(a.querySelector("i.yi-copy")).not.toBe(null);
        expect(a.querySelector("b")).not.toBe(null);
        const b = createElement2(["div", {}, [["b", {}, "x"], html_markup("<i>y</i>")]]);
        expect(b.querySelector("i")).not.toBe(null);
    });

    test("set_strings_are_text(true): a plain string is text, logged once", async () => {
        const helpers = await import("../src/helpers.js");
        const { createElement2, html_markup, set_strings_are_text, set_log_callback } = helpers;
        const logged = [];
        set_log_callback((level, msg) => { logged.push(`${level}: ${msg}`); });
        set_strings_are_text(true);
        try {
            const a = createElement2(["span", {}, "<img src=x onerror=alert(1)>"]);
            expect(a.querySelector("img")).toBe(null);
            expect(a.textContent).toBe("<img src=x onerror=alert(1)>");
            createElement2(["span", {}, "<img src=x onerror=alert(1)>"]);
            expect(logged.filter(l => l.includes("html_markup")).length).toBe(1);

            const b = createElement2(["span", {}, html_markup("<i>y</i>")]);
            expect(b.querySelector("i")).not.toBe(null);
        } finally {
            set_strings_are_text(false);
            set_log_callback(null);
        }
    });
});
