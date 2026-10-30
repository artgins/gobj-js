/***********************************************************************
 *          count_work_plugin.js
 *
 *      A vite plugin for the tests that COUNT work instead of timing it
 *      (secret_masking_linear.test.js): every function and every loop of
 *      the source it transforms adds one to a counter, each time its
 *      body is entered.
 *
 *      The counter is `globalThis.__gobj_js_work.n`, created by the first
 *      transformed module that loads. The tick of a block body goes right
 *      after its `{`. An arrow function whose body is an expression gets
 *      its tick in that expression, `(v) => (__work.n++, v < 0)`: a native
 *      method that calls it (`arr.some((v) => v < 0)`) has no tick of its
 *      own, so the call is the only place where its work shows.
 *
 *      The count does not depend on the machine or on its load: the same
 *      text gives the same count every time, so a test can ask that the
 *      work grows EXACTLY as the text does. A loop or a callback written
 *      later counts too, with no change to this plugin -- a rescan
 *      included. The work done INSIDE a native method is not counted
 *      here: secret_masking_linear.test.js adds the methods it has a model
 *      of, and secret_masking_time.test.js times the masking for the rest.
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

const TICK = "__work.n++;";
const TICK_IN_EXPRESSION = "(__work.n++, ";

/*
 *  The insertions that add the ticks, as [offset, text]: right after the
 *  `{` of the body of every function and every loop, and around the body
 *  of an arrow function that is an expression
 */
function tick_insertions(node, out)
{
    if(Array.isArray(node)) {
        for(const child of node) {
            tick_insertions(child, out);
        }
        return;
    }
    if(!node || typeof node.type !== "string") {
        return;
    }
    if(COUNTED_TYPES.has(node.type) && node.body) {
        if(node.body.type === "BlockStatement") {
            out.push([node.body.start + 1, TICK]);
        } else if(node.type === "ArrowFunctionExpression") {
            out.push([node.body.start, TICK_IN_EXPRESSION]);
            out.push([node.body.end, ")"]);
        }
    }
    for(const key of Object.keys(node)) {
        const value = node[key];
        if(value && typeof value === "object") {
            tick_insertions(value, out);
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
            const insertions = [];
            tick_insertions(parseAst(code), insertions);
            if(insertions.length === 0) {
                return null;    // nothing runs in it (src/index.js re-exports)
            }
            insertions.sort((a, b) => b[0] - a[0]);
            let out = code;
            for(const [at, text] of insertions) {
                out = out.slice(0, at) + text + out.slice(at);
            }
            out = "const __work = (globalThis.__gobj_js_work ??= {n: 0});\n" + out;
            return {code: out, map: null};
        },
    };
}
