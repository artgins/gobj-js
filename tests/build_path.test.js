/***********************************************************************
 *          build_path.test.js
 *
 *      build_path() mirrors the C build_path() of gobj-c: the cases
 *      pinned here are the ones of tests/c/build_path/test_build_path.c
 *      that have a meaning without a C buffer.
 *
 *      Up to 7.28.1 a first segment made only of '/' was lost
 *      (("/", "tmp") gave the relative "tmp"), and '.' / '..' of the
 *      later segments were kept as they came, so ("/", "..", "etc") gave
 *      "../etc". The first segment is the root, as in C: kept, and
 *      never risen above.
 ***********************************************************************/
import { describe, test, expect } from "vitest";

import { build_path } from "../src/helpers.js";


describe("build_path: joins", () => {
    test.each([
        [["/var", "log", "app"],                "/var/log/app"],
        [["realms", "owner", "id"],             "realms/owner/id"],
        [["/only"],                             "/only"],
        [["/a/", "b/"],                         "/a/b"],
        [["/r", "a//b"],                        "/r/a/b"],
        [["", "a", "", "b"],                    "a/b"],
        [["base", "outputs/yunos", "src"],      "base/outputs/yunos/src"],
        [["https://bff.example.com:1800", "auth", "login"], "https://bff.example.com:1800/auth/login"],
        [["https://bff.example.com/", "/auth/", "/login"],  "https://bff.example.com/auth/login"],
    ])("%j -> %s", (segments, expected) => {
        expect(build_path(...segments)).toBe(expected);
    });
});

describe("build_path: null, undefined and empty segments are skipped", () => {
    test.each([
        [[null, "a", undefined, "b"],           "a/b"],
        [[],                                    ""],
        [[null, undefined, ""],                 ""],
        [["/a", "/", "b"],                      "/a/b"],
        [[1, 2],                                "1/2"],
    ])("%j -> %s", (segments, expected) => {
        expect(build_path(...segments)).toBe(expected);
    });
});

describe("build_path: a root made only of '/' is kept", () => {
    test.each([
        [["/", "tmp"],                          "/tmp"],
        [["//", "/tmp/", "x"],                  "/tmp/x"],
        [["/"],                                 "/"],
        [["///"],                               "/"],
        [[null, "/", "tmp"],                    "/tmp"],
    ])("%j -> %s", (segments, expected) => {
        expect(build_path(...segments)).toBe(expected);
    });
});

describe("build_path: '.' and '..' never rise above the first segment", () => {
    test.each([
        [["/var", "log", ".", "app"],           "/var/log/app"],
        [["a", "b/../c"],                       "a/c"],
        [["/root", "a", "..", "b"],             "/root/b"],
        [["/a/b", "c", ".."],                   "/a/b"],
        [["/yuneta/store", "../../etc/passwd"], "/yuneta/store/etc/passwd"],
        [["realms", "../../x"],                 "realms/x"],
        [["/store", "..", ".."],                "/store"],
        [["/data", "a/../../../b"],             "/data/b"],
        [["/", "..", "etc"],                    "/etc"],
        [[".", ".."],                           "."],
    ])("%j -> %s", (segments, expected) => {
        expect(build_path(...segments)).toBe(expected);
    });
});
