import { defineConfig } from "vite";
import terser from "@rollup/plugin-terser";
import { configDefaults } from "vitest/config";

/*  Whether this run measures coverage (`vitest --coverage`, the
 *  `test:coverage` script). The instrumentation makes every line some ten
 *  times slower, so a test that TIMES something reads it -- inject("coverage")
 *  -- and widens its limit.  */
const coverage = process.argv.some((arg) => arg === "--coverage" || arg.startsWith("--coverage."));

/*  The test files that TIME what they check. They run in a group of their
 *  own (`sequence.groupOrder`), after every other file has ended, so the
 *  other files of a parallel run do not compete for the CPU while they
 *  measure.  */
const TIMED_TESTS = ["tests/secret_masking_linear.test.js"];

export default defineConfig({
    /*  At the top level: nested in `build` (where it was) vitest never
     *  read it.  */
    test: {
        globals: true,  // Use global `describe` and `test` like Jest
        environment: "node",  // Use Node.js or browser as test environment
        coverage: {
            reporter: ["text", "json", "html"],  // Test coverage output
        },
        provide: {
            coverage: coverage,
        },
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    exclude: [...configDefaults.exclude, ...TIMED_TESTS],
                    sequence: {groupOrder: 0},
                },
            },
            {
                extends: true,
                test: {
                    name: "timed",
                    include: TIMED_TESTS,
                    sequence: {groupOrder: 1},
                },
            },
        ],
    },
    build: {
        lib: {
            entry: "src/index.js",
            name: "gobjJs"
        },
        rollupOptions: {
            checks: {
                pluginTimings: false
            },
            output: [
                // Non-minified ES Module
                {
                    format: "es",
                    dir: "dist",
                    entryFileNames: "gobj-js.es.js",
                },
                // Non-minified UMD Module
                {
                    name: "gobjJs",
                    format: "umd",
                    dir: "dist",
                    entryFileNames: "gobj-js.umd.js",
                },
                // Non-minified CJS Module
                {
                    name: "gobjJs",
                    format: "cjs",
                    dir: "dist",
                    entryFileNames: "gobj-js.cjs.js",
                },
                // Non-minified IIFE Module
                {
                    name: "gobjJs",
                    format: "iife",
                    dir: "dist",
                    entryFileNames: "gobj-js.iife.js",
                },

                // Minified ES Module
                {
                    format: "es",
                    dir: "dist",
                    entryFileNames: "gobj-js.es.min.js",
                    plugins: [terser()] // ✅ Minified version
                },
                // Minified UMD Module
                {
                    name: "gobjJs",
                    format: "umd",
                    dir: "dist",
                    entryFileNames: "gobj-js.umd.min.js",
                    plugins: [terser()]
                },
                // Minified CJS Module
                {
                    name: "gobjJs",
                    format: "cjs",
                    dir: "dist",
                    entryFileNames: "gobj-js.cjs.min.js",
                    plugins: [terser()]
                },
                // Minified IIFE Module
                {
                    name: "gobjJs",
                    format: "iife",
                    dir: "dist",
                    entryFileNames: "gobj-js.iife.min.js",
                    plugins: [terser()]
                }
            ]
        },
        sourcemap: true,
        minify: false, // ✅ Disable Vite’s default minification
        target: "esnext" // ✅ Prevent unnecessary transpilation
    }
});
