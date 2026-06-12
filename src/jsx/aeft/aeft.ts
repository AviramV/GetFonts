// ExtendScript functions for After Effects font detection and management.
// Compiled to ES3 by rollup for the AE scripting engine.

import type { MissingFont, GetMissingFontsResult } from "../../shared/types";

/**
 * Detects the fonts that are genuinely missing in the open project.
 *
 * Source: app.fonts.missingOrSubstitutedFonts (deduped by family+style). AE also
 * lists fonts here that are actually installed and render fine — it just keeps a
 * stale substitution record alongside them, typically because of a duplicate
 * PostScript name. Such a font's family+style returns BOTH an installed
 * (isSubstitute:false) AND a substitute (isSubstitute:true) instance from
 * getFontsByFamilyNameAndStyleName; those are NOT problems and are dropped (the
 * "both" rule). The rest are genuinely missing.
 *
 * Locations ("Comp › Layer") come from one cheap pass over text layers, matched by
 * family+style (so e.g. "Geist Medium" never lands on a "Geist SemiBold" layer).
 */
export const getMissingFonts = (): GetMissingFontsResult => {
  try {
    if (!app.project) {
      return { ok: false, error: "No project is open." };
    }

    let nm: any[];
    try {
      //@ts-ignore — app.fonts may not be typed in older types-for-adobe
      nm = app.fonts.missingOrSubstitutedFonts;
    } catch (_) {
      nm = [];
    }
    if (!nm || nm.length === undefined) nm = [];

    const installed = buildInstalledFontIndex();

    const byKey: { [key: string]: MissingFont } = {};
    const order: string[] = [];
    for (let i = 0; i < nm.length; i++) {
      const f = nm[i];
      const family = String(f.familyName || "");
      const style = String(f.styleName || "");
      const key = normalizeFontKey(family, style);
      if (byKey[key]) continue;
      // The font is genuinely available if its (normalized) family+style is present
      // in the system's installed-fonts list — whether under the same name or a
      // different one (e.g. project "WixMadeforText" vs installed "Wix Madefor Text").
      // Such fonts are flagged only as stale substitution records; skip them.
      if (installed[key]) continue;
      byKey[key] = { name: family, style: style, postScriptName: String(f.postScriptName || ""), locations: [] };
      order.push(key);
    }

    if (order.length === 0) return writeScanResult([]);

    attachLocations(byKey);

    const fonts: MissingFont[] = [];
    for (let i = 0; i < order.length; i++) fonts.push(byKey[order[i]]);
    return writeScanResult(fonts);
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
};

/**
 * Serialize the scan result to a UTF-8 temp file and return its path.
 *
 * The result is NOT returned through evalScript directly: it contains heavy
 * non-ASCII content (`›`, arrows, curly quotes) that CEP's evalScript return
 * channel corrupts/truncates, which breaks JSON.parse in the panel. Writing a
 * UTF-8 file and handing back only the (ASCII) path sidesteps that entirely —
 * the panel reads + parses the file via Node fs.
 */
const writeScanResult = (fonts: MissingFont[]): GetMissingFontsResult => {
  return writeAsciiJsonFile(fonts, "getfonts-scan.json");
};

/**
 * Serialize a value to a pure-ASCII JSON temp file and return its path.
 *
 * The result is NOT returned through evalScript directly: it can contain heavy
 * non-ASCII content (`›`, arrows, curly quotes, native font names) that CEP's
 * evalScript return channel corrupts/truncates, which breaks JSON.parse in the
 * panel. Writing a file and handing back only the (ASCII) path sidesteps that —
 * the panel reads + parses the file via Node fs.
 *
 * Every char above U+007F is escaped to \uXXXX (see toAsciiJson) so the payload
 * is pure ASCII; that lets us write with BINARY encoding (byte-per-char, the
 * only File.write mode reliable in AE's ExtendScript — UTF-8 write silently
 * fails here). The panel's JSON.parse decodes the escapes back to real chars.
 */
const writeAsciiJsonFile = (
  value: any,
  fileName: string
): { ok: true; path: string } | { ok: false; error: string } => {
  try {
    const json = toAsciiJson(JSON.stringify(value));
    //@ts-ignore — Folder/File are ExtendScript globals
    const tempDir = Folder.temp.fsName as string;
    //@ts-ignore
    const outFile = new File(tempDir + "/" + fileName);
    //@ts-ignore — content is pure ASCII, so one byte per char is exact
    outFile.encoding = "BINARY";
    if (!outFile.open("w")) {
      return { ok: false, error: "Cannot open temp file: " + String(outFile.error) };
    }
    const wroteOk = outFile.write(json);
    outFile.close();
    if (!wroteOk) {
      return {
        ok: false,
        error: "Failed writing result (" + json.length + " chars): " + String(outFile.error),
      };
    }
    return { ok: true, path: outFile.fsName };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
};

/** Replace every char above U+007F with its \uXXXX JSON escape, yielding pure ASCII. */
const toAsciiJson = (s: string): string => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 127) {
      let hex = code.toString(16);
      while (hex.length < 4) hex = "0" + hex;
      out += "\\u" + hex;
    } else {
      out += s.charAt(i);
    }
  }
  return out;
};

/**
 * Normalize a family+style pair to a comparison key: lowercase and strip
 * everything but [a-z0-9], collapsing a blank/Regular style to "regular". Used to
 * dedupe flagged fonts and to match a layer's font to a flagged font tolerant of
 * case/spacing differences (e.g. "SemiBold" vs "Semibold").
 */
const normalizeFontKey = (family: string, style: string): string => {
  const clean = (s: string): string => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let st = clean(style);
  if (st === "" || st === "regular" || st === "normal" || st === "roman") st = "regular";
  return clean(family) + "|" + st;
};

/**
 * Set of normalized family+style keys for every font actually installed on the
 * system (app.fonts.allFonts, excluding substitute placeholders). A flagged font
 * whose key is present here is genuinely available — possibly under a different
 * name than the project references (e.g. "Wix Madefor Text" vs "WixMadeforText") —
 * so it's only a stale substitution record, not a real problem. AE 24+;
 * allFonts is an Array of Arrays grouped by family.
 */
const buildInstalledFontIndex = (): { [key: string]: boolean } => {
  const idx: { [key: string]: boolean } = {};
  try {
    //@ts-ignore — app.fonts may not be typed in older types-for-adobe
    const families: any[] = app.fonts.allFonts;
    if (!families || families.length === undefined) return idx;
    for (let i = 0; i < families.length; i++) {
      const group = families[i];
      // Each entry is normally an array of FontObjects; tolerate a bare FontObject.
      const list: any[] = group && group.length !== undefined ? group : [group];
      for (let j = 0; j < list.length; j++) {
        const f = list[j];
        if (!f || f.isSubstitute === true) continue;
        idx[normalizeFontKey(String(f.familyName || ""), String(f.styleName || ""))] = true;
      }
    }
  } catch (_) {
    // AE < 24 / no font API — empty index (nothing excluded).
  }
  return idx;
};

/**
 * Attach "Comp › Layer" locations to each missing font via one cheap pass over the
 * project's text layers, matched by normalized family+style (whole-doc font props,
 * no per-character scan). A layer that uses a different weight of the same family
 * therefore won't be attributed to the wrong entry.
 */
const attachLocations = (byKey: { [key: string]: MissingFont }): void => {
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
        const doc = (layer as TextLayer).sourceText.value as any;
        const key = normalizeFontKey(String(doc.fontFamily || ""), String(doc.fontStyle || ""));
        const entry = byKey[key];
        if (!entry) continue;
        const label = comp.name + " › " + layer.name;
        let exists = false;
        for (let k = 0; k < entry.locations.length; k++) {
          if (entry.locations[k] === label) { exists = true; break; }
        }
        if (!exists) entry.locations.push(label);
      } catch (_) {
        // skip unreadable/locked layers
      }
    }
  }
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
 * Open a downloaded .zxp with the OS default handler so the user's registered
 * ZXP installer (Anastasiy's Extension Manager / ZXPInstaller / UPIA) takes over.
 * Mirrors openFontFile — the OS hands the file to whatever is associated with it.
 */
export const openDownloadedFile = (filePath: string): { ok: boolean; error?: string } => {
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
 * Reveal a file in Finder (macOS) / Explorer (Windows). Fallback for when no
 * ZXP installer is associated, so the user can locate and run the download manually.
 */
export const revealFile = (filePath: string): { ok: boolean; error?: string } => {
  try {
    //@ts-ignore
    const isWin = String($.os).toLowerCase().indexOf("win") > -1;
    if (isWin) {
      system.callSystem(`explorer /select,"${filePath}"`);
    } else {
      system.callSystem(`open -R "${filePath}"`);
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
