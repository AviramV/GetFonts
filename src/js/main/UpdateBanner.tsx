import { useState } from "react";
import { evalTS, openLinkInBrowser } from "../lib/utils/bolt";
import type { UpdateInfo } from "./useUpdateCheck";

type Phase = "idle" | "downloading" | "launched" | "error";

const DOWNLOAD_ENDPOINT = "http://localhost:7762/download-update";

/**
 * Slim, dismissable bar shown above the toolbar when a newer release exists.
 *
 * The "Update" button runs the assisted-install flow:
 *   server downloads the signed .zxp -> ExtendScript OS-opens it -> the user's
 *   ZXP installer confirms the (signature-verified) install.
 * If the release has no .zxp asset, the button degrades to opening the release page.
 */
export const UpdateBanner = ({ info }: { info: UpdateInfo }) => {
  const { latestVersion, zxpUrl, releaseUrl, dismiss } = info;
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);

  const openReleasePage = () => {
    if (releaseUrl) openLinkInBrowser(releaseUrl);
  };

  const handleUpdate = async () => {
    // No packaged .zxp to install — just send the user to the release page.
    if (!zxpUrl) {
      openReleasePage();
      return;
    }

    setPhase("downloading");
    setErrorMsg("");
    try {
      const res = await fetch(
        `${DOWNLOAD_ENDPOINT}?url=${encodeURIComponent(zxpUrl)}&version=${encodeURIComponent(
          latestVersion || ""
        )}`
      );
      const data: { ok: boolean; path?: string; error?: string } = await res.json();
      if (!data.ok || !data.path) throw new Error(data.error || "Download failed");

      setDownloadedPath(data.path);
      const openResult = await evalTS("openDownloadedFile", data.path);
      if (!openResult.ok) throw new Error(openResult.error || "Could not open the installer");

      setPhase("launched");
    } catch (e) {
      setErrorMsg(String((e as Error).message || e));
      setPhase("error");
    }
  };

  const revealDownloaded = () => {
    if (downloadedPath) evalTS("revealFile", downloadedPath);
  };

  return (
    <div className="update-banner" role="status">
      <span className="update-icon" aria-hidden="true">⬆</span>

      <span className="update-text">
        {phase === "idle" && <>Get Fonts {latestVersion} is available</>}
        {phase === "downloading" && <>Downloading {latestVersion}…</>}
        {phase === "launched" && <>Downloaded — confirm the install, then restart After Effects.</>}
        {phase === "error" && <>Update failed: {errorMsg}</>}
      </span>

      <span className="update-actions">
        {(phase === "idle") && (
          <button className="btn btn-primary update-btn" onClick={handleUpdate}>
            {zxpUrl ? "Update" : "Open release page"}
          </button>
        )}
        {phase === "downloading" && (
          <button className="btn btn-primary update-btn" disabled>
            Downloading…
          </button>
        )}
        {phase === "launched" && (
          <button className="btn btn-secondary update-btn" onClick={revealDownloaded}>
            Show in folder
          </button>
        )}
        {phase === "error" && (
          <button className="btn btn-primary update-btn" onClick={openReleasePage}>
            Open release page
          </button>
        )}

        <button
          className="update-dismiss"
          onClick={dismiss}
          title="Dismiss for this version"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </span>
    </div>
  );
};
