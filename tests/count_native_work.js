/***********************************************************************
 *          count_native_work.js
 *
 *      The work of what is not JavaScript of src/, added to the counter of
 *      count_work_plugin.js: the native functions it wraps, and what the
 *      language itself reads where it has a hook (not seen: the list
 *      below). For the tests that COUNT work
 *      (secret_masking_linear.test.js).
 *
 *      install_native_work_counting() wraps the native functions it
 *      reaches from the global object, the prototypes and the hidden ones
 *      (iterators, %TypedArray%) included, and what a later runtime adds
 *      to them, but for CONSTANT and NOT_WALKED. A wrapped native with no
 *      model here is charged ALL it is given: 1, plus the size of its
 *      receiver, of each argument and of its result. So a function nobody
 *      thought of counts as a read of what it was handed, which is an
 *      upper bound for every linear native: a rescan made of it shows,
 *      and it needs no entry here. The size of a string or an array-like
 *      is its length, of a buffer its bytes, of a Map or a Set its size,
 *      of any other object its keys.
 *
 *      The entries here are the exceptions, and each one lowers a charge:
 *      NATIVE_COST says what a native really reads (a search stops at
 *      what it found, a copy reads what it copies), and CONSTANT lists
 *      the natives taken to read no more than a position, which are not
 *      wrapped at all. A native wrongly left out of them is charged too
 *      much: the test goes red and names no rescan. A native wrongly IN
 *      CONSTANT or NOT_WALKED is charged nothing, and a rescan made of it
 *      does not show: the list "Not seen" below names those known.
 *
 *      A regular expression is counted step by step: exec() (which
 *      test() and replace(), match(), matchAll(), search() and split()
 *      with one all run) is charged what regex_steps.js counts for the
 *      same search, and its answer is compared with the native one, so
 *      backtracking, and what a failed attempt reads, count as they
 *      happen.
 *
 *      Installed by count_native_setup.js, in the vitest project of the
 *      counting tests, before src/ loads: a native that src/ keeps in a
 *      const at load is the wrapped one too. It stays installed for the
 *      life of that process, and nothing is charged outside
 *      with_native_work_counted(): the rest of the process runs the same
 *      functions, as they were.
 *
 *      What the language reads with no call comes through the hooks of
 *      count_work_plugin.js (work.read() and its kin, below): a string
 *      built with + or += is a rope, and its first read flattens it; a
 *      long string used as a key is hashed; two long strings compared are
 *      read; an object spread or a for-in lists the keys.
 *
 *      Not seen, and why:
 *      - the globals in NOT_WALKED: the machinery of the test, promises and
 *        streams (a masking returns its answer in the same call, so
 *        nothing of a promise or a stream can be part of its work), and
 *        Atomics, WebAssembly, Proxy, the Weak* (a WeakMap goes by identity
 *        and reads no text) and the message ports: a rescan made of one of
 *        them, such as port.postMessage(text), counts as linear;
 *      - what CONSTANT holds and does read more than a position, so a
 *        rescan made of it counts as linear: Object.hasOwn(),
 *        hasOwnProperty(), Reflect.has(), Reflect.get(),
 *        getOwnPropertyDescriptor() and any other of them given a long key
 *        (they flatten a rope and hash the key), Object.is() of two long
 *        strings, re.toString(), RegExp.prototype.compile() and
 *        Object.create(null, props);
 *      - Symbol.for() with a long text: Symbol is in NOT_WALKED;
 *      - a native of another realm (a vm context) or of a `node:` module,
 *        and code of a package: src/ imports none today. A hook sees
 *        src/ only, and the wrappers the globals only;
 *      - a native whose work is more than linear in what it is given,
 *        with no model here: the sorts have one (n log2 n) and a regular
 *        expression has its steps. Any other such native counts as linear;
 *      - `arr.length = n`, an object rest ({a, ...rest} = o), and the
 *        comparisons of a switch or of a search inside an array: they
 *        read with no call and no hook;
 *      - a computed key in an object literal or a pattern ({[k]: v}), and
 *        the coercion of a text to a number (+s, s == 5, s * 1): they read
 *        with no call and no hook either, and a rope stays unread;
 *      - what a call costs that has nothing to do with its size: the
 *        allocator, the collector, the cache. Those are the time, and
 *        secret_masking_time.test.js looks at them.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import * as vitest_globals from "vitest";
import { regex_steps } from "./regex_steps.js";

/*
 *  The counter of count_work_plugin.js
 */
const work = (globalThis.__gobj_js_work ??= {n: 0});

/*
 *  Taken when this module loads: the same functions are wrapped later
 */
const apply = Reflect.apply;
const construct = Reflect.construct;
const own_keys = Reflect.ownKeys;
const get_descriptor = Object.getOwnPropertyDescriptor;
const define_property = Object.defineProperty;
const get_prototype = Object.getPrototypeOf;
const object_keys = Object.keys;
const is_array = Array.isArray;
const is_view = ArrayBuffer.isView;
const NativeArrayBuffer = ArrayBuffer;
const NativeSharedArrayBuffer = SharedArrayBuffer;
const NativeRegExp = RegExp;
const NativeMap = Map;
const NativeSet = Set;
const native_index_of = {
    string: Function.prototype.call.bind(String.prototype.indexOf),
    array: Function.prototype.call.bind(Array.prototype.indexOf),
    typed: Function.prototype.call.bind(get_prototype(Uint8Array.prototype).indexOf),
};
const native_sub_string = Function.prototype.call.bind(String.prototype.substring);
const {trunc, min, max, ceil, log2} = Math;
const NativeNumber = Number;
const is_nan = Number.isNaN;

/*
 *  The state of the count: `counting` while with_native_work_counted()
 *  runs, `busy` while the code of this model does (what it calls is not
 *  the work counted)
 */
let counting = false;
let busy = false;

/*
 *  How many strings of each length + or += made and nothing has read yet.
 *  A string is no object, so a rope cannot be told by its identity: a
 *  read of any string of that length flattens one of them, so a text that
 *  only has the length of a rope is charged for it, which is too much and
 *  not too little. Under ROPE_MIN the flatten is bounded, and it is a
 *  constant of the operation. The ropes belong to one count: what a count
 *  leaves unread must not be charged to the next, so the same text counts
 *  the same whatever ran before it.
 */
const ROPE_MIN = 256;
let ropes = Object.create(null);
let n_ropes = 0;

function add_rope(s)
{
    if(s.length >= ROPE_MIN) {
        ropes[s.length] = (ropes[s.length] || 0) + 1;
        n_ropes++;
    }
}

function read_rope(s)
{
    if(ropes[s.length] > 0) {
        ropes[s.length]--;
        n_ropes--;
        work.n += s.length;
    }
}

function forget_ropes()
{
    ropes = Object.create(null);
    n_ropes = 0;
}

function read_ropes(self, args)
{
    if(typeof self === "string") {
        read_rope(self);
    }
    for(let i = 0; i < args.length; i++) {
        if(typeof args[i] === "string") {
            read_rope(args[i]);
        }
    }
}

/*
 *  What a value holds, shallow: see the header
 */
function size_of(v)
{
    if(typeof v === "string") {
        return v.length;
    }
    if(v === null || typeof v !== "object") {
        return 0;
    }
    if(is_array(v)) {
        return v.length;
    }
    if(is_view(v)) {
        return (v.length !== undefined)? v.length : v.byteLength;
    }
    if(v instanceof NativeArrayBuffer || v instanceof NativeSharedArrayBuffer) {
        return v.byteLength;
    }
    if(v instanceof NativeMap || v instanceof NativeSet) {
        return v.size;
    }
    if(typeof v.length === "number") {
        return v.length;
    }
    return object_keys(v).length;
}

/*
 *  What a value holds, deep, as structuredClone() copies it: a view
 *  carries all of its buffer
 */
function clone_size(v, seen)
{
    if(typeof v === "string") {
        return v.length;
    }
    if(v === null || typeof v !== "object" || seen.has(v)) {
        return 1;
    }
    seen.add(v);
    if(is_view(v)) {
        return v.buffer.byteLength;
    }
    if(v instanceof NativeArrayBuffer || v instanceof NativeSharedArrayBuffer) {
        return v.byteLength;
    }
    let sum = 1;
    const items = (v instanceof NativeMap || v instanceof NativeSet)? [...v] :
        object_keys(v).map((key) => v[key]);
    for(let i = 0; i < items.length; i++) {
        sum += clone_size(items[i], seen);
    }
    return sum;
}

/*
 *  An index argument of a method of an array or a typed array, as the
 *  method reads it: a negative one counts from the end
 */
function relative_index(n, value, otherwise)
{
    if(value === undefined) {
        return otherwise;
    }
    const i = trunc(NativeNumber(value) || 0);
    if(i < 0) {
        return max(0, n + i);
    }
    return min(i, n);
}

/*
 *  The work of a search forward, as positions read: from where it
 *  starts to the end of what it found, or to the end
 */
function search_cost(n, search_len, start, found)
{
    if(found < 0) {
        return n - start + 1;
    }
    return found - start + search_len + 1;
}

/*
 *  The work of a search backward: from where it starts to what it
 *  found, or to the beginning
 */
function search_back_cost(start, found)
{
    if(found < 0) {
        return start + 1;
    }
    return start - found + 1;
}

/*
 *  The work of a comparison sort of n elements with no comparator to
 *  count: n log2 n comparisons
 */
function sort_cost(n)
{
    return n * ceil(log2(n + 1)) + 1;
}

function string_start(s, a)
{
    return max(0, min(s.length, trunc(NativeNumber(a[1]) || 0)));
}

const made = (self, a, r) => r.length + 1;
const reads_all = (self, a, r) => size_of(self) + size_of(r) + 1;
const needle = (s, a) => String(a[0]).length + 1;
const one = () => 1;

/*
 *  What a search with a string or a regular expression does: a regular
 *  expression hands all of it to its exec(), which counts by itself
 */
const scan_with_pattern = (s, a) => ((a[0] instanceof NativeRegExp)? 1 : String(s).length + 1);

function array_costs(owner, index_of)
{
    const costs = {
        indexOf: (arr, a, r) => search_cost(arr.length, 1, relative_index(arr.length, a[1], 0), r),
        includes: (arr, a) => search_cost(arr.length, 1, relative_index(arr.length, a[1], 0),
            index_of(arr, a[0], a[1])),
        lastIndexOf: (arr, a, r) => search_back_cost(
            min(arr.length - 1, (a.length > 1)? relative_index(arr.length, a[1], 0) : arr.length - 1), r),
        fill: (arr, a) => relative_index(arr.length, a[2], arr.length) - relative_index(arr.length, a[1], 0) + 1,
        join: reads_all,
        slice: made,
    };
    for(const name in costs) {
        NATIVE_COST[`${owner}.${name}`] = costs[name];
    }
    for(const name of ["sort", "toSorted"]) {
        NATIVE_COST[`${owner}.${name}`] = (arr, a) => ((typeof a[0] === "function")? 1 : sort_cost(arr.length));
    }
}

/*
 *  What a native reads, where it is less than all it is given:
 *  (receiver, arguments, result, before) => work
 */
const NATIVE_COST = {
    "String.prototype.indexOf": (s, a, r) => search_cost(s.length, String(a[0]).length, string_start(s, a), r),
    "String.prototype.includes": (s, a) => search_cost(s.length, String(a[0]).length, string_start(s, a),
        native_index_of.string(s, a[0], a[1])),
    "String.prototype.lastIndexOf": (s, a, r) => {
        const from = NativeNumber(a[1]);
        const last = max(0, s.length - String(a[0]).length);
        const start = Number.isNaN(from)? last : max(0, min(last, trunc(from)));
        return search_back_cost(start, r) + String(a[0]).length;
    },
    "String.prototype.startsWith": needle,
    "String.prototype.endsWith": needle,
    "String.prototype.substring": made,
    "String.prototype.slice": made,
    "String.prototype.substr": made,
    "String.prototype.repeat": made,
    "String.prototype.padStart": made,
    "String.prototype.padEnd": made,
    "String.prototype.concat": (s, a, r) => {
        add_rope(r);
        return r.length - s.length + 1;
    },
    "String.prototype.replace": scan_with_pattern,
    "String.prototype.replaceAll": scan_with_pattern,
    "String.prototype.split": scan_with_pattern,
    "String.prototype.match": one,
    "String.prototype.matchAll": one,
    "String.prototype.search": one,

    "Array.prototype.push": (arr, a) => a.length + 1,
    "Array.prototype.unshift": (arr, a, r) => r + 1,
    "Array.prototype.shift": (arr) => arr.length + 1,
    "Array.prototype.splice": (arr, a) => arr.length - relative_index(arr.length, a[0], 0) + a.length + 1,
    "Array.prototype.concat": made,
    "Array.prototype.flat": made,
    "Array.prototype.toSpliced": made,
    "%TypedArray%.prototype.set": (arr, a) => size_of(a[0]) + 1,

    "Array Iterator.next": one,
    "String Iterator.next": one,
    "Map Iterator.next": one,
    "Set Iterator.next": one,
    "RegExp String Iterator.next": one,

    "Function.prototype.apply": (f, a) => size_of(a[1]) + 1,
    "Reflect.apply": (r, a) => size_of(a[2]) + 1,
    "Reflect.construct": (r, a) => size_of(a[1]) + 1,

    "Map.prototype.get": (m, a) => key_size(a[0]) + 1,
    "Map.prototype.set": (m, a) => key_size(a[0]) + 1,
    "Map.prototype.has": (m, a) => key_size(a[0]) + 1,
    "Map.prototype.delete": (m, a) => key_size(a[0]) + 1,
    "Set.prototype.add": (m, a) => key_size(a[0]) + 1,
    "Set.prototype.has": (m, a) => key_size(a[0]) + 1,
    "Set.prototype.delete": (m, a) => key_size(a[0]) + 1,

    "structuredClone": (r, a) => clone_size(a[0], new NativeSet()) + 1,
};
array_costs("Array.prototype", native_index_of.array);
array_costs("%TypedArray%.prototype", native_index_of.typed);

function key_size(key)
{
    return (typeof key === "string")? key.length : 0;
}

/*
 *  A constructor with a cost of its own: (arguments, made) => work
 */
function typed_array_cost(a, r)
{
    if(a[0] instanceof NativeArrayBuffer || a[0] instanceof NativeSharedArrayBuffer) {
        return 1;   // a view
    }
    return r.length + 1;
}

const CONSTRUCTOR_COST = {
    Int8Array: typed_array_cost,
    Uint8Array: typed_array_cost,
    Uint8ClampedArray: typed_array_cost,
    Int16Array: typed_array_cost,
    Uint16Array: typed_array_cost,
    Int32Array: typed_array_cost,
    Uint32Array: typed_array_cost,
    Float16Array: typed_array_cost,
    Float32Array: typed_array_cost,
    Float64Array: typed_array_cost,
    BigInt64Array: typed_array_cost,
    BigUint64Array: typed_array_cost,
    DataView: one,
};

/*
 *  Taken to read no more than a position. Not wrapped at all. Some do read
 *  more, given a long key or two long strings: the list of what is not seen
 *  names them. The readers of a string have a wrapper of their own, because
 *  they flatten a rope (STRING_READERS).
 */
const CONSTANT = new Set([
    "Array.isArray",
    "Array.prototype.at", "Array.prototype.pop", "Array.prototype.keys", "Array.prototype.values",
    "Array.prototype.entries", "Array.prototype[Symbol.iterator]",
    "%TypedArray%.prototype.at", "%TypedArray%.prototype.subarray", "%TypedArray%.prototype.keys",
    "%TypedArray%.prototype.values", "%TypedArray%.prototype.entries",
    "%TypedArray%.prototype[Symbol.iterator]",
    "ArrayBuffer.isView",
    "Buffer.prototype.subarray", "Buffer.prototype.slice",
    "Function.prototype.call", "Function.prototype.bind", "Function.prototype.toString",
    "Function.prototype[Symbol.hasInstance]",
    "Map.prototype.keys", "Map.prototype.values", "Map.prototype.entries", "Map.prototype[Symbol.iterator]",
    "Map.prototype.clear", "Set.prototype.keys", "Set.prototype.values", "Set.prototype.entries",
    "Set.prototype[Symbol.iterator]", "Set.prototype.clear",
    "Object.create", "Object.defineProperty", "Object.getOwnPropertyDescriptor", "Object.getPrototypeOf",
    "Object.setPrototypeOf", "Object.is", "Object.hasOwn", "Object.isExtensible", "Object.preventExtensions",
    "Object.prototype.hasOwnProperty", "Object.prototype.isPrototypeOf",
    "Object.prototype.propertyIsEnumerable", "Object.prototype.toString", "Object.prototype.valueOf",
    "Object.prototype.__defineGetter__", "Object.prototype.__defineSetter__",
    "Object.prototype.__lookupGetter__", "Object.prototype.__lookupSetter__",
    "Reflect.defineProperty", "Reflect.deleteProperty", "Reflect.get", "Reflect.getOwnPropertyDescriptor",
    "Reflect.getPrototypeOf", "Reflect.has", "Reflect.isExtensible", "Reflect.preventExtensions", "Reflect.set",
    "Reflect.setPrototypeOf",
    "RegExp.prototype.test", "RegExp.prototype.compile", "RegExp.prototype[Symbol.match]",
    "RegExp.prototype[Symbol.matchAll]", "RegExp.prototype[Symbol.replace]", "RegExp.prototype[Symbol.search]",
    "RegExp.prototype[Symbol.split]", "RegExp.prototype.toString",
    "String.prototype.charCodeAt", "String.prototype.codePointAt", "String.prototype.at",
    "String.prototype[Symbol.iterator]", "String.prototype.toString", "String.prototype.valueOf",
]);

/*
 *  What is not walked: the globals that are no data a text passes
 *  through, but the machinery the test runs on (a timer, the channel to
 *  the runner) or whose work is not done within a call (a stream, a
 *  promise). Inside a walked global, the classes with no state to read.
 */
const NOT_WALKED = new Set([
    "globalThis", "global", "process", "console", "undefined", "NaN", "Infinity",
    "Promise", "Proxy", "Symbol", "WeakRef", "WeakMap", "WeakSet", "FinalizationRegistry",
    "Boolean", "Atomics", "WebAssembly", "DisposableStack", "AsyncDisposableStack",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate",
    "queueMicrotask", "fetch", "WebSocket", "navigator", "Navigator", "performance", "Performance",
    "PerformanceEntry", "PerformanceMark", "PerformanceMeasure", "PerformanceObserver",
    "PerformanceObserverEntryList", "PerformanceResourceTiming",
    "Event", "EventTarget", "CustomEvent", "MessageEvent", "CloseEvent", "AbortController", "AbortSignal",
    "BroadcastChannel", "MessageChannel", "MessagePort", "DOMException",
    "ReadableStream", "ReadableStreamDefaultReader", "ReadableStreamBYOBReader", "ReadableStreamBYOBRequest",
    "ReadableByteStreamController", "ReadableStreamDefaultController", "WritableStream",
    "WritableStreamDefaultController", "WritableStreamDefaultWriter", "TransformStream",
    "TransformStreamDefaultController", "ByteLengthQueuingStrategy", "CountQueuingStrategy",
    "TextEncoderStream", "TextDecoderStream", "CompressionStream", "DecompressionStream",
]);

/*
 *  Called as functions they read nothing long (a primitive that already
 *  is one, a wrapper object): their statics and prototypes are walked,
 *  they themselves are not replaced.
 */
const NOT_REPLACED = new Set(["Object", "String"]);

/*
 *  A native that hands out a function from a getter
 */
const GETTERS_OF_FUNCTIONS = [
    ["Intl.Collator.prototype.compare", () => [Intl.Collator.prototype, "compare"]],
    ["Intl.NumberFormat.prototype.format", () => [Intl.NumberFormat.prototype, "format"]],
    ["Intl.DateTimeFormat.prototype.format", () => [Intl.DateTimeFormat.prototype, "format"]],
];

const count_calls = (cb) => function(...args) {
    if(counting) {
        work.n++;
    }
    return apply(cb, this, args);
};

/*
 *  The natives that call back: one for each call, a native callback
 *  included (an exempt one, Array.isArray, has no wrapper to count it)
 */
const CALLS_BACK = new Set();
for(const owner of ["Array.prototype", "%TypedArray%.prototype"]) {
    for(const name of ["forEach", "map", "filter", "some", "every", "find", "findIndex", "findLast",
                       "findLastIndex", "reduce", "reduceRight", "sort", "toSorted"]) {
        CALLS_BACK.add(`${owner}.${name}`);
    }
}
CALLS_BACK.add("Array.prototype.flatMap");
CALLS_BACK.add("Map.prototype.forEach");
CALLS_BACK.add("Set.prototype.forEach");

/************************************************************
 *  The answer of the native exec() must be the answer of the
 *  machine whose steps it is charged: it throws when they differ
 ************************************************************/
export function check_same_answer(re, text, model, result)
{
    let same = (result === null)? (model.index < 0) : (result.index === model.index &&
        result[0].length === model.end - model.index);
    for(let g = 0; same && result !== null && g < model.groups.length; g++) {
        const [from, to] = model.groups[g];
        same = (from < 0)? (result[g + 1] === undefined) :
            (result[g + 1] === native_sub_string(text, from, to));
    }
    if(!same) {
        throw new Error(`regex_steps.js and the native exec() disagree on ${re} ` +
            `(native ${result && result.index}, model ${model.index})`);
    }
}

function counted_exec(orig)
{
    return function(...args) {
        if(!counting || busy) {
            return apply(orig, this, args);
        }
        busy = true;
        let result;
        try {
            const text = String(args[0]);
            read_rope(text);
            const from = (this.global || this.sticky)? this.lastIndex : 0;
            const model = (from <= text.length)? regex_steps(this, text, from) :
                {steps: 1, index: -1, end: -1, groups: []};
            result = apply(orig, this, args);
            check_same_answer(this, text, model, result);
            work.n += model.steps;
        } finally {
            busy = false;
        }
        return result;
    };
}

/*
 *  A native, wrapped: `label` names it in NATIVE_COST and CALLS_BACK
 */
function counted_native(label, orig, is_method)
{
    const cost = NATIVE_COST[label];
    const calls_back = CALLS_BACK.has(label);
    const wrapped = function(...args) {
        if(!counting || busy) {
            return apply(orig, this, args);
        }
        if(calls_back && typeof args[0] === "function") {
            args[0] = count_calls(args[0]);
        }
        const result = apply(orig, this, args);
        busy = true;
        try {
            if(n_ropes > 0) {
                read_ropes(this, args);
            }
            if(cost) {
                work.n += cost(this, args, result);
            } else {
                let sum = 1 + (is_method? size_of(this) : 0) + size_of(result);
                for(let i = 0; i < args.length; i++) {
                    sum += size_of(args[i]);
                }
                work.n += sum;
            }
        } finally {
            busy = false;
        }
        return result;
    };
    return wrapped;
}

/*
 *  A constructor, or a function of the runtime written in JavaScript
 *  (it has a prototype too): charged called with `new` and called as a
 *  function, and a Proxy, so what is read from it stays as it was
 */
function counted_constructor(label, orig)
{
    const native_cost = NATIVE_COST[label];
    const cost = CONSTRUCTOR_COST[label] || (native_cost && ((a, r) => native_cost(null, a, r))) || ((a, r) => {
        let sum = 1 + size_of(r);
        for(let i = 0; i < a.length; i++) {
            sum += size_of(a[i]);
        }
        return sum;
    });
    const charge = (args, result) => {
        if(counting && !busy) {
            busy = true;
            try {
                work.n += cost(args, result);
            } finally {
                busy = false;
            }
        }
    };
    const counted = new Proxy(orig, {
        construct(target, args, new_target) {
            const result = construct(target, args, (new_target === counted)? target : new_target);
            charge(args, result);
            return result;
        },
        apply(target, self, args) {
            const result = apply(target, self, args);
            charge(args, result);
            return result;
        },
    });
    return counted;
}

function label_of(owner_label, key)
{
    if(typeof key === "symbol") {
        return `${owner_label}[${String(key).slice(7, -1)}]`;
    }
    return owner_label? `${owner_label}.${key}` : key;
}

function is_class(f)
{
    const d = get_descriptor(f, "prototype");
    return !!d && d.value !== null && (typeof d.value === "object" || typeof d.value === "function");
}

let n_wrapped = 0;

function wrap_function(label, owner, key, d, is_method)
{
    if(!d.configurable && !d.writable) {
        return;
    }
    const wrapped = (label === "RegExp.prototype.exec")? counted_exec(d.value) :
        counted_native(label, d.value, is_method);
    define_property(owner, key, {...d, value: wrapped});
    n_wrapped++;
}

function wrap_class(label, owner, key, d)
{
    const orig = d.value;
    wrap_namespace(label, orig, false);
    wrap_namespace(`${label}.prototype`, orig.prototype, true);
    if(NOT_REPLACED.has(label)) {
        return;
    }
    const counted = counted_constructor(label, orig);
    define_property(owner, key, {...d, value: counted});
    n_wrapped++;
    const c = get_descriptor(orig.prototype, "constructor");
    if(c && c.value === orig) {
        define_property(orig.prototype, "constructor", {...c, value: counted});
    }
}

function wrap_namespace(label, owner, is_method)
{
    for(const key of own_keys(owner)) {
        const d = get_descriptor(owner, key);
        if(key === "constructor" || key === "prototype" || !d || typeof d.value !== "function") {
            continue;
        }
        const name = label_of(label, key);
        if(CONSTANT.has(name)) {
            continue;
        }
        if(is_class(d.value)) {
            wrap_class(name, owner, key, d);
        } else {
            wrap_function(name, owner, key, d, is_method);
        }
    }
}

function wrap_string_readers()
{
    for(const name of ["charCodeAt", "codePointAt", "at", Symbol.iterator]) {
        const orig = String.prototype[name];
        const d = get_descriptor(String.prototype, name);
        define_property(String.prototype, name, {
            ...d,
            value(i) {
                if(n_ropes > 0 && counting && !busy) {
                    read_rope(String(this));
                }
                return orig.call(this, i);
            },
        });
        n_wrapped++;
    }
}

function wrap_getters_of_functions()
{
    for(const [label, where] of GETTERS_OF_FUNCTIONS) {
        const [owner, key] = where();
        const d = get_descriptor(owner, key);
        define_property(owner, key, {
            ...d,
            get() {
                return counted_native(label, apply(d.get, this, []), false);
            },
        });
        n_wrapped++;
    }
}

function wrap_hidden_prototypes()
{
    const typed_array = get_prototype(Uint8Array);
    wrap_namespace("%TypedArray%", typed_array, false);
    wrap_namespace("%TypedArray%.prototype", typed_array.prototype, true);
    const iterators = {
        "Array Iterator": [][Symbol.iterator](),
        "String Iterator": ""[Symbol.iterator](),
        "Map Iterator": new Map()[Symbol.iterator](),
        "Set Iterator": new Set()[Symbol.iterator](),
        "RegExp String Iterator": "".matchAll(/x/g),
        "Segment Iterator": new Intl.Segmenter().segment("")[Symbol.iterator](),
    };
    for(const name in iterators) {
        wrap_namespace(name, get_prototype(iterators[name]), true);
    }
    wrap_namespace("Segments", get_prototype(new Intl.Segmenter().segment("")), true);
}

function wrap_globals()
{
    for(const name of own_keys(globalThis)) {
        if(typeof name !== "string" || NOT_WALKED.has(name) || name.startsWith("__") ||
                name in vitest_globals) {
            continue;
        }
        const d = get_descriptor(globalThis, name);
        const value = globalThis[name];     // some are getters that load them
        const data = {configurable: true, writable: true, enumerable: d.enumerable, value};
        if(typeof value === "function") {
            if(is_class(value)) {
                wrap_class(name, globalThis, name, data);
            } else {
                wrap_function(name, globalThis, name, data, false);
            }
        } else if(typeof value === "object" && value !== null) {
            wrap_namespace(name, value, false);
        }
    }
}

/************************************************************
 *  Wrap every native: see the header. Once, for the life of
 *  the process. Return how many were wrapped.
 ************************************************************/
export function install_native_work_counting()
{
    if(n_wrapped > 0) {
        return n_wrapped;
    }
    wrap_hidden_prototypes();
    wrap_string_readers();
    wrap_getters_of_functions();
    wrap_globals();

    /*
     *  What the language reads with no call, from the hooks that
     *  count_work_plugin.js writes in the source. A comparison of two
     *  strings is two hooks, around its operands: `left` keeps the text
     *  that `same` or `order` compares with.
     */
    let left_text = null;
    const LONG_TEXT = 64;

    work.read = (o) => {
        if(n_ropes > 0 && typeof o === "string" && counting && !busy) {
            read_rope(o);
        }
        return o;
    };
    work.key = (k) => {
        if(typeof k === "string" && counting && !busy) {
            read_rope(k);
            work.n += k.length;
        }
        return k;
    };
    work.added = (r) => {
        if(typeof r === "string" && counting && !busy) {
            add_rope(r);
        }
        return r;
    };
    work.keys = (o) => {
        if(counting && !busy) {
            busy = true;
            work.n += size_of(o) + 1;
            busy = false;
        }
        return o;
    };
    work.left = (a) => {
        if(typeof a === "string" && a.length >= LONG_TEXT) {
            left_text = a;
        }
        return a;
    };
    work.same = (b) => {
        if(left_text !== null) {
            if(typeof b === "string" && b.length === left_text.length && counting && !busy) {
                read_rope(b);
                work.n += b.length;
            }
            left_text = null;
        }
        return b;
    };
    work.order = (b) => {
        if(left_text !== null) {
            if(typeof b === "string" && counting && !busy) {
                read_rope(b);
                work.n += min(b.length, left_text.length);
            }
            left_text = null;
        }
        return b;
    };
    return n_wrapped;
}

/************************************************************
 *  The work of the natives and of the language added to the
 *  counter while `fn` runs. Synchronous: nothing else can run.
 ************************************************************/
export function with_native_work_counted(fn)
{
    forget_ropes();
    counting = true;
    try {
        return fn();
    } finally {
        counting = false;
        forget_ropes();
    }
}
