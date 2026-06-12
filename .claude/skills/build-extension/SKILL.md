---
name: build-extension
description: Build a bolt-cep / CEP extension and sanity-check the compiled ExtendScript bundle for ES3 hazards that a green build does NOT catch (NUL-byte "Unterminated string constant" parse failures, exported host functions dropped from the bundle) and echo the manifest host/runtime. Use after editing ExtendScript (src/jsx), the panel, shared types, or cep.config.ts — before testing in the host app (After Effects, Premiere, Photoshop, etc.).
---

# Build & verify a CEP / ExtendScript bundle

After changing ExtendScript host code (`src/jsx/**`), the panel, shared types, or
`cep.config.ts`, build and then verify the compiled output before testing in the
host application. The ExtendScript bundle has silent failure modes that a successful
`npm run build` does NOT surface (it's valid JS; ExtendScript's ES3 parser is stricter).

## Steps

1. Build (uses the project's build script):

   ```
   npm run build
   ```

2. Verify the compiled ExtendScript bundle, passing the names of any host functions
   you just added/changed so the script asserts they actually made it into the bundle:

   ```
   bash .claude/skills/build-extension/verify-jsx.sh [funcName ...]
   ```

   Example: `bash .claude/skills/build-extension/verify-jsx.sh getMissingFonts remapFonts`.
   With no args it still runs the universal checks (NUL bytes, ES3 down-level,
   manifest). Defaults to the bolt-cep layout; override with `JSX_PATH` /
   `MANIFEST_PATH`. Exit 0 = safe to test. Non-zero = a problem that would break
   loading in the host — fix before handing off.

3. Report the result, then remind the user that **CEP caches ExtendScript per host
   session**: they must fully **quit & relaunch the host app** to load the new build.
   Reopening the panel alone keeps the old cached script.

## Why these checks exist (general CEP/ExtendScript gotchas)

- **NUL byte → whole-file parse failure.** A `\x00` in any string literal makes
  ExtendScript throw *"Unable to execute script at line N. Unterminated string
  constant"* and refuse to parse the entire file — so the host silently keeps running
  the previously cached script. A NUL can slip into a string literal from a bad edit.
- **`grep` reads the minified bundle as binary.** Plain `grep symbol bundle.js`
  prints nothing even when the symbol is present, which looks like "the build dropped
  it." The script uses `grep -a` and auto-derives the expected exports from the source
  (`export const`/`export function` in `src/jsx`).
- **ES3 down-level.** ExtendScript has no `const`/`let`/arrow functions; a stray one
  in the bundle signals the down-level step didn't run on some input.
