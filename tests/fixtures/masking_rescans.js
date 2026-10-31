/***********************************************************************
 *          masking_rescans.js
 *
 *      What a masking must not do, and what it may: each entry is work
 *      that secret_masking_linear.test.js adds to a masking, to see that
 *      the count catches a rescan however it is made, and leaves a linear
 *      work alone. count_work_plugin.js counts this file as it counts
 *      src/, because a rescan in src/ would look like this.
 *
 *      RESCANS are quadratic: each one reads the text, or `u8` (bytes of
 *      the same length, as the marks of the masking), from one position
 *      in `k` to the end, by the means its name says. SORTS sort as many
 *      numbers as the text has characters. LINEAR_WORKS read the text a
 *      fixed number of times.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

const SLICE = 65536;    // what one call takes as arguments

/*
 *  One read from each start: `read(start)`
 */
function from_each_start(text, k, read)
{
    for(let start = 0; start < text.length; start += k) {
        read(start);
    }
}

/*
 *  The same read in slices, from each start: `read(slice)`, a view of `u8`
 */
function in_slices(u8, k, read, slice = SLICE)
{
    from_each_start(u8, k, (start) => {
        for(let q = start; q < u8.length; q += slice) {
            read(u8.subarray(q, q + slice));
        }
    });
}

/*
 *  A text with the same characters, no shared string
 */
function other_copy(text)
{
    return text.split("").join("");
}

/*
 *  An object with as many keys as the text has characters / 16
 */
function object_of(text)
{
    const o = {};
    for(let i = 0; i < text.length; i += 16) {
        o[`k${i}`] = i;
    }
    return o;
}

export const RESCANS = {
    /*
     *  Natives with a model of what they read
     */
    "String indexOf()": (text, u8, k) => from_each_start(text, k, (p) => text.indexOf("\u0001", p)),
    "String substring()": (text, u8, k) => from_each_start(text, k, (p) => text.substring(p).length),
    "String search()": (text, u8, k) => from_each_start(text, k, () => text.search("\u0001")),
    "String match()": (text, u8, k) => from_each_start(text, k, () => text.match("\u0001")),
    "typed array indexOf()": (text, u8, k) => from_each_start(text, k, (p) => u8.indexOf(2, p)),
    "typed array slice()": (text, u8, k) => from_each_start(text, k, (p) => u8.slice(p).length),
    "Array shift()": (text, u8, k) => {
        const a = Array.from(u8);
        from_each_start(text, k, () => a.shift());
    },
    "a JS loop": (text, u8, k) => from_each_start(text, k, (p) => {
        let sum = 0;
        for(let q = p; q < u8.length; q++) {
            sum += u8[q];
        }
        return sum;
    }),

    /*
     *  A native call that takes an array-like reads it
     */
    "Math.max.apply()": (text, u8, k) => in_slices(u8, k, (s) => Math.max.apply(null, s)),
    "Reflect.apply()": (text, u8, k) => in_slices(u8, k, (s) => Reflect.apply(Math.max, null, s)),
    "Reflect.construct()": (text, u8, k) => in_slices(u8, k, (s) => Reflect.construct(Object, s), SLICE/2),
    "a spread into a call": (text, u8, k) => in_slices(u8, k, (s) => Math.max(...s)),
    "String.fromCharCode.apply()": (text, u8, k) => in_slices(u8, k, (s) => String.fromCharCode.apply(null, s)),
    "new u8.constructor()": (text, u8, k) => from_each_start(text, k, (p) => new u8.constructor(u8.subarray(p))),
    "Uint8Array.from()": (text, u8, k) => from_each_start(text, k, (p) => Uint8Array.from(u8.subarray(p))),
    "a Set of an array-like": (text, u8, k) => in_slices(u8, k, (s) => new Set(s)),

    /*
     *  Natives no list names: what they are given is read
     */
    "structuredClone() of a view": (text, u8, k) => from_each_start(text, k, () => structuredClone(u8.subarray(0, 8))),
    "structuredClone() of the text": (text, u8, k) => from_each_start(text, k, () => structuredClone(text)),
    "Intl.Collator().compare()": (text, u8, k) => {
        const collator = new Intl.Collator();
        const copy = other_copy(text);
        from_each_start(text, k, () => collator.compare(text, copy));
    },
    "Intl.Segmenter().segment()": (text, u8, k) => {
        const segmenter = new Intl.Segmenter();
        from_each_start(text, k, () => segmenter.segment(text));
    },
    "localeCompare()": (text, u8, k) => {
        const copy = other_copy(text);
        from_each_start(text, k, () => text.localeCompare(copy));
    },
    "Buffer.from()": (text, u8, k) => from_each_start(text, k, () => Buffer.from(text)),
    "new URLSearchParams()": (text, u8, k) => from_each_start(text, k, () => new URLSearchParams(text)),
    "new Blob()": (text, u8, k) => from_each_start(text, k, () => new Blob([text])),
    "parseFloat()": (text, u8, k) => from_each_start(text, k, () => parseFloat(text)),
    "text.anchor()": (text, u8, k) => from_each_start(text, k, () => text.anchor("x")),
    "text.toWellFormed()": (text, u8, k) => from_each_start(text, k, () => text.toWellFormed()),
    "u8.values().toArray()": (text, u8, k) => from_each_start(text, k, () => u8.values().toArray()),
    "Object.keys()": (text, u8, k) => {
        const o = object_of(text);
        from_each_start(text, k, () => Object.keys(o));
    },
    "Reflect.ownKeys()": (text, u8, k) => {
        const o = object_of(text);
        from_each_start(text, k, () => Reflect.ownKeys(o));
    },
    "Object.groupBy()": (text, u8, k) => from_each_start(text, k, () => Object.groupBy(u8, (v) => v)),

    /*
     *  A Map or a Set hashes a long key, and a new string has no hash yet.
     *  The text keeps its hash, so a second read of it costs nothing: the
     *  count charges it all the same, as it cannot tell one from the other.
     */
    "Map with a long key": (text, u8, k) => from_each_start(text, k, (p) => new Map().set(p + text, 1)),
    "Set with a long key": (text, u8, k) => from_each_start(text, k, (p) => new Set().add(p + text)),
    "Map with the text as a key": (text, u8, k) => from_each_start(text, k, () => new Map().set(text, 1)),
    "Set with the text as a key": (text, u8, k) => from_each_start(text, k, () => new Set().add(text)),

    /*
     *  Regular expressions: what backtracks in one call, a failed sticky
     *  attempt, a lookahead to the end
     */
    "one regular expression that backtracks": (text, u8, k) => {
        /[^\u0001]*\u0001/.test(text.substring(0, Math.floor(text.length / Math.sqrt(k))));
    },
    "a sticky expression that fails": (text, u8, k) => {
        const re = /[^\u0001]*\u0001/y;
        from_each_start(text, k, (p) => {
            re.lastIndex = p;
            return re.test(text);
        });
    },
    "a lookahead to the end": (text, u8, k) => {
        const re = /(?=[^\u0001]*\u0001)/y;
        from_each_start(text, k, (p) => {
            re.lastIndex = p;
            return re.test(text);
        });
    },

    /*
     *  What the language reads with no call
     */
    "+= then charCodeAt()": (text, u8, k) => {
        let s = "";
        let sum = 0;
        for(let i = 0; i < text.length; i++) {
            s += text[i];
            if(i % k === 0) {
                sum += s.charCodeAt(i >> 1);
            }
        }
        return sum;
    },
    "+= then s[i]": (text, u8, k) => {
        let s = "";
        let sum = 0;
        for(let i = 0; i < text.length; i++) {
            s += text[i];
            if(i % k === 0) {
                sum += s[i >> 1].length;
            }
        }
        return sum;
    },
    "+ then charCodeAt()": (text, u8, k) => from_each_start(text, k, (p) => (p + text).charCodeAt(0)),
    "+= then a spread": (text, u8, k) => from_each_start(text, k, (p) => [...(p + text)].length),
    "a template then indexOf()": (text, u8, k) => from_each_start(text, k, (p) => `${p}${text}`.indexOf("x")),
    "=== of two long strings": (text, u8, k) => {
        const copy = other_copy(text);
        from_each_start(text, k, () => text === copy);
    },
    "< of two long strings": (text, u8, k) => {
        const copy = other_copy(text);
        from_each_start(text, k, () => text < copy);
    },
    "a long key of an object": (text, u8, k) => {
        const o = {};
        from_each_start(text, k, (p) => o[p + text]);
    },
    "in with a long key": (text, u8, k) => {
        const o = {};
        from_each_start(text, k, (p) => (p + text) in o);
    },
    "an object spread": (text, u8, k) => {
        const o = object_of(text);
        from_each_start(text, k, () => ({...o}));
    },
    "a for-in that stops": (text, u8, k) => {
        const o = object_of(text);
        from_each_start(text, k, () => {
            for(const key in o) {
                return key;
            }
            return null;
        });
    },
};

/*
 *  n numbers in no order, always the same
 */
function numbers_of(n)
{
    const numbers = new Float64Array(n);
    let x = 1;
    for(let i = 0; i < n; i++) {
        x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
        numbers[i] = x;
    }
    return numbers;
}

/*
 *  An O(n log n) step after the masking: not a rescan, and not linear
 */
export const SORTS = {
    "a sort with a comparator": (text) => Array.from(numbers_of(text.length)).sort((a, b) => a - b),
    "Float64Array's sort()": (text) => numbers_of(text.length).sort(),
};

export const LINEAR_WORKS = {
    "while(re.exec(text))": (text) => {
        const re = /=/g;
        while(re.exec(text)) {
            continue;
        }
    },
    "text.split(/=/)": (text) => text.split(/=/),
    "text.replace(/=/g, fn)": (text) => text.replace(/=/g, (m) => m),
    "text.matchAll(/=/g)": (text) => {
        for(const m of text.matchAll(/=/g)) {
            m.index;
        }
    },
    "text.replaceAll()": (text) => text.replaceAll("=", "="),
    "a sticky tokenizer": (text) => {
        const re = /[a-z]{1,8}|[^a-z]/y;
        while(re.lastIndex < text.length && re.test(text)) {
            continue;
        }
    },
    "an unbounded run with one way in": (text) => text.replace(/=+/g, "="),
    "words": (text) => text.match(/\w+/g),
    "a copy of the bytes": (text, u8) => u8.slice(),
    "a Set of the characters": (text) => new Set(text),
    "+= with one read at the end": (text) => {
        let s = "";
        for(let i = 0; i < text.length; i++) {
            s += text[i];
        }
        return s.charCodeAt(0);
    },
    "a Map of short keys": (text) => {
        const m = new Map();
        for(let i = 0; i < text.length; i++) {
            m.set(text[i], i);
        }
    },
};
