/***********************************************************************
 *          count_work_plugin.js
 *
 *      A vite plugin for the tests that COUNT work instead of timing it
 *      (secret_masking_linear.test.js): every function and every loop of
 *      the source it transforms adds one to a counter, each time its
 *      body is entered.
 *
 *      The counter is `globalThis.__gobj_js_work.n`, created by the first
 *      transformed module that loads. Every body is a block (the braces
 *      rule of the repository), so the tick goes right after its `{`.
 *      An arrow function whose body is an expression gets no tick: it is
 *      called from a body that has one.
 *
 *      The count does not depend on the machine or on its load: the same
 *      text gives the same count every time, so a test can ask that the
 *      work grows EXACTLY as the text does. A loop written later counts
 *      too, with no change to this plugin -- a rescan included.
 *
 *      Only the vitest project of the counting tests uses it
 *      (vite.config.js): the other tests and the build see the source as
 *      it is.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { parseAst } from "vite";

const COUNTED_TYPES = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "WhileStatement",
    "DoWhileStatement",
]);

/*
 *  The offsets where a tick goes: right after the `{` of the body of
 *  every function and every loop
 */
function tick_offsets(node, out)
{
    if(Array.isArray(node)) {
        for(const child of node) {
            tick_offsets(child, out);
        }
        return;
    }
    if(!node || typeof node.type !== "string") {
        return;
    }
    if(COUNTED_TYPES.has(node.type) && node.body && node.body.type === "BlockStatement") {
        out.push(node.body.start + 1);
    }
    for(const key of Object.keys(node)) {
        const value = node[key];
        if(value && typeof value === "object") {
            tick_offsets(value, out);
        }
    }
}

/*
 *  `include`: a function of a module id, true for the modules to count
 */
export function count_work_plugin(include)
{
    return {
        name: "gobj-js-count-work",
        enforce: "pre",
        transform(code, id) {
            if(!include(id)) {
                return null;
            }
            const offsets = [];
            tick_offsets(parseAst(code), offsets);
            if(offsets.length === 0) {
                return null;    // nothing runs in it (src/index.js re-exports)
            }
            offsets.sort((a, b) => b - a);
            let out = code;
            for(const at of offsets) {
                out = out.slice(0, at) + "__work.n++;" + out.slice(at);
            }
            out = "const __work = (globalThis.__gobj_js_work ??= {n: 0});\n" + out;
            return {code: out, map: null};
        },
    };
}
