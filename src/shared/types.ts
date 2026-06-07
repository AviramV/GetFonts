export type MissingFont = {
  name: string;
  style: string;
  postScriptName: string;
  locations: string[];
};

/**
 * Bridge result for getMissingFonts. The full font list (which contains lots of
 * non-ASCII characters — `›`, arrows, curly quotes — that CEP's evalScript return
 * channel corrupts/truncates) is written to a UTF-8 temp file by ExtendScript;
 * only the file path crosses the bridge. The panel reads + parses the file via Node fs.
 */
export type GetMissingFontsResult =
  | { ok: true; path: string }
  | { ok: false; error: string };
