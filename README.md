# Get Fonts

A CEP panel for **Adobe After Effects** that finds the fonts missing from your project and helps you install them — without leaving the app (preferably).

Missing fonts in your project can be easy to miss, a pain to deal with, and a hassle to retrieve. Get Fonts scans the project, lists every missing font, and installs them with a single click (sometimes two).

## Features

- **Project Scan** — lists the fonts genuinely missing in the current project, and tells you which comps use each. Fonts that After Effects flags but are actually installed (often under a slightly different name) are filtered out, so you don't chase false positives.
- **Install all** — queues every missing font and attempts to directly install them in sequence.
- **Selective Install** — downloads the font and hands it to your OS font installer (Font Book on macOS, the font installer on Windows). If a font can't be installed automatically, the panel links you to the source instead.
- **Find online** – direct link to the fonts' web page (new browser tab).
- **Native AE shortcuts** — buttons to open After Effects' built-in _Find Missing Fonts_ view in the project panel, and to browse Adobe Fonts.
- **Update notifications** — a banner appears in the panel when a newer release is available.

## Requirements

- Adobe After Effects 24.0 or newer (2024+). Detection relies on the scripting font APIs (`app.fonts`) introduced in AE 24.0.
- macOS or Windows.

## Installation

1. Download the latest `.zxp` from the [Releases](https://github.com/AviramV/GetFonts/releases) page.
2. Install it with a ZXP installer such as [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) or [Anastasiy's Extension Manager](https://install.anastasiy.com/).
3. Restart After Effects

## Usage

1. Open the panel via **Window → Extensions → Get Fonts**.
2. Click **Scan Project**.
3. For each missing font, click **Install**, or **Install All** to do them all at once.

## Development

This extension is built with [bolt-cep](https://github.com/hyperbrew/bolt-cep) (Vite + React 19 + TypeScript).

```bash
npm install            # install dependencies
npm run build          # build into `dist/`
npm run dev            # start the Vite dev server with HMR
```

On first run the dev workflow symlinks `dist/cep` into the CEP extensions folder, so changes hot-reload directly in After Effects.

### Useful scripts

| Script                   | Description                                                   |
| ------------------------ | ------------------------------------------------------------- |
| `npm run build`          | Production build into `dist/`.                                |
| `npm run dev`            | Start the Vite dev server with hot reloading.                 |
| `npm run zxp`            | Build and package a signed `.zxp` for distribution.           |
| `npm run zip`            | Build and package a `.zip`.                                   |
| `npm run bump <version>` | Bump the version, commit, tag, and push to trigger a release. |

### Releasing

Releases are automated via GitHub Actions. Pushing a `MAJOR.MINOR.PATCH` tag builds a signed `.zxp` and publishes it as a GitHub Release:

```bash
npm run bump 1.0.1
```

This bumps `package.json`, commits, tags, and pushes — the [ZXP Release workflow](.github/workflows/main.yml) does the rest.

## Project structure

```
src/
  js/main/        React UI (panel)
  jsx/aeft/       ExtendScript that talks to the After Effects DOM
  server/         Node helper for downloading/installing fonts
cep.config.ts     CEP panel configuration (bolt-cep)
```

## License

[MIT](LICENSE) © Aviram Vered
