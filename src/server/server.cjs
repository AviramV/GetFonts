// Local font-install helper server.
// Started by the extension on first Install click; binds to localhost:7762.
// Endpoint: GET /install?family=FontName
//   → fetches Google Fonts CSS with a legacy User-Agent to get a TTF download URL
//   → downloads the TTF to the OS temp dir
//   → returns JSON { ok: true, path: "/tmp/FontName.ttf" }
//      or         { ok: false, error: "..." }

const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 7762;
// Old Android UA → Google Fonts responds with TTF (truetype) format, which macOS/Windows can install
const LEGACY_UA = "Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1";

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpsGet(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ body: Buffer.concat(chunks), headers: res.headers }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

const CONTENT_TYPE_EXT = {
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "font/sfnt": ".ttf",
  "application/x-font-ttf": ".ttf",
  "application/x-font-otf": ".otf",
  "font/woff": ".woff",
  "font/woff2": ".woff2",
};

const STYLE_WEIGHTS = {
  thin: 100, hairline: 100,
  extralight: 200, "extra light": 200, ultralight: 200, "ultra light": 200,
  light: 300,
  regular: 400, normal: 400, roman: 400,
  medium: 500,
  semibold: 600, "semi bold": 600, demibold: 600,
  bold: 700,
  extrabold: 800, "extra bold": 800, ultrabold: 800, "ultra bold": 800,
  black: 900, heavy: 900,
};

function styleToWeight(style) {
  if (!style) return 400;
  const key = style.toLowerCase().replace(/\s+/g, " ").trim();
  // Strip "italic" suffix for lookup ("Bold Italic" → "bold")
  const withoutItalic = key.replace(/\s*italic$/i, "").trim();
  return STYLE_WEIGHTS[withoutItalic] || STYLE_WEIGHTS[key] || 400;
}

async function installFont(fontName, fontStyle) {
  const weight = styleToWeight(fontStyle);
  const isItalic = /italic/i.test(fontStyle || "");
  // Request specific weight; italic uses `ital,wght` axis
  const familyParam = isItalic
    ? `${fontName}:ital,wght@1,${weight}`
    : `${fontName}:wght@${weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyParam)}&display=swap`;
  const { body: cssBuffer } = await httpsGet(cssUrl, { "User-Agent": LEGACY_UA });
  const css = cssBuffer.toString("utf8");

  // Match any fonts.gstatic.com URL (may be a dynamic path without .ttf extension)
  const match = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/i.exec(css);
  if (!match) throw new Error("Font not found on Google Fonts");

  const fileUrl = match[1];
  const { body: fileBuffer, headers: fileHeaders } = await httpsGet(fileUrl, { "User-Agent": LEGACY_UA });

  // Determine extension from Content-Type, fall back to URL path, then default to .ttf
  const ct = (fileHeaders["content-type"] || "").split(";")[0].trim().toLowerCase();
  const urlExt = path.extname(new URL(fileUrl).pathname);
  const ext = CONTENT_TYPE_EXT[ct] || (urlExt && urlExt.length > 1 ? urlExt : ".ttf");

  const safeName = fontName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outPath = path.join(os.tmpdir(), `${safeName}${ext}`);

  fs.writeFileSync(outPath, fileBuffer);
  return { ok: true, path: outPath };
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/install") {
    res.writeHead(404);
    res.end();
    return;
  }

  const family = url.searchParams.get("family");
  if (!family) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Missing ?family= param" }));
    return;
  }
  const style = url.searchParams.get("style") || "";

  installFont(family, style)
    .then((result) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    })
    .catch((err) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
});

server.on("error", (err) => {
  // Port already in use means another instance is running — exit quietly
  if (err.code === "EADDRINUSE") process.exit(0);
  process.exit(1);
});

server.listen(PORT);
