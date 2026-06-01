import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  text: string;
  pos?: "top" | "bottom";
  children: React.ReactElement;
};

/**
 * Attaches tooltip handlers directly to the child element via cloneElement,
 * so mouse enter/leave events fire on the real DOM node — no wrapper box needed.
 * Renders the popup into document.body (portal) so it's never clipped by overflow.
 */
export const Tooltip = ({ text, pos = "top", children }: Props) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    // Clear any pending timer from a previous hover before starting a new one
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => setAnchor(el.getBoundingClientRect()),
      350
    );
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAnchor(null);
  };

  // Inject handlers directly onto the child — preserves any existing handlers
  const existingProps = children.props as Record<string, unknown>;
  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      show(e);
      (existingProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      (existingProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onMouseDown: (e: React.MouseEvent) => {
      // Hide immediately on click — the button may re-render after the action,
      // replacing the DOM node and causing onMouseLeave to never fire.
      hide();
      (existingProps.onMouseDown as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
  } as Partial<typeof children.props>);

  return (
    <>
      {child}
      {anchor &&
        createPortal(
          <TooltipPopup text={text} anchor={anchor} pos={pos} />,
          document.body
        )}
    </>
  );
};

const TOOLTIP_WIDTH = 200;
const MARGIN = 8;

const TooltipPopup = ({
  text,
  anchor,
  pos,
}: {
  text: string;
  anchor: DOMRect;
  pos: "top" | "bottom";
}) => {
  const cx = anchor.left + anchor.width / 2;
  // Clamp so tooltip doesn't overflow panel edges
  const left = Math.min(
    Math.max(cx - TOOLTIP_WIDTH / 2, MARGIN),
    window.innerWidth - TOOLTIP_WIDTH - MARGIN
  );
  const top =
    pos === "top"
      ? anchor.top - MARGIN
      : anchor.bottom + MARGIN;
  const transform = pos === "top" ? "translateY(-100%)" : "none";

  return (
    <div
      className="tooltip-popup"
      style={{ left, top, transform, width: TOOLTIP_WIDTH }}
    >
      {text}
    </div>
  );
};
