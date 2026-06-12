# AGENTS.md — Get Fonts onboarding cheat-sheet

Persistent context for AI coding sessions. Verified against the source on 2026-06-13. Read this first; you should not need to re-scan the codebase or web-search the AE font API to start.

## Project overview

Get Fonts is a **bolt-cep + Vite + React 19 + TypeScript** CEP extension for **Adobe After Effects**. It detects the fonts genuinely missing in the open project and helps install them by downloading from **Google Fonts** (via an in-process Node HTTP server) and handing the file to the OS font installer.

The key subtlety the detector solves: `app.fonts.missingOrSubstitutedFonts` over-reports — it lists fonts that are actually installed and render fine (AE keeps a stale substitution record, e.g. from a duplicate PostScript name or a slightly different family name). The scan filters those out by checking the system's installed-fonts list (see Detection below), so the user only sees real problems. (A "re-map installed fonts" feature was prototyped and **removed** — see git history of `feature/remap-false-positive-fonts` and `Plans/`.)

Key identifiers:
- Bundle/extension ID: `com.aviramv.getfonts` (set in `cep.config.ts` and inlined into the compiled JSX as `config.id`).
- Host: After Effects only — `hosts: [{ name: "AEFT", version: "[24.0,99.9]" }]` (24.0 floor; see font API section).
- Panel size 340x600. CEP params include `--enable-nodejs` and `--mixed-context` (Node integration is required — see server + bridge below).
- `symlink: "local"` in `cep.config.ts` → bolt-cep auto-creates the symlink at `~/Library/Application Support/Adobe/CEP/extensions/com.aviramv.getfonts` → `dist/cep` during `vite`/dev. Manage manually with `npm run symlink` / `npm run delsymlink`.

## Architecture & key files

Two runtimes that talk over the CEP bridge:

### ExtendScript / host side (runs *inside* AE)
- `src/jsx/aeft/aeft.ts` — all host-side logic. **Source is TS but it is compiled to ES3** by rollup for AE's scripting engine, so authored code must stay ES3-compatible in spirit (the build down-levels `const`/`let`/arrows to `var`/function expressions — confirmed in `dist/cep/jsx/index.js`, which contains no `const`). Exports:
  - `getMissingFonts()` — the scan (see **Detection** below). Reads `app.fonts.missingOrSubstitutedFonts`, drops any whose normalized family+style is present in `app.fonts.allFonts` (installed), and attaches `Comp › Layer` locations via one cheap text-layer pass (`buildInstalledFontIndex`, `normalizeFontKey`, `attachLocations`).
  - `openFontFile`, `openDownloadedFile`, `revealFile` — hand a file to the OS (`open` on mac, `start`/`explorer` on Windows).
  - `writeTempFont(base64, fileName)` — writes a base64 font to temp (panel can't write files; Chromium sandbox). Has its own ES3 base64 decoder (`decodeBase64`, no `atob` in ExtendScript).
  - `showMissingFontsDialog()` → `app.executeCommand(4003)`; `browseAdobeFonts()` → `app.executeCommand(4017)`.
- `src/jsx/index.ts` — entry; includes `lib/json2.js` (JSON polyfill) and binds `aeft` exports onto `$[ns]` where `ns = config.id`.

### Panel / Chromium-CEP side (React)
- `src/js/main/main.tsx` — `App` component, all panel logic. On mount it **boots the Node server in-process** via CEP's built-in Node: `require(<extensionRoot>/server/server.cjs)`. Calls host functions via `evalTS("fnName", ...args)`. Owns scan and install (`triggerInstall` → `fetch` localhost server → `openFontFile`). Contains `readBridgeJson` (reads the temp file the host wrote), `summarizeScan`, and `bestFontUrl` (probes Google Fonts CSS API, then Adobe Fonts, then Google search). `FontStatus` is just `"missing" | "installing" | "installed"`.
- `src/js/main/FontList.tsx` — font list rows (install / find-online buttons, badge, `Comp › Layer` locations).
- `src/js/main/useUpdateCheck.ts` — polls GitHub Releases (`AviramV/GetFonts`) for a newer version; `isNewer` does numeric semver compare; dismissal persisted in `localStorage` under `getfonts.dismissedUpdateVersion`.
- `src/js/main/UpdateBanner.tsx`, `Tooltip.tsx`, `main.scss` — UI/styles.

### Shared / Node
- `src/shared/types.ts` — types crossing the bridge: `MissingFont`, `FontMatch` (`confidence: "exact" | "normalized"`), `GetMissingFontsResult` / `RemapResult` (both are `{ok:true; path} | {ok:false; error}` — note results carry a **file path**, not data), `RemapRequest`, `RemapOutcome`.
- `src/shared/shared.ts` — exports `ns` (= bundle id) used by `index.ts`.
- `src/server/server.cjs` — **Node HTTP server on port 7762** (CommonJS, run by CEP's built-in Node — no system Node needed). Routes: `GET /install?family=&style=` (resolves a Google Fonts file URL via the css2 API + a mobile UA, downloads it to `os.tmpdir()`, returns `{ok,path}`); `GET /download-update?url=&version=` (downloads a release `.zxp` to `~/Downloads`, host-allowlisted to github/githubusercontent). `EADDRINUSE` is swallowed so a second panel doesn't crash.

### Build config
- `cep.config.ts` — bolt-cep config (id, host, panel, ports, zxp signing). Debug/dev ports here: `port: 3000`, `servePort: 5000`, `startingDebugPort: 8860` (distinct from the font server's 7762).
- `vite.config.ts` — defines `__APP_VERSION__` from `package.json` version (used in the header + update check). `vite.es.config.ts` — the ExtendScript (ES3) rollup build.
- `tsconfig-build.json` — strict type-check run before builds.

## The CEP ↔ ExtendScript bridge (CRITICAL gotcha)

- `evalTS("fnName", ...args)` invokes an exported function in `aeft.ts` and returns its value to the panel. **Only JSON-serializable values/strings cross.** Live ExtendScript objects (e.g. `FontObject`) cannot — keep all font logic on the host side and return plain data.
- **Non-ASCII content gets corrupted/truncated by CEP's evalScript return channel** (`›`, arrows, curly quotes, native font names). This breaks `JSON.parse` in the panel.
- **The workaround (use this for any host→panel payload with possible non-ASCII):** the host serializes the value, escapes every char above U+007F to `\uXXXX` so the payload is **pure ASCII**, writes it to a temp file in `Folder.temp` with **`encoding = "BINARY"`** (UTF-8 `File.write` silently fails in AE's ExtendScript — one byte per char is exact for ASCII), and returns *only the file path*. The panel reads + `JSON.parse`s the file via Node `fs`. The escapes decode back to real chars on parse.
  - Host side: `writeAsciiJsonFile` / `toAsciiJson` in `aeft.ts` (`writeScanResult` goes through it → file `getfonts-scan.json`).
  - Panel side: `readBridgeJson<T>(path)` in `main.tsx` (`fs.readFileSync(path,"utf8")`, strips a leading BOM, `JSON.parse`).
  - NOTE: a few code comments still say "UTF-8 temp file" — the *actual* implementation is pure-ASCII + BINARY as described above. Trust the code, not the stale comment.

## Dev workflow / commands (from package.json)

- `npm run dev` → `vite` — HMR dev server; panel changes hot-reload, no manual AE reload.
- `npm run build` → `rimraf dist/* && tsc -p tsconfig-build.json && vite build --watch false` — type-check + production build to `dist/cep`. Compiled ExtendScript lands at `dist/cep/jsx/index.js`.
- `npm run zxp` → same as build but `ZXP_PACKAGE=true` — produces a signed `.zxp` in `dist/zxp/`.
- `npm run zip` → `ZIP_PACKAGE=true` build.
- `npm run serve` / `symlink` / `delsymlink` — preview panel / (un)install the dev symlink.
- `npm run bump <version> [--no-push] [--yes]` → `node scripts/bump.mjs` — validates a clean tree + `MAJOR.MINOR.PATCH` version, bumps `package.json`, commits, tags, and pushes. The pushed tag triggers `.github/workflows/main.yml` ("ZXP Release", trigger `*.*.*`), which runs `npm i --legacy-peer-deps` + `npm run zxp` on **windows-latest** and attaches `dist/zxp/*` to a GitHub Release.
- npm registry: a Wix internal registry is the org default; for public packages pass `--registry https://registry.npmjs.org`. `.npmrc` sets `legacy-peer-deps=true` (React 19 peer ranges).
- **Git:** feature/fix work goes on a dedicated `feature/<name>` or `fix/<name>` branch off `main` — never commit features directly to `main`.

## After Effects font scripting API (AE 24.0+) — external reference

These are hard to rediscover; documented so you don't have to web-search. Docs: <https://ae-scripting.docsforadobe.dev/text/fontsobject/>, <https://ae-scripting.docsforadobe.dev/text/fontobject/>.

- `app.fonts.missingOrSubstitutedFonts` — array of `FontObject`s flagged missing **or substituted**. ⚠️ **Over-reports**: it includes fonts that are actually installed and render fine (stale substitution records — duplicate PostScript names, or a project family string that differs from the installed one). It is NOT the same as AE's project-load "Unresolvable" dialog (which lists only genuinely-unresolvable fonts).
- `app.fonts.allFonts` — **Array of Arrays** (grouped by family) of all fonts installed on the system (AE 24.0+). `buildInstalledFontIndex` tolerates a bare FontObject per group too. This is the source of truth for "what's actually installed."
- `app.fonts.getFontsByFamilyNameAndStyleName(family, style)` and `app.fonts.getFontsByPostScriptName(ps)` — return arrays of `FontObject`s (AE 24.0+). Can return **multiple** instances for one query (an `isSubstitute:false` installed one + an `isSubstitute:true` stale record).
- `FontObject` props used: `familyName`, `styleName`, `fullName`, `postScriptName`, `location` (file path, may be ""), `isSubstitute` (true = a font reference that was missing on project open), `fontID` (24.2+).
- **Minimum AE is 24.0** (`cep.config.ts` host = `[24.0,99.9]`, `requiredRuntimeVersion: 11.0` — AE 24 ships CEP 11, AE 25 ships CEP 12; do not require 12). Detection depends on the `app.fonts` enumeration APIs introduced in 24.0, so the panel won't load below that.

### Detection rule (in `aeft.ts`) — how false positives are filtered
- `getMissingFonts` lists `missingOrSubstitutedFonts` deduped by family+style, then **drops any whose normalized family+style is present in `app.fonts.allFonts`** (`buildInstalledFontIndex`). Rationale: if the typeface is in the installed-fonts list — even under a slightly different name (project `"WixMadeforText"` vs installed `"Wix Madefor Text"`) — it's available and only flagged as a stale record, so it's not a real problem. What remains is genuinely missing.
- `normalizeFontKey(family, style)` = lowercase, strip to `[a-z0-9]`, collapse blank/Regular/Normal/Roman style to `regular`. Matching is per **family+style**, so e.g. Reddit Sans *Light* (installed) is filtered while Reddit Sans *Bold* (not installed) is kept.
- Locations come from `attachLocations`: **one cheap whole-doc pass** over text layers (`sourceText.value.fontFamily`/`fontStyle`, matched by `normalizeFontKey`). No per-character `characterRange` scan (deliberately removed for speed). Trade-off: a missing font that lives only in a *secondary run* of a mixed-font layer is still detected (it's in `missingOrSubstitutedFonts`) but its location points at the layer, not the exact characters. This is expected, not a bug — AE itself only shows mixed via the Properties→Text panel (dashes when the whole layer is selected), not the Character panel.

### AE command IDs used
- `app.executeCommand(4003)` — native "Find Missing Fonts" dialog.
- `app.executeCommand(4017)` — "Browse Adobe Fonts".
