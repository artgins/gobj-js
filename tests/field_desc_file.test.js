/***********************************************************************
 *          field_desc_file.test.js
 *
 *      A `file` column is an fkey into the treedb's __assets__, and it is
 *      declared with TWO words: `file` qualifies the fkey, it does not
 *      replace it. The C side asks for both with kw_has_word() and does
 *      not care in which order they sit, so neither may this.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { test, expect } from "vitest";
import { treedb_get_field_desc } from "../src/lib_treedb.js";

const foto = (flag) => ({
    id: "foto",
    header: "Photo",
    type: "string",
    flag: flag
});

test("['fkey','file'] answers type file", () => {
    const d = treedb_get_field_desc(foto(["fkey", "file"]));
    expect(d.type).toBe("file");
    expect(d.is_file).toBe(true);
    expect(d.real_type).toBe("string");
});

test("the ORDER of the flags does not decide it", () => {
    /*
     *  The loop takes the LAST type word it meets, so without the rule
     *  this order would answer "fkey" and the form would draw a select.
     */
    const d = treedb_get_field_desc(foto(["file", "fkey"]));
    expect(d.type).toBe("file");
    expect(d.is_file).toBe(true);
});

test("an fkey that is not a file is untouched", () => {
    const d = treedb_get_field_desc(foto(["fkey"]));
    expect(d.type).toBe("fkey");
    expect(d.is_file).toBe(false);
});

test("the writable/required attributes still read on a file column", () => {
    const d = treedb_get_field_desc(foto(["fkey", "file", "writable", "required"]));
    expect(d.type).toBe("file");
    expect(d.is_file).toBe(true);
    expect(d.is_writable).toBe(true);
    expect(d.is_required).toBe(true);
});

test("a column with no flag answers its plain type", () => {
    const d = treedb_get_field_desc({id: "name", type: "string"});
    expect(d.type).toBe("string");
    expect(d.is_file).toBe(false);
});
