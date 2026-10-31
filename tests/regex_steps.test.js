/***********************************************************************
 *          regex_steps.test.js
 *
 *      The machine that counts the steps of a regular expression
 *      (regex_steps.js) gives the answers of the native exec(), and
 *      counts what a backtracking engine reads.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { regex_steps } from "./regex_steps.js";

function native_answer(re, text, from)
{
    re.lastIndex = from;
    const r = re.exec(text);
    return r? [r.index, r.index + r[0].length, ...Array.from(r).slice(1)] : null;
}

function model_answer(re, text, from)
{
    const m = regex_steps(re, text, from);
    if(m.index < 0) {
        return null;
    }
    const groups = m.groups.map(([a, b]) => ((a < 0)? undefined : text.substring(a, b)));
    return [m.index, m.end, ...groups];
}

/*
 *  The syntax Node 22 does not read, and README.md supports Node 22: a
 *  literal of it would stop this whole file from loading. The case is
 *  skipped, and its name says why. Node 24 reads all of it, so there a
 *  refused source is a mistake here, not a skip.
 */
const NEWER_SYNTAX = [
    ["a name repeated in two alternatives", "(?<y>a)|(?<y>b)", "", "b"],
    ["a flag turned on in a group", "(?i:ab)c", "", "ABc"],
    ["a flag turned off in a group", "(?-i:a)b", "i", "aB"],
];
const NODE_READS_ALL_OF_IT = 24;

function regexp_or_reason(source, flags)
{
    try {
        return {re: new RegExp(source, flags), reason: ""};
    } catch(e) {
        if(parseInt(process.versions.node) >= NODE_READS_ALL_OF_IT) {
            throw e;
        }
        return {re: null, reason: ` (SKIPPED: Node ${process.versions.node} does not read it: ${e.message})`};
    }
}

/*
 *  A reproducible sequence, so a failure can be run again
 */
function random_of(seed)
{
    let state = seed;
    return (n) => {
        state = (state*1103515245 + 12345) & 0x7fffffff;
        return (state >> 8) % n;
    };
}

const ATOMS = ["a", "b", "c", "=", ".", "\\d", "\\w", "\\s", "\\W", "[ab]", "[^a]", "[a-c=]", "\\.", "\\n",
               "é", "\\u00e9", "\\x41", "A"];
const ASSERTIONS = ["\\b", "\\B", "^", "$"];
const QUANTIFIERS = ["*", "+", "?", "{2}", "{1,3}", "{0,2}", "{2,}", "*?", "+?", "??", "{1,2}?"];
const FLAGS = ["", "i", "m", "s", "g", "y", "gi", "u", "iu", "v", "ms", "d", "su"];
const ALPHABET = "aabbc=A \n.é1";

function random_source(rnd, depth, groups)
{
    const atom = () => ATOMS[rnd(ATOMS.length)];
    const inner = () => random_source(rnd, depth + 1, groups);
    switch(rnd((depth > 3)? 5 : 14)) {
        case 0:
        case 1:
        case 2:
        case 3:
            return atom();
        case 4:
            return ASSERTIONS[rnd(ASSERTIONS.length)];
        case 5:
        case 6:
            return inner() + inner();
        case 7:
            return inner() + "|" + inner();
        case 8:
            groups.n++;
            return "(" + inner() + ")";
        case 9:
            return "(?:" + inner() + ")";
        case 10: {
            const open = rnd(2)? "(?:" : "(";
            if(open === "(") {
                groups.n++;
            }
            return open + inner() + ")" + QUANTIFIERS[rnd(QUANTIFIERS.length)];
        }
        case 11:
            return ["(?=", "(?!"][rnd(2)] + inner() + ")";
        case 12:
            return ["(?<=", "(?<!"][rnd(2)] + inner() + ")";
        default:
            return (groups.n > 0)? "\\" + (1 + rnd(groups.n)) : "a";
    }
}

describe("regex_steps", () => {
    test.each([
        [/(a*)*b/, "aaaa"],
        [/(?<x>a)\k<x>/i, "aA"],
        [/\u{1F600}./u, "\u{1F600}x"],
        [/(?<=(\d+)(\d+))$/, "1053"],
        [/(?=(a+))a*b\1/, "baaabac"],
        [/(z)((a+)?(b+)?(c))*/, "zaacbbbcac"],
        [/\p{L}+/u, "héllo!"],
        [/[\p{L}--[a-z]]+/v, "abCD"],
        [/(?:)*/, "x"],
        [/(?:a?)*?b/, "aab"],
        [/a{,3}/, "a{,3}"],
        [/\cJ\0/, "\n\0"],
        [/(?<!a)b/, "ab b"],
        [/\bfoo\b/m, "a foo\nfoo"],
        [/^b$/m, "a\nb\nc"],
    ])("reads %s as the native does", (re, text) => {
        expect(model_answer(re, text, 0)).toEqual(native_answer(re, text, 0));
    });

    for(const [what, source, flags, text] of NEWER_SYNTAX) {
        const {re, reason} = regexp_or_reason(source, flags);
        test.skipIf(!re)(`reads ${what} as the native does${reason}`, () => {
            expect(model_answer(re, text, 0)).toEqual(native_answer(re, text, 0));
        });
    }

    test("gives the answers of the native exec() on random expressions and texts", () => {
        const rnd = random_of(20261031);
        let matched = 0;
        for(let round = 0; round < 3000; round++) {
            const source = random_source(rnd, 0, {n: 0});
            const flags = FLAGS[rnd(FLAGS.length)];
            let re;
            try {
                re = new RegExp(source, flags);
            } catch(e) {
                continue;   // the grammar above can write what the syntax refuses
            }
            for(let t = 0; t < 3; t++) {
                let text = "";
                const len = rnd(14);
                for(let i = 0; i < len; i++) {
                    text += ALPHABET[rnd(ALPHABET.length)];
                }
                const from = (re.global || re.sticky)? rnd(len + 2) : 0;
                const answer = native_answer(re, text, from);
                expect(model_answer(re, text, from), `${re} on ${JSON.stringify(text)} from ${from}`).toEqual(answer);
                matched += answer? 1 : 0;
            }
        }
        expect(matched).toBeGreaterThan(1000);
    }, 60000);

    test("counts what a backtracking engine reads", () => {
        const n = 1024;
        const steps = (re, text) => regex_steps(re, text, 0).steps;

        // one pass: a run that starts in one place, a scan with no way in
        expect(steps(/=+/g, "=".repeat(n))).toBeLessThan(4*n);
        expect(steps(/=/, "a".repeat(n))).toBeLessThan(3*n);

        // what fails is read again from each position: n*n/2
        const quadratic = steps(/[^\u0001]*\u0001/, "a".repeat(n));
        expect(quadratic).toBeGreaterThan(n*n/2);
        expect(steps(/[^\u0001]*\u0001/, "a".repeat(2*n))).toBeGreaterThan(3.9*quadratic);

        // a sticky one is one attempt, and its backtracking counts
        expect(steps(/[^\u0001]*\u0001/y, "a".repeat(n))).toBeGreaterThan(2*n);
        expect(steps(/[^\u0001]*\u0001/y, "a".repeat(n))).toBeLessThan(6*n);

        // a lookahead reads, past a match that takes nothing
        expect(steps(/(?=[^\u0001]*\u0001)/y, "a".repeat(n))).toBeGreaterThan(2*n);
    }, 60000);

    test("the same search counts the same", () => {
        const text = "abc=def ".repeat(1000);
        const re = /(\w+)=(\w+)\s/g;
        expect(regex_steps(re, text, 0).steps).toBe(regex_steps(re, text, 0).steps);
    });

    test("an expression that does not end stops at its limit", () => {
        expect(() => regex_steps(/(a|a)*b/, "a".repeat(40), 0, 1000000)).toThrow(/more than 1000000 steps/);
    });

    test.each([
        ["\\q{} matches strings", /[\q{abc}a]/v],
        ["an octal escape", /\07/],
        ["a backreference to no group", /\5/],
    ])("refuses what it cannot read: %s", (why, re) => {
        expect(() => regex_steps(re, "x", 0)).toThrow(/cannot be read/);
    });
});
