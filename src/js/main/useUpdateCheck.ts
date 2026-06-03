import { useEffect, useState } from "react";

const REPO = "AviramV/GetFonts";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const DISMISS_KEY = "getfonts.dismissedUpdateVersion";

export type UpdateInfo = {
  /** True when a newer release exists and hasn't been dismissed for that version. */
  updateAvailable: boolean;
  /** Latest version string from the release tag, with any leading "v" stripped. */
  latestVersion: string | null;
  /** browser_download_url of the release's .zxp asset, if one is attached. */
  zxpUrl: string | null;
  /** html_url of the release page (browser fallback / "open release page"). */
  releaseUrl: string | null;
  /** Hide the banner and remember this version so it won't re-nag. */
  dismiss: () => void;
};

/**
 * Returns true if `latest` is strictly newer than `current` (semver, numeric).
 * Tolerates an optional leading "v". Returns false for malformed tags (safe default).
 */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.replace(/^v/, "").split(".").map(Number);
  const b = current.replace(/^v/, "").split(".").map(Number);
  // Malformed tag (non-numeric) -> NaN -> never newer.
  if (a.some(isNaN) || b.some(isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Checks GitHub Releases for a newer version of the extension on mount.
 * Fails silently on any network/parse/rate-limit error — never blocks the panel.
 */
export function useUpdateCheck(): UpdateInfo {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [zxpUrl, setZxpUrl] = useState<string | null>(null);
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return; // 404 (no releases), 403 (rate limit), etc. -> no banner
        const data = await res.json();

        const tag: string = String(data.tag_name || "");
        if (!tag) return;
        const version = tag.replace(/^v/, "");

        const assets: any[] = Array.isArray(data.assets) ? data.assets : [];
        const zxpAsset = assets.find((a) =>
          String(a.name || "").toLowerCase().endsWith(".zxp")
        );

        if (cancelled) return;
        setLatestVersion(version);
        setReleaseUrl(String(data.html_url || "") || null);
        setZxpUrl(zxpAsset ? String(zxpAsset.browser_download_url || "") || null : null);
      } catch {
        // Network/JSON error — stay silent, retry next panel open.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    if (!latestVersion) return;
    try {
      localStorage.setItem(DISMISS_KEY, latestVersion);
    } catch {
      // localStorage unavailable — banner just won't persist its dismissal.
    }
    setDismissed(latestVersion);
  };

  const updateAvailable =
    latestVersion !== null &&
    isNewer(latestVersion, __APP_VERSION__) &&
    dismissed !== latestVersion;

  return { updateAvailable, latestVersion, zxpUrl, releaseUrl, dismiss };
}
