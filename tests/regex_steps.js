/***********************************************************************
 *          regex_steps.js
 *
 *      A regular expression run by a small backtracking machine that
 *      counts its steps, for the tests that COUNT work
 *      (count_native_work.js): V8 says nothing of how much an expression
 *      read, and what it read is the question when a text chooses how
 *      long a match attempt runs.
 *
 *      regex_steps(re, text, from) searches `text` from `from` as
 *      re.exec() does, and returns where it matched and the steps it
 *      took: one for each instruction of the machine, so one for each
 *      character an attempt reads, each one it reads again after a
 *      backtrack, and each failed attempt of a scan. The same regular
 *      expression on the same text gives the same count on every run
 *      and every machine. It is a model of a backtracking engine, not of
 *      V8's: V8 skips positions a compiled expression cannot start at,
 *      so its work is at most of this order, never of a higher one.
 *
 *      It reads the syntax of JavaScript, with the Annex B forms a
 *      source really carries. A class, an escape and `.` are not
 *      reimplemented: each one is compiled once as a native expression
 *      of one character, and asked about each character it meets, so
 *      `i`, `u`, `v` and `s` mean what they mean in the engine. What it
 *      cannot read it refuses (`\q{}`, a backreference to no group, an
 *      octal escape): a count is never made up. count_native_work.js
 *      compares each answer with that of the native exec(), so a machine
 *      that disagrees stops the test instead of counting wrong.
 *
 *      The machine keeps its backtracking on a stack of its own, not on
 *      the JavaScript one: a `(?:a|b)*` over 1 MB is a million pending
 *      alternatives.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*
 *  Taken when this module loads: count_native_work.js patches the
 *  originals while it counts, and this is the code that counts.
 */
const native_exec = RegExp.prototype.exec;
const NativeRegExp = RegExp;
const NativeInt32Array = Int32Array;
const NativeUint8Array = Uint8Array;
const native_apply = Reflect.apply;
const char_code_at = Function.prototype.call.bind(String.prototype.charCodeAt);
const to_upper_case = Function.prototype.call.bind(String.prototype.toUpperCase);
const from_code_point = String.fromCodePoint;

/*
 *  A guard: past it an expression has no answer in any reasonable time,
 *  and the native one would have none either. It runs first, so a count
 *  fails instead of hanging.
 */
const MAX_STEPS = 1e9;
const MAX_PROGRAM = 1 << 22;

/*
 *  The machine's instructions
 */
const OP_ACCEPT = 0;
const OP_LITERAL = 1;       // one code unit, forward
const OP_CHAR = 2;          // a matcher, forward
const OP_CHAR_BACK = 3;     // a matcher, backward
const OP_SPLIT = 4;         // try x, then y
const OP_JUMP = 5;
const OP_OPEN = 6;          // a group begins
const OP_CLOSE = 7;         // a group ends
const OP_CLEAR = 8;         // the groups x..y are unset
const OP_MARK = 9;          // where an iteration began
const OP_CHECK = 10;        // an iteration that took nothing fails
const OP_LINE_START = 11;
const OP_LINE_END = 12;
const OP_WORD_EDGE = 13;    // y: 1 when it must NOT be one
const OP_BACKREF = 14;
const OP_LOOK = 15;         // x: where it goes on, y: 1 when negative


/*
 *  The syntax, read into a tree. `scope` holds the flags in force, which
 *  a (?i:...) changes.
 */
function count_groups(src, unicode_sets)
{
    let n = 0;
    const names = Object.create(null);
    let in_class = 0;
    for(let i = 0; i < src.length; i++) {
        const c = src[i];
        if(c === "\\") {
            i++;
        } else if(c === "[") {
            if(in_class === 0 || unicode_sets) {
                in_class++;
            }
        } else if(c === "]") {
            if(in_class > 0) {
                in_class--;
            }
        } else if(c === "(" && in_class === 0) {
            if(src[i + 1] !== "?") {
                n++;
            } else if(src[i + 2] === "<" && src[i + 3] !== "=" && src[i + 3] !== "!") {
                n++;
                let end = i + 3;
                while(src[end] !== ">") {
                    end++;
                }
                let name = "";
                for(let k = i + 3; k < end; k++) {
                    name += src[k];
                }
                (names[name] ??= []).push(n);
            }
        }
    }
    return {n, names};
}

function parse_regex(src, flags)
{
    const unicode = flags.unicode || flags.unicodeSets;
    const {n: n_groups, names} = count_groups(src, flags.unicodeSets);
    let i = 0;
    let group = 0;

    function refuse(why)
    {
        throw new Error(`regex_steps: /${src}/ cannot be read: ${why}`);
    }

    function skip_class()
    {
        const from = i;
        let depth = 0;
        while(i < src.length) {
            const c = src[i];
            if(c === "\\") {
                if(src[i + 1] === "q") {
                    refuse("\\q{} matches strings");
                }
                i += 2;
                continue;
            }
            if(c === "[") {
                if(depth === 0 || flags.unicodeSets) {
                    depth++;
                }
            } else if(c === "]") {
                depth--;
                if(depth === 0) {
                    i++;
                    return src.substring(from, i);
                }
            }
            i++;
        }
        return refuse("a class that does not close");
    }

    function read_number()
    {
        let digits = "";
        while(src[i] >= "0" && src[i] <= "9") {
            digits += src[i];
            i++;
        }
        return digits;
    }

    function read_escape(scope)
    {
        const from = i;
        const c = src[i + 1];
        if(c === undefined) {
            refuse("a \\ at the end");
        }
        i += 2;
        if(c === "b" || c === "B") {
            return {t: "edge", negative: c === "B", scope};
        }
        if(c >= "1" && c <= "9") {
            i--;
            const n = Number(read_number());
            if(n > n_groups) {
                refuse("a backreference to no group, or an octal escape");
            }
            return {t: "backref", groups: [n], scope};
        }
        if(c === "k") {
            if(src[i] !== "<") {
                if(unicode || Object.keys(names).length > 0) {
                    refuse("a \\k with no name");
                }
                return {t: "char", src: "k", scope};
            }
            let name = "";
            i++;
            while(i < src.length && src[i] !== ">") {
                name += src[i];
                i++;
            }
            i++;
            if(!names[name]) {
                refuse("a backreference to no group");
            }
            return {t: "backref", groups: names[name], scope};
        }
        if(c === "0" && src[i] >= "0" && src[i] <= "9") {
            refuse("an octal escape");
        }
        if((c === "p" || c === "P" || c === "u") && src[i] === "{") {
            while(i < src.length && src[i] !== "}") {
                i++;
            }
            i++;
        } else if(c === "u") {
            i += 4;
        } else if(c === "x") {
            i += 2;
        } else if(c === "c") {
            i += 1;
        }
        return {t: "char", src: src.substring(from, i), scope};
    }

    /*
     *  A quantifier at i, or null (a "{" that is no quantifier is a
     *  character)
     */
    function read_quantifier()
    {
        const c = src[i];
        let min;
        let max;
        if(c === "*") {
            i++;
            min = 0;
            max = Infinity;
        } else if(c === "+") {
            i++;
            min = 1;
            max = Infinity;
        } else if(c === "?") {
            i++;
            min = 0;
            max = 1;
        } else if(c === "{") {
            const at = i;
            i++;
            const low = read_number();
            let high = low;
            if(src[i] === ",") {
                i++;
                high = read_number();
                if(high === "") {
                    high = "Infinity";
                }
            }
            if(low === "" || src[i] !== "}") {
                i = at;
                return null;
            }
            i++;
            min = Number(low);
            max = Number(high);
        } else {
            return null;
        }
        let lazy = false;
        if(src[i] === "?") {
            i++;
            lazy = true;
        }
        return {min, max, lazy};
    }

    function apply_modifiers(scope)
    {
        const out = {...scope};
        let on = true;
        while(i < src.length && src[i] !== ":") {
            const c = src[i];
            if(c === "-") {
                on = false;
            } else if(c === "i") {
                out.ignoreCase = on;
            } else if(c === "m") {
                out.multiline = on;
            } else if(c === "s") {
                out.dotAll = on;
            } else {
                refuse("a modifier it does not know");
            }
            i++;
        }
        i++;
        return out;
    }

    function read_atom(scope)
    {
        const c = src[i];
        if(c === "\\") {
            return read_escape(scope);
        }
        if(c === "[") {
            return {t: "char", src: skip_class(), scope};
        }
        if(c === ".") {
            i++;
            return {t: "char", src: ".", scope};
        }
        if(c === "^") {
            i++;
            return {t: "line_start", scope};
        }
        if(c === "$") {
            i++;
            return {t: "line_end", scope};
        }
        if(c !== "(") {
            const from = i;
            i++;
            const code = char_code_at(c, 0);
            if(unicode && code >= 0xD800 && code <= 0xDBFF && i < src.length) {
                i++;
            }
            return {t: "char", src: src.substring(from, i), scope};
        }
        if(src[i + 1] !== "?") {
            i++;
            group++;
            const first = group;
            const body = read_alternatives(scope);
            i++;
            return {t: "group", index: first, body, first, last: group};
        }
        const open = src[i + 2];
        if(open === "=" || open === "!") {
            i += 3;
            const first = group + 1;
            const body = read_alternatives(scope);
            i++;
            return {t: "look", negative: open === "!", behind: false, body, first, last: group};
        }
        if(open === "<" && (src[i + 3] === "=" || src[i + 3] === "!")) {
            const negative = src[i + 3] === "!";
            i += 4;
            const first = group + 1;
            const body = read_alternatives(scope);
            i++;
            return {t: "look", negative, behind: true, body, first, last: group};
        }
        if(open === "<") {
            while(src[i] !== ">") {
                i++;
            }
            i++;
            group++;
            const first = group;
            const body = read_alternatives(scope);
            i++;
            return {t: "group", index: first, body, first, last: group};
        }
        i += 2;
        const first = group + 1;
        const body = read_alternatives(apply_modifiers(scope));
        i++;
        return {t: "group", index: 0, body, first, last: group};
    }

    function read_sequence(scope)
    {
        const items = [];
        while(i < src.length && src[i] !== "|" && src[i] !== ")") {
            const first = group + 1;
            const atom = read_atom(scope);
            const q = read_quantifier();
            if(q) {
                items.push({t: "repeat", ...q, body: atom, first, last: group});
            } else {
                items.push(atom);
            }
        }
        return {t: "sequence", items};
    }

    function read_alternatives(scope)
    {
        const items = [read_sequence(scope)];
        while(src[i] === "|") {
            i++;
            items.push(read_sequence(scope));
        }
        return (items.length === 1)? items[0] : {t: "alternatives", items};
    }

    const scope = {
        ignoreCase: flags.ignoreCase,
        multiline: flags.multiline,
        dotAll: flags.dotAll,
    };
    const tree = read_alternatives(scope);
    if(i < src.length) {
        refuse("a ) with no (");
    }
    return {tree, n_groups};
}

/*
 *  The longest text a node can take is 0: an iteration of it can be
 *  empty, and the machine must reject that one
 */
function can_be_empty(node)
{
    switch(node.t) {
        case "char":
            return false;
        case "sequence":
            for(const item of node.items) {
                if(!can_be_empty(item)) {
                    return false;
                }
            }
            return true;
        case "alternatives":
            for(const item of node.items) {
                if(can_be_empty(item)) {
                    return true;
                }
            }
            return false;
        case "group":
            return can_be_empty(node.body);
        case "repeat":
            return node.min === 0 || can_be_empty(node.body);
        default:
            return true;
    }
}

/*
 *  One character of a class, an escape or `.`, asked of a native
 *  expression once and kept in a table
 */
function make_matcher(src, scope, flags)
{
    const f = (scope.ignoreCase? "i" : "") + (scope.dotAll? "s" : "") +
        (flags.unicodeSets? "v" : (flags.unicode? "u" : ""));
    const re = new NativeRegExp("^(?:" + src + ")$", f);
    const table = new NativeUint8Array(65536);
    const beyond = Object.create(null);
    return function(code) {
        if(code < 65536) {
            let known = table[code];
            if(known === 0) {
                known = (native_apply(native_exec, re, [from_code_point(code)]) !== null)? 1 : 2;
                table[code] = known;
            }
            return known === 1;
        }
        let known = beyond[code];
        if(known === undefined) {
            known = (native_apply(native_exec, re, [from_code_point(code)]) !== null);
            beyond[code] = known;
        }
        return known;
    };
}

function compile_regex(re)
{
    const flags = {
        ignoreCase: re.ignoreCase,
        multiline: re.multiline,
        dotAll: re.dotAll,
        unicode: re.unicode,
        unicodeSets: re.unicodeSets,
    };
    const unicode = flags.unicode || flags.unicodeSets;
    const {tree, n_groups} = parse_regex(re.source, flags);
    const op = [];
    const x = [];
    const y = [];
    const matchers = [];
    const matcher_ids = Object.create(null);
    const backrefs = [];
    let n_marks = 0;

    function emit(code, a, b)
    {
        if(op.length >= MAX_PROGRAM) {
            throw new Error(`regex_steps: /${re.source}/ makes a program too large`);
        }
        op.push(code);
        x.push(a || 0);
        y.push(b || 0);
        return op.length - 1;
    }

    function matcher_id(src, scope)
    {
        const key = (scope.ignoreCase? "i" : "-") + (scope.dotAll? "s" : "-") + src;
        let id = matcher_ids[key];
        if(id === undefined) {
            id = matchers.length;
            matchers.push(make_matcher(src, scope, flags));
            matcher_ids[key] = id;
        }
        return id;
    }

    function emit_char(node, dir)
    {
        const code = char_code_at(node.src, 0);
        const plain = (node.src.length === 1) && !node.scope.ignoreCase && node.src !== "." &&
            !(code >= 0xD800 && code <= 0xDFFF);
        if(plain && dir > 0) {
            emit(OP_LITERAL, code);
        } else {
            emit((dir > 0)? OP_CHAR : OP_CHAR_BACK, matcher_id(node.src, node.scope));
        }
    }

    function emit_iteration(node, dir, check)
    {
        const mark = check? n_marks++ : 0;
        if(check) {
            emit(OP_MARK, mark);
        }
        if(node.last >= node.first) {
            emit(OP_CLEAR, node.first, node.last);
        }
        emit_node(node.body, dir);
        if(check) {
            emit(OP_CHECK, mark);
        }
    }

    function emit_repeat(node, dir)
    {
        const check = can_be_empty(node.body);
        for(let k = 0; k < node.min; k++) {
            emit_iteration(node, dir, false);
        }
        if(node.max === Infinity) {
            const split = emit(OP_SPLIT);
            emit_iteration(node, dir, check);
            emit(OP_JUMP, split);
            const out = op.length;
            x[split] = node.lazy? out : split + 1;
            y[split] = node.lazy? split + 1 : out;
            return;
        }
        const splits = [];
        for(let k = node.min; k < node.max; k++) {
            splits.push(emit(OP_SPLIT));
            emit_iteration(node, dir, check);
        }
        const out = op.length;
        for(const split of splits) {
            x[split] = node.lazy? out : split + 1;
            y[split] = node.lazy? split + 1 : out;
        }
    }

    function emit_node(node, dir)
    {
        switch(node.t) {
            case "char":
                emit_char(node, dir);
                break;
            case "sequence":
                if(dir > 0) {
                    for(let k = 0; k < node.items.length; k++) {
                        emit_node(node.items[k], dir);
                    }
                } else {
                    for(let k = node.items.length - 1; k >= 0; k--) {
                        emit_node(node.items[k], dir);
                    }
                }
                break;
            case "alternatives": {
                const jumps = [];
                for(let k = 0; k < node.items.length; k++) {
                    if(k < node.items.length - 1) {
                        const split = emit(OP_SPLIT);
                        x[split] = op.length;
                        emit_node(node.items[k], dir);
                        jumps.push(emit(OP_JUMP));
                        y[split] = op.length;
                    } else {
                        emit_node(node.items[k], dir);
                    }
                }
                for(const jump of jumps) {
                    x[jump] = op.length;
                }
                break;
            }
            case "group":
                if(node.index > 0) {
                    emit(OP_OPEN, node.index);
                }
                emit_node(node.body, dir);
                if(node.index > 0) {
                    emit(OP_CLOSE, node.index, dir);
                }
                break;
            case "look": {
                const look = emit(OP_LOOK, 0, node.negative? 1 : 0);
                emit_node(node.body, node.behind? -1 : 1);
                emit(OP_ACCEPT);
                x[look] = op.length;
                break;
            }
            case "repeat":
                emit_repeat(node, dir);
                break;
            case "line_start":
                emit(OP_LINE_START, node.scope.multiline? 1 : 0);
                break;
            case "line_end":
                emit(OP_LINE_END, node.scope.multiline? 1 : 0);
                break;
            case "edge":
                emit(OP_WORD_EDGE, matcher_id("\\w", node.scope), node.negative? 1 : 0);
                break;
            case "backref":
                backrefs.push({groups: node.groups, ignore_case: node.scope.ignoreCase});
                emit(OP_BACKREF, backrefs.length - 1, dir);
                break;
            default:
                throw new Error(`regex_steps: a node it does not know: ${node.t}`);
        }
    }

    emit_node(tree, 1);
    emit(OP_ACCEPT);

    return {
        op: new NativeInt32Array(op),
        x: new NativeInt32Array(x),
        y: new NativeInt32Array(y),
        matchers,
        backrefs,
        n_groups,
        unicode,
        // two for each group, one for where each group opened, and the marks
        regs: new NativeInt32Array(2*(n_groups + 1) + (n_groups + 1) + n_marks),
        marks_at: 2*(n_groups + 1) + (n_groups + 1),
        stack: new NativeInt32Array(3*1024),
    };
}

function is_line_end(code)
{
    return code === 10 || code === 13 || code === 0x2028 || code === 0x2029;
}

/*
 *  The code point at i, forward, or the one that ends at i, backward
 */
function code_forward(p, text, i)
{
    const code = char_code_at(text, i);
    if(p.unicode && code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
        const low = char_code_at(text, i + 1);
        if(low >= 0xDC00 && low <= 0xDFFF) {
            return (code - 0xD800)*1024 + (low - 0xDC00) + 65536;
        }
    }
    return code;
}

function code_backward(p, text, i)
{
    const code = char_code_at(text, i - 1);
    if(p.unicode && code >= 0xDC00 && code <= 0xDFFF && i - 2 >= 0) {
        const high = char_code_at(text, i - 2);
        if(high >= 0xD800 && high <= 0xDBFF) {
            return (high - 0xD800)*1024 + (code - 0xDC00) + 65536;
        }
    }
    return code;
}

function same_ignoring_case(a, b)
{
    if(a === b) {
        return true;
    }
    return to_upper_case(from_code_point(a)) === to_upper_case(from_code_point(b));
}

/*
 *  The state of one search
 */
let steps = 0;
let max_steps = MAX_STEPS;
let accepted_at = 0;

function push(p, sp, a, b, c)
{
    if(sp + 3 > p.stack.length) {
        const bigger = new NativeInt32Array(2*p.stack.length);
        for(let k = 0; k < sp; k++) {
            bigger[k] = p.stack[k];
        }
        p.stack = bigger;
    }
    p.stack[sp] = a;
    p.stack[sp + 1] = b;
    p.stack[sp + 2] = c;
    return sp + 3;
}

/*
 *  Run from `pc` at `at`. Entries above `base` of the stack are its own:
 *  [-1, pc, position] an alternative left to try, [register, value, 0] a
 *  register to put back when going back past it. Return the top of the
 *  stack at OP_ACCEPT, -1 when every alternative failed.
 */
function run(p, text, pc, at, base)
{
    const {op, x, y, regs, matchers} = p;
    const n = text.length;
    const groups_at = 2*(p.n_groups + 1);
    let i = at;
    let sp = base;

    for(;;) {
        let ok = true;
        steps++;
        if(steps > max_steps) {
            throw new Error(`regex_steps: more than ${max_steps} steps in one search: it does not end`);
        }
        const a = x[pc];
        const b = y[pc];
        switch(op[pc]) {
            case OP_ACCEPT:
                accepted_at = i;
                return sp;
            case OP_LITERAL:
                if(i < n && char_code_at(text, i) === a) {
                    i++;
                    pc++;
                } else {
                    ok = false;
                }
                break;
            case OP_CHAR:
                if(i < n) {
                    const code = code_forward(p, text, i);
                    if(matchers[a](code)) {
                        i += (code > 65535)? 2 : 1;
                        pc++;
                    } else {
                        ok = false;
                    }
                } else {
                    ok = false;
                }
                break;
            case OP_CHAR_BACK:
                if(i > 0) {
                    const code = code_backward(p, text, i);
                    if(matchers[a](code)) {
                        i -= (code > 65535)? 2 : 1;
                        pc++;
                    } else {
                        ok = false;
                    }
                } else {
                    ok = false;
                }
                break;
            case OP_SPLIT:
                sp = push(p, sp, -1, b, i);
                pc = a;
                break;
            case OP_JUMP:
                pc = a;
                break;
            case OP_OPEN:
                sp = push(p, sp, groups_at + a, regs[groups_at + a], 0);
                regs[groups_at + a] = i;
                pc++;
                break;
            case OP_CLOSE: {
                const from = regs[groups_at + a];
                sp = push(p, sp, 2*a, regs[2*a], 0);
                sp = push(p, sp, 2*a + 1, regs[2*a + 1], 0);
                regs[2*a] = (b > 0)? from : i;
                regs[2*a + 1] = (b > 0)? i : from;
                pc++;
                break;
            }
            case OP_CLEAR:
                for(let g = a; g <= b; g++) {
                    if(regs[2*g] !== -1) {
                        sp = push(p, sp, 2*g, regs[2*g], 0);
                        sp = push(p, sp, 2*g + 1, regs[2*g + 1], 0);
                        regs[2*g] = -1;
                        regs[2*g + 1] = -1;
                    }
                }
                pc++;
                break;
            case OP_MARK:
                sp = push(p, sp, p.marks_at + a, regs[p.marks_at + a], 0);
                regs[p.marks_at + a] = i;
                pc++;
                break;
            case OP_CHECK:
                if(regs[p.marks_at + a] === i) {
                    ok = false;
                } else {
                    pc++;
                }
                break;
            case OP_LINE_START:
                if(i === 0 || (a === 1 && is_line_end(char_code_at(text, i - 1)))) {
                    pc++;
                } else {
                    ok = false;
                }
                break;
            case OP_LINE_END:
                if(i === n || (a === 1 && is_line_end(char_code_at(text, i)))) {
                    pc++;
                } else {
                    ok = false;
                }
                break;
            case OP_WORD_EDGE: {
                const before = (i > 0) && matchers[a](char_code_at(text, i - 1));
                const after = (i < n) && matchers[a](char_code_at(text, i));
                if((before !== after) === (b === 0)) {
                    pc++;
                } else {
                    ok = false;
                }
                break;
            }
            case OP_BACKREF: {
                const ref = p.backrefs[a];
                let from = -1;
                let to = -1;
                for(const g of ref.groups) {
                    if(regs[2*g] !== -1) {
                        from = regs[2*g];
                        to = regs[2*g + 1];
                    }
                }
                const len = to - from;
                if(from < 0) {
                    pc++;
                } else if((b > 0)? (i + len > n) : (i - len < 0)) {
                    ok = false;
                } else {
                    const start = (b > 0)? i : i - len;
                    for(let k = 0; k < len && ok; k++) {
                        steps++;
                        const c1 = char_code_at(text, from + k);
                        const c2 = char_code_at(text, start + k);
                        ok = ref.ignore_case? same_ignoring_case(c1, c2) : (c1 === c2);
                    }
                    if(ok) {
                        i = (b > 0)? i + len : i - len;
                        pc++;
                    }
                }
                break;
            }
            case OP_LOOK: {
                const top = run(p, text, pc + 1, i, sp);
                if(b === 1) {
                    if(top >= 0) {
                        unwind(p, top, sp);
                        ok = false;
                    } else {
                        pc = a;
                    }
                } else if(top < 0) {
                    ok = false;
                } else {
                    // a lookaround is atomic: its alternatives go, its groups stay
                    sp = drop_alternatives(p, top, sp);
                    pc = a;
                }
                break;
            }
            default:
                throw new Error(`regex_steps: an instruction it does not know: ${op[pc]}`);
        }
        if(ok) {
            continue;
        }

        /*
         *  Back to the last alternative
         */
        let resumed = false;
        while(sp > base) {
            sp -= 3;
            const reg = p.stack[sp];
            if(reg === -1) {
                pc = p.stack[sp + 1];
                i = p.stack[sp + 2];
                resumed = true;
                break;
            }
            regs[reg] = p.stack[sp + 1];
        }
        if(!resumed) {
            return -1;
        }
    }
}

function unwind(p, top, base)
{
    for(let k = top - 3; k >= base; k -= 3) {
        const reg = p.stack[k];
        if(reg !== -1) {
            p.regs[reg] = p.stack[k + 1];
        }
    }
}

function drop_alternatives(p, top, base)
{
    let out = base;
    for(let k = base; k < top; k += 3) {
        if(p.stack[k] !== -1) {
            p.stack[out] = p.stack[k];
            p.stack[out + 1] = p.stack[k + 1];
            p.stack[out + 2] = p.stack[k + 2];
            out += 3;
        }
    }
    return out;
}

const programs = Object.create(null);

function program_of(re)
{
    const key = `/${re.source}/${re.flags}`;
    let p = programs[key];
    if(!p) {
        p = compile_regex(re);
        programs[key] = p;
    }
    return p;
}

/************************************************************
 *  `re` searched in `text` from `from`, as its exec() searches
 *  (sticky: only there). Return {steps, index, end, groups}: index
 *  -1 when there is no match; groups, the [from, to] of each
 *  group, 1 first, -1 when it took no part. It throws past
 *  `limit` steps.
 ************************************************************/
export function regex_steps(re, text, from, limit = MAX_STEPS)
{
    const p = program_of(re);
    const regs = p.regs;
    const n = text.length;
    steps = 0;
    max_steps = limit;
    let at = from;
    while(at <= n) {
        for(let k = 0; k < regs.length; k++) {
            regs[k] = -1;
        }
        if(run(p, text, 0, at, 0) >= 0) {
            const groups = [];
            for(let g = 1; g <= p.n_groups; g++) {
                groups.push([regs[2*g], regs[2*g + 1]]);
            }
            return {steps, index: at, end: accepted_at, groups};
        }
        if(re.sticky) {
            break;
        }
        at += (p.unicode && at < n && code_forward(p, text, at) > 65535)? 2 : 1;
    }
    return {steps, index: -1, end: -1, groups: []};
}
