export type MissingFont = {
  name: string;
  style: string;
  postScriptName: string;
  locations: string[];
};

export type GetMissingFontsResult =
  | { ok: true; fonts: MissingFont[] }
  | { ok: false; error: string };
