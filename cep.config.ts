import { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

const config: CEP_Config = {
  version,
  id: "com.aviramv.getfonts",
  displayName: "Get Fonts",
  symlink: "local",
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 7.0,
  // CEP 11 ships with AE 24.0 (our minimum host); AE 25 ships CEP 12. 11.0 is the
  // correct minimum runtime — 12.0 would exclude AE 2024.
  requiredRuntimeVersion: 11.0,
  // AE 24.0 is the floor: missing-font detection relies on the app.fonts
  // enumeration API (allFonts / getFontsByFamilyNameAndStyleName), added in 24.0.
  hosts: [{ name: "AEFT", version: "[24.0,99.9]" }],
  type: "Panel",
  parameters: ["--v=0", "--mixed-context", "--enable-nodejs"],
  width: 340,
  height: 600,
  panels: [
    {
      mainPath: "./main/index.html",
      scriptPath: "./jsx/index.js",
      name: "main",
      panelDisplayName: "Get Fonts",
      autoVisible: true,
      width: 340,
      height: 600,
    },
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    country: "US",
    province: "CA",
    org: "AviramV",
    password: "password",
    tsa: [
      "http://timestamp.digicert.com/",
      "http://timestamp.apple.com/ts01",
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  copyAssets: [],
  copyZipAssets: [],
};
export default config;
