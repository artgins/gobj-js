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
 *      The language itself reads, with no call: it gets a hook of
 *      count_native_work.js at each place, and the code does what it did.
 *      - `a[b]`  __work.read(a)[__work.key(b)]: the first read of a rope
 *        flattens it, and a long key is hashed;
 *      - `a + b`, `a += b`, a template: __work.added(...): a long string
 *        made this way is a rope until something reads it;
 *      - `a === b`, `a < b` and kin: __work.left(a) === __work.same(b):
 *        two long strings compared are read;
 *      - `k in o`: __work.key(k) in o;
 *      - `{...o}`, `for(k in o)`: __work.keys(o): they list the keys.
 *
 *      The count does not depend on the machine or on its load: the same
 *      text gives the same count every time, so a test can ask that the
 *      work grows EXACTLY as the text does. A loop or a callback written
 *      later counts too, with no change to this plugin -- a rescan
 *      included. The work done INSIDE a native method is the part of
 *      count_native_work.js.
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

const SAME_OPERATORS = new Set(["===", "!==", "==", "!="]);
const ORDER_OPERATORS = new Set(["<", ">", "<=", ">="]);

/*
 *  A number, or a text of the source: a comparison with one is no
 *  comparison of two long strings, and needs no hook
 */
function is_short_for_sure(node)
{
    return node.type === "Literal" || node.type === "UpdateExpression" ||
        node.type === "UnaryExpression" ||
        (node.type === "MemberExpression" && !node.computed && node.property.name === "length");
}

function wrap(out, node, hook)
{
    out.push([node.start, `__work.${hook}(`]);
    out.push([node.end, ")"]);
}

/*
 *  The insertions of `node`, after those of its children: two insertions
 *  at one offset are applied in order, so the last one stands first in
 *  the text, and the outer must.
 */
function own_insertions(node, parent, out)
{
    if(COUNTED_TYPES.has(node.type) && node.body) {
        if(node.body.type === "BlockStatement") {
            out.push([node.body.start + 1, TICK]);
        } else if(node.type === "ArrowFunctionExpression") {
            out.push([node.body.start, TICK_IN_EXPRESSION]);
            out.push([node.body.end, ")"]);
        }
    }
    switch(node.type) {
        case "MemberExpression":
            if(node.computed) {
                if(node.object.type !== "Super") {
                    wrap(out, node.object, "read");
                }
                wrap(out, node.property, "key");
            }
            break;
        case "BinaryExpression":
            if(node.operator === "+") {
                wrap(out, node, "added");
            } else if(SAME_OPERATORS.has(node.operator) || ORDER_OPERATORS.has(node.operator)) {
                if(!is_short_for_sure(node.left) && !is_short_for_sure(node.right)) {
                    wrap(out, node.left, "left");
                    wrap(out, node.right, SAME_OPERATORS.has(node.operator)? "same" : "order");
                }
            } else if(node.operator === "in" && node.left.type !== "PrivateIdentifier") {
                wrap(out, node.left, "key");
            }
            break;
        case "AssignmentExpression":
            if(node.operator === "+=") {
                wrap(out, node, "added");
            }
            break;
        case "TemplateLiteral":
            if(node.expressions.length > 0 && parent.type !== "TaggedTemplateExpression") {
                wrap(out, node, "added");
            }
            break;
        case "SpreadElement":
            if(parent.type === "ObjectExpression") {
                wrap(out, node.argument, "keys");
            }
            break;
        case "ForInStatement":
            wrap(out, node.right, "keys");
            break;
        default:
            break;
    }
}

/*
 *  The insertions that add the ticks and the hooks, as [offset, text]
 */
function tick_insertions(node, parent, out)
{
    if(Array.isArray(node)) {
        for(const child of node) {
            tick_insertions(child, parent, out);
        }
        return;
    }
    if(!node || typeof node.type !== "string") {
        return;
    }
    for(const key of Object.keys(node)) {
        const value = node[key];
        if(value && typeof value === "object") {
            tick_insertions(value, node, out);
        }
    }
    own_insertions(node, parent, out);
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
            tick_insertions(parseAst(code), null, insertions);
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
