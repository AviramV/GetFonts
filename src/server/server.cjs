const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 7762;
const GFONTS_UA = "Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1";

const STYLE_WEIGHTS = {
  thin: 100, hairline: 100,
  extralight: 200, "extra light": 200, ultralight: 200,
  light: 300,
  regular: 400, normal: 400, roman: 400,
  medium: 500,
  semibold: 600, "semi bold": 600, demibold: 600,
  bold: 700,
  extrabold: 800, "extra bold": 800, ultrabold: 800,
  black: 900, heavy: 900,
};

function styleToWeight(style) {
  const key = (style || "").toLowerCase().replace(/\s*italic$/i, "").trim();
  return STYLE_WEIGHTS[key] || 400;
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpsGet(res.headers.location, headers));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ body: Buffer.concat(chunks), headers: res.headers }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function installFont(fontName, fontStyle) {
  const weight = styleToWeight(fontStyle);
  const isItalic = /italic/i.test(fontStyle || "");
  const familyParam = isItalic
    ? `${fontName}:ital,wght@1,${weight}`
    : `${fontName}:wght@${weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyParam)}&display=swap`;

  const { body: cssBuffer } = await httpsGet(cssUrl, { "User-Agent": GFONTS_UA });
  const css = cssBuffer.toString("utf8");
  const match = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/i.exec(css);
  if (!match) throw new Error("Font not found on Google Fonts");

  const fileUrl = match[1];
  const { body: fontBuffer } = await httpsGet(fileUrl, { "User-Agent": GFONTS_UA });

  const ext = path.extname(new URL(fileUrl).pathname) || ".ttf";
  const safeName = fontName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outPath = path.join(os.tmpdir(), `${safeName}${ext}`);
  fs.writeFileSync(outPath, fontBuffer);
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
  const style = url.searchParams.get("style") || "";
  if (!family) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Missing ?family= param" }));
    return;
  }

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
  if (err.code === "EADDRINUSE") return; // already running, exit quietly
  console.error("Font server error:", err);
});

server.listen(PORT);
