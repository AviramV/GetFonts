// ExtendScript functions for After Effects font detection and management.
// Compiled to ES3 by rollup for the AE scripting engine.

import type { MissingFont, GetMissingFontsResult } from "../../shared/types";

/**
 * Detects missing/substituted fonts in the open AE project.
 *
 * Primary path: app.fonts.missingOrSubstitutedFonts (AE 22+, fast — no layer traversal).
 * Fallback: full layer scan checking textDoc.fontLocation === "" (all AE versions).
 * After getting the font list, runs a targeted scan to find which comp/layer uses each.
 */
export const getMissingFonts = (): GetMissingFontsResult => {
  try {
    if (!app.project) {
      return { ok: false, error: "No project is open." };
    }

    let missingFontNames: { name: string; style: string; postScriptName: string }[] = [];

    // Primary: native AE API (AE 22+)
    try {
      //@ts-ignore — app.fonts may not be typed in older types-for-adobe
      const nativeMissing: any[] = app.fonts.missingOrSubstitutedFonts;
      if (Array.isArray(nativeMissing)) {
        for (let i = 0; i < nativeMissing.length; i++) {
          const f = nativeMissing[i];
          missingFontNames.push({
            name: String(f.familyName || f.name || ""),
            style: String(f.styleName || ""),
            postScriptName: String(f.postScriptName || ""),
          });
        }
      }
    } catch (_) {
      // Fallback: scan all text layers for empty fontLocation
      missingFontNames = scanLayersForMissingFonts();
    }

    // Early exit — no missing fonts
    if (missingFontNames.length === 0) {
      return { ok: true, fonts: [] };
    }

    // Build a set of missing font family names for the targeted location scan
    const missingSet: { [key: string]: boolean } = {};
    for (let i = 0; i < missingFontNames.length; i++) {
      missingSet[missingFontNames[i].name.toLowerCase()] = true;
    }

    // Map: fontName → locations[]
    const locationMap = buildLocationMap(missingSet);

    // Deduplicate by name+style (AE can return the same font entry multiple times)
    const seen: { [key: string]: boolean } = {};
    const fonts: MissingFont[] = [];
    for (let i = 0; i < missingFontNames.length; i++) {
      const f = missingFontNames[i];
      const dedupKey = (f.name + "|" + f.style).toLowerCase();
      if (seen[dedupKey]) continue;
      seen[dedupKey] = true;
      fonts.push({
        name: f.name,
        style: f.style,
        postScriptName: f.postScriptName,
        locations: locationMap[f.name.toLowerCase()] || [],
      });
    }

    return { ok: true, fonts };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
};

/**
 * Full layer scan fallback for AE < 22.
 * Returns font names with empty fontLocation (missing).
 */
const scanLayersForMissingFonts = (): { name: string; style: string; postScriptName: string }[] => {
  const seen: { [key: string]: boolean } = {};
  const result: { name: string; style: string; postScriptName: string }[] = [];

  const items = app.project.items;
  for (let i = 1; i <= items.length; i++) {
    const item = items[i];
    //@ts-ignore
    if (!(item instanceof CompItem)) continue;
    const comp = item as CompItem;

    for (let j = 1; j <= comp.numLayers; j++) {
      const layer = comp.layer(j);
      //@ts-ignore
      if (!(layer instanceof TextLayer)) continue;

      try {
        //@ts-ignore
        const textDoc = (layer as TextLayer).sourceText.value as TextDocument;
        const fontFamily = String(textDoc.fontFamily || "");
        const fontLocation = String(textDoc.fontLocation || "");

        if (fontFamily && !fontLocation && !seen[fontFamily.toLowerCase()]) {
          seen[fontFamily.toLowerCase()] = true;
          result.push({ name: fontFamily, style: "", postScriptName: "" });
        }
      } catch (_) {
        // skip unreadable layers
      }
    }
  }
  return result;
};

/**
 * Targeted scan: for each comp/layer, record location only for known-missing font names.
 */
const buildLocationMap = (
  missingSet: { [key: string]: boolean }
): { [key: string]: string[] } => {
  const map: { [key: string]: string[] } = {};

  const items = app.project.items;
  for (let i = 1; i <= items.length; i++) {
    const item = items[i];
    //@ts-ignore
    if (!(item instanceof CompItem)) continue;
    const comp = item as CompItem;

    for (let j = 1; j <= comp.numLayers; j++) {
      const layer = comp.layer(j);
      //@ts-ignore
      if (!(layer instanceof TextLayer)) continue;

      try {
        //@ts-ignore
        const textDoc = (layer as TextLayer).sourceText.value as TextDocument;
        const fontFamily = String(textDoc.fontFamily || "");
        const key = fontFamily.toLowerCase();

        if (fontFamily && missingSet[key]) {
          const label = `${comp.name} › ${layer.name}`;
          if (!map[key]) map[key] = [];
          // deduplicate
          let exists = false;
          for (let k = 0; k < map[key].length; k++) {
            if (map[key][k] === label) { exists = true; break; }
          }
          if (!exists) map[key].push(label);
        }
      } catch (_) {
        // skip
      }
    }
  }
  return map;
};

/**
 * Open a font file with the OS default handler.
 * macOS: opens Font Book. Windows: opens font installer dialog.
 */
export const openFontFile = (filePath: string): { ok: boolean; error?: string } => {
  try {
    //@ts-ignore
    const isWin = String($.os).toLowerCase().indexOf("win") > -1;
    if (isWin) {
      system.callSystem(`start "" "${filePath}"`);
    } else {
      system.callSystem(`open "${filePath}"`);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
};

/**
 * Write a base64-encoded font file to the system temp directory.
 * The panel cannot write files directly (Chromium sandbox), so we do it here.
 */
export const writeTempFont = (
  base64Data: string,
  fileName: string
): { ok: boolean; path?: string; error?: string } => {
  try {
    const binary = decodeBase64(base64Data);
    //@ts-ignore
    const tempDir = Folder.temp.fsName as string;
    //@ts-ignore
    const fontFile = new File(`${tempDir}/${fileName}`);
    //@ts-ignore
    fontFile.encoding = "BINARY";
    fontFile.open("w");
    fontFile.write(binary);
    fontFile.close();
    return { ok: true, path: fontFile.fsName };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
};

/**
 * Launch the local font-install server (dist/cep/server/server.cjs) as a background process.
 * If the port is already bound (server already running) the new process exits quietly.
 * Returns ok:false only if we can't determine the script path.
 */
export const startFontServer = (): { ok: boolean; error?: string } => {
  try {
    //@ts-ignore
    const isWin = String($.os).toLowerCase().indexOf("win") > -1;
    // $.fileName is the path to the running jsx/index.js inside dist/cep/jsx/
    //@ts-ignore
    const jsxDir = File($.fileName).parent.fsName as string;
    const serverPath = isWin
      ? jsxDir.replace(/jsx$/, "server") + "\\server.cjs"
      : jsxDir.replace(/jsx$/, "server") + "/server.cjs";
    //@ts-ignore
    if (!new File(serverPath).exists) {
      return { ok: false, error: `server.cjs not found at ${serverPath}` };
    }
    if (isWin) {
      system.callSystem(`start /B node "${serverPath}"`);
    } else {
      system.callSystem(`nohup node "${serverPath}" &`);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
};

/**
 * Open the AE "Find Missing Fonts" dialog (command 4003).
 * Fire-and-forget — returns no data. Used as a UX convenience button.
 */
export const showMissingFontsDialog = (): void => {
  app.executeCommand(4003);
};

/**
 * Open the Adobe Fonts browser inside AE (command 4017).
 * Fire-and-forget.
 */
export const browseAdobeFonts = (): void => {
  app.executeCommand(4017);
};

// Pure ES3 base64 decoder — ExtendScript has no atob().
const decodeBase64 = (input: string): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  // strip non-base64 characters
  let sanitized = "";
  for (let c = 0; c < input.length; c++) {
    if (chars.indexOf(input[c]) !== -1 || input[c] === "=") sanitized += input[c];
  }
  let i = 0;
  while (i < sanitized.length) {
    const enc1 = chars.indexOf(sanitized[i++]);
    const enc2 = chars.indexOf(sanitized[i++]);
    const enc3 = chars.indexOf(sanitized[i++]);
    const enc4 = chars.indexOf(sanitized[i++]);
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    output += String.fromCharCode(chr1);
    if (enc3 !== 64) output += String.fromCharCode(chr2);
    if (enc4 !== 64) output += String.fromCharCode(chr3);
  }
  return output;
};
