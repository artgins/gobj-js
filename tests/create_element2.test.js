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
});
