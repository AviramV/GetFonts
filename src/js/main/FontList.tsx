import type { FontItem } from "./main";
import { Tooltip } from "./Tooltip";

type Props = {
  fonts: FontItem[];
  onInstall: (idx: number) => void;
  onFindOnline: (idx: number) => void;
};

export const FontList = ({ fonts, onInstall, onFindOnline }: Props) => {
  if (fonts.length === 0) {
    return (
      <div className="empty-state">
        <p>No missing fonts found.</p>
        <p>Open a project and click "Scan Project".</p>
      </div>
    );
  }

  return (
    <div className="font-list">
      {fonts.map((font, idx) => (
        <div className="font-row" key={`${font.name}-${idx}`}>
          <div className="font-info">
            <div className="font-name" title={font.name}>
              {font.name.replace(/([a-z])([A-Z])/g, "$1 $2")}
              {font.style ? <span className="font-style"> {font.style}</span> : null}
            </div>
            {font.locations.length > 0 && (
              <div className="font-locations" title={font.locations.join(", ")}>
                {font.locations.join(" · ")}
              </div>
            )}
          </div>

          <Tooltip
            text={
              font.status === "installed"
                ? "Installer launched — rescan after completing installation"
                : font.status === "installing"
                ? "Downloading and opening installer…"
                : "Font is referenced in the project but not installed on this machine"
            }
          >
            <span className={`badge badge-${font.status}`}>
              {font.status === "installed"
                ? "installed"
                : font.status === "installing"
                ? "…"
                : "missing"}
            </span>
          </Tooltip>

          <div className="font-actions">
            <Tooltip text="Download from Google Fonts and open the OS font installer. Falls back to Find Online if unavailable.">
              <button
                className={`btn-action${font.status === "installing" ? " installing" : ""}`}
                disabled={font.status !== "missing"}
                onClick={() => onInstall(idx)}
              >
                {font.status === "installed"
                  ? "Done"
                  : font.status === "installing"
                  ? "Installing…"
                  : "Install"}
              </button>
            </Tooltip>
            <Tooltip text="Opens Google Fonts if available, otherwise Adobe Fonts. After activating, rescan to confirm.">
              <button className="btn-action" onClick={() => onFindOnline(idx)}>
                Find Online
              </button>
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
};
