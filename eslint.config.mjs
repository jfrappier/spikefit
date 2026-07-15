// SpikeFit ESLint flat config
// Used by: Codacy cloud (root discovery), Codacy CLI (.codacy/tools-configs mirrors this)
//
// Why browser globals are listed explicitly: no npm, so the `globals` package is unavailable.
// Why sourceType:"script": all browser JS files are plain scripts loaded via <script defer>.
//   Top-level declarations are global-scope exports; sourceType:"module" would misidentify them
//   as module-scope locals and trigger false no-unused-vars on every cross-file global.
// Why vars:"local" on no-unused-vars: only catch unused locals inside functions; skip
//   top-level declarations since those are the project's cross-file export mechanism.
// Why varsIgnorePattern:"^_": conventional _ prefix marks intentionally unused variables.

// ─── Browser environment globals ─────────────────────────────────────────────
const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    history: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    console: 'readonly',
    confirm: 'readonly',
    alert: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    fetch: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    FileReader: 'readonly',
    File: 'readonly',
    Blob: 'readonly',
    Image: 'readonly',
    ClipboardItem: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    Headers: 'readonly',
    crypto: 'readonly',
    HTMLElement: 'readonly',
    Element: 'readonly',
    Event: 'readonly',
    CustomEvent: 'readonly',
    performance: 'readonly',
    self: 'readonly',
    addEventListener: 'readonly',
};

// ─── SpikeFit cross-file app globals ─────────────────────────────────────────
// Global-scope JS uses load order as the dependency graph (no import/export).
// When a new cross-file global is added, add it here.
const appGlobals = {
    // workouts.js → app.js
    workouts: 'readonly',
    schedule: 'readonly',
    // app.js → combine.js, storage.js
    safeParseJSON: 'readonly',
    showToast: 'readonly',
    runPostOnboardingChecks: 'readonly',
    // combine.js → app.js
    checkCombineBaseline: 'readonly',
    checkCombineRetest: 'readonly',
    // storage.js → app.js
    checkStorageChoice: 'readonly',
    shouldShowBackupNudge: 'readonly',
    showBackupNudge: 'readonly',
};

const scriptRules = {
    "constructor-super": ["error"],
    "for-direction": ["error"],
    "getter-return": ["error", {"allowImplicit": false}],
    "no-async-promise-executor": ["error"],
    "no-case-declarations": ["error"],
    "no-class-assign": ["error"],
    "no-compare-neg-zero": ["error"],
    "no-cond-assign": ["error", "except-parens"],
    "no-constant-condition": ["error", {"checkLoops": true}],
    "no-const-assign": ["error"],
    "no-control-regex": ["error"],
    "no-debugger": ["error"],
    "no-delete-var": ["error"],
    "no-dupe-args": ["error"],
    "no-dupe-class-members": ["error"],
    "no-dupe-else-if": ["error"],
    "no-dupe-keys": ["error"],
    "no-duplicate-case": ["error"],
    "no-empty": ["error", {"allowEmptyCatch": false}],
    "no-empty-character-class": ["error"],
    "no-empty-pattern": ["error", {"allowObjectPatternsAsParameters": false}],
    "no-ex-assign": ["error"],
    "no-extra-boolean-cast": ["error", {"enforceForLogicalOperands": false}],
    "no-extra-semi": ["error"],
    "no-fallthrough": ["error", {"allowEmptyCase": false}],
    "no-func-assign": ["error"],
    "no-global-assign": ["error"],
    "no-import-assign": ["error"],
    "no-inner-declarations": ["error", "functions"],
    "no-invalid-regexp": ["error"],
    "no-irregular-whitespace": ["error", {"skipComments": false, "skipJSXText": false, "skipRegExps": false, "skipStrings": true, "skipTemplates": false}],
    "no-loss-of-precision": ["error"],
    "no-misleading-character-class": ["error"],
    "no-mixed-spaces-and-tabs": ["error"],
    "no-new-symbol": ["error"],
    "no-nonoctal-decimal-escape": ["error"],
    "no-obj-calls": ["error"],
    "no-octal": ["error"],
    "no-prototype-builtins": ["error"],
    "no-redeclare": ["error", {"builtinGlobals": false}],
    "no-regex-spaces": ["error"],
    "no-self-assign": ["error", {"props": true}],
    "no-setter-return": ["error"],
    "no-shadow-restricted-names": ["error"],
    "no-sparse-arrays": ["error"],
    "no-this-before-super": ["error"],
    "no-undef": ["error", {"typeof": false}],
    "no-unexpected-multiline": ["error"],
    "no-unreachable": ["error"],
    "no-unsafe-finally": ["error"],
    "no-unsafe-negation": ["error", {"enforceForOrderingRelations": false}],
    "no-unsafe-optional-chaining": ["error", {"disallowArithmeticOperators": false}],
    "no-unused-labels": ["error"],
    // vars:"local" + varsIgnorePattern:"^_" — skip top-level (cross-file exports) and
    // underscore-prefixed variables (intentionally unused by convention).
    "no-unused-vars": ["error", {"vars": "local", "varsIgnorePattern": "^_"}],
    "no-useless-backreference": ["error"],
    "no-useless-catch": ["error"],
    "no-useless-escape": ["error"],
    "no-with": ["error"],
    "require-yield": ["error"],
    "use-isnan": ["error", {"enforceForIndexOf": false, "enforceForSwitchCase": true}],
    "valid-typeof": ["error", {"requireStringLiterals": false}],
};

export default [
    // ── All project JS files (plain scripts, not ES modules) ──────────────────
    {
        files: ["**/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: {
                ...browserGlobals,
                ...appGlobals,
            },
        },
        rules: scriptRules,
    },
    // ── Cloudflare Worker: ES module with Worker-specific globals ─────────────
    {
        files: ["cloudflare/**/*.js"],
        languageOptions: {
            sourceType: "module",
        },
    },
    // ── Unit tests: add QUnit global ──────────────────────────────────────────
    {
        files: ["tests/unit/**/*.js"],
        languageOptions: {
            globals: {
                QUnit: 'readonly',
            },
        },
    },
];
