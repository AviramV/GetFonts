import { useEffect, useState } from "react";
import { evalTS, openLinkInBrowser, subscribeBackgroundColor } from "../lib/utils/bolt";
import type { MissingFont } from "../../shared/types";
import { FontList } from "./FontList";
import { Tooltip } from "./Tooltip";
import "./main.scss";

export type FontStatus = "missing" | "installing" | "installed";

export type FontItem = MissingFont & { status: FontStatus };

export const App = () => {
  const [bgColor, setBgColor] = useState("#1e1e1e");
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [status, setStatus] = useState("Click 'Scan Project' to begin.");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (window.cep) {
      subscribeBackgroundColor(setBgColor);
    }
  }, []);

  const scanProject = async () => {
    setScanning(true);
    setStatus("Scanning project…");
    try {
      const result = await evalTS("getMissingFonts");
      if (!result.ok) {
        setStatus(`Error: ${result.error}`);
        setFonts([]);
        return;
      }
      const items: FontItem[] = result.fonts.map((f) => ({ ...f, status: "missing" }));
      setFonts(items);
      if (items.length === 0) {
        setStatus("No missing fonts found.");
      } else {
        setStatus(`Found ${items.length} missing font${items.length === 1 ? "" : "s"}.`);
      }
    } catch (e: any) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  const updateFontStatus = (idx: number, newStatus: FontStatus) => {
    setFonts((prev) => prev.map((f, i) => (i === idx ? { ...f, status: newStatus } : f)));
  };

  const installAll = () => {
    const missing = fonts
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.status === "missing");
    if (missing.length === 0) return;
    setStatus(`Installing all ${missing.length} font${missing.length === 1 ? "" : "s"}…`);
    // Sequential installs with a small gap to avoid OS dialog pile-up
    missing.reduce((chain, { i }) => {
      return chain.then(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              triggerInstall(i, fonts[i]);
              resolve();
            }, 800);
          })
      );
    }, Promise.resolve());
  };

  const triggerInstall = async (idx: number, font: FontItem) => {
    updateFontStatus(idx, "installing");
    try {
      const humanName = font.name.replace(/([a-z])([A-Z])/g, "$1 $2");

      // Ensure the local helper server is running (no-op if already up)
      await evalTS("startFontServer");
      // Give it a moment to bind if it was just launched
      await new Promise<void>((r) => setTimeout(r, 800));

      const res = await fetch(
        `http://localhost:7762/install?family=${encodeURIComponent(humanName)}&style=${encodeURIComponent(font.style || "")}`
      );
      const data: { ok: boolean; path?: string; error?: string } = await res.json();
      if (!data.ok || !data.path) throw new Error(data.error || "Install failed");

      const openResult = await evalTS("openFontFile", data.path);
      if (!openResult.ok) throw new Error(openResult.error);

      updateFontStatus(idx, "installed");
      setStatus(`${font.name} — installer launched. Scan again after installing.`);
    } catch {
      updateFontStatus(idx, "missing");
      findOnline(font.name);
    }
  };

  const findOnline = async (fontName: string) => {
    openLinkInBrowser(await bestFontUrl(fontName));
  };

  const hasMissing = fonts.some((f) => f.status === "missing");

  return (
    <div className="app" style={{ backgroundColor: bgColor }}>
      <header className="app-header">
        <h1>Get Fonts</h1>
        <p className="subtitle">Detect and install missing fonts in your project</p>
      </header>

      <div className="toolbar">
        <Tooltip text="Scan all compositions for missing or substituted fonts" pos="bottom">
          <button className="btn btn-primary" onClick={scanProject} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan Project"}
          </button>
        </Tooltip>
        <Tooltip text="Try to auto-install all missing fonts via Google Fonts" pos="bottom">
          <button
            className="btn btn-secondary"
            onClick={installAll}
            disabled={!hasMissing || scanning}
          >
            Install All
          </button>
        </Tooltip>
        <Tooltip text="Browse and activate fonts from Adobe Fonts inside After Effects" pos="bottom">
          <button className="btn btn-icon" onClick={() => evalTS("browseAdobeFonts")}>
            Aa
          </button>
        </Tooltip>
        <Tooltip text="Open After Effects' native Find Missing Fonts dialog" pos="bottom">
          <button className="btn btn-icon" onClick={() => evalTS("showMissingFontsDialog")}>
            ⚠
          </button>
        </Tooltip>
      </div>

      <div className="status-bar">{status}</div>

      <FontList
        fonts={fonts}
        onInstall={(idx) => triggerInstall(idx, fonts[idx])}
        onFindOnline={(idx) => findOnline(fonts[idx].name)}
      />
    </div>
  );
};

/**
 * Determine the best URL to open for a font:
 * 1. Probe Google Fonts CSS API (no key needed) — if the font exists there, open its specimen page.
 * 2. Otherwise open Adobe Fonts (slug = lowercase + hyphens).
 * 3. Ultimate fallback: Google search.
 */
async function bestFontUrl(fontName: string): Promise<string> {
  // AE returns font family names in font-file metadata format, which may be PascalCase
  // without spaces (e.g. "MillerBanner" instead of "Miller Banner"). Split at
  // lowercase→uppercase boundaries so URL slugs are correct for both services.
  const humanName = fontName.replace(/([a-z])([A-Z])/g, "$1 $2");
  const googleSlug = humanName.replace(/ /g, "+");
  const adobeSlug  = humanName.toLowerCase().replace(/\s+/g, "-");

  const googleSpecimen = `https://fonts.google.com/specimen/${googleSlug}`;
  const adobeFonts     = `https://fonts.adobe.com/fonts/${adobeSlug}`;
  const googleSearch   = `https://www.google.com/search?q=${encodeURIComponent(humanName + " font")}`;

  try {
    // Google Fonts CSS endpoint returns 200 for known fonts, 400 for unknown — no API key needed.
    const res = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(humanName)}`,
      { method: "HEAD" }
    );
    if (res.ok) return googleSpecimen;
  } catch {
    return googleSearch; // network error — open search as fallback
  }

  // Not on Google Fonts → try Adobe Fonts. If that 404s, the Adobe Fonts search bar is right there.
  return adobeFonts;
}
