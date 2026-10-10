"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function RowActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }[];
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<EventTarget, { top: number; left: number }>());
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  function close() {
    setPosition(null);
    trigger.current?.focus({ preventScroll: true });
  }

  function open() {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    // Clicking a horizontally clipped trigger may queue a scroll event before
    // the menu opens. Only dismiss for scrolling that changes its position.
    scrollPositions.current.clear();
    for (let node = trigger.current?.parentElement; node; node = node.parentElement) {
      scrollPositions.current.set(node, { top: node.scrollTop, left: node.scrollLeft });
    }
    scrollPositions.current.set(document, { top: window.scrollY, left: window.scrollX });
    const height = actions.length * 40 + 12;
    setPosition({
      left: Math.max(8, Math.min(bounds.right - 200, window.innerWidth - 208)),
      top:
        bounds.bottom + height + 8 <= window.innerHeight
          ? bounds.bottom + 4
          : Math.max(8, bounds.top - height - 4),
    });
  }

  useEffect(() => {
    if (!position) return;
    menu.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setPosition(null);
    };
    const dismissOnScroll = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      const previous = event.target ? scrollPositions.current.get(event.target) : undefined;
      const current =
        event.target === document
          ? { top: window.scrollY, left: window.scrollX }
          : event.target instanceof HTMLElement
            ? { top: event.target.scrollTop, left: event.target.scrollLeft }
            : undefined;
      if (previous && current && previous.top === current.top && previous.left === current.left)
        return;
      setPosition(null);
    };
    const dismissOnResize = () => setPosition(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("scroll", dismissOnScroll, true);
    window.addEventListener("resize", dismissOnResize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("scroll", dismissOnScroll, true);
      window.removeEventListener("resize", dismissOnResize);
    };
  }, [position]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button row-actions-trigger"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-controls={position ? id : undefined}
        onClick={() => (position ? close() : open())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            open();
          }
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={`Actions for ${label}`}
            className="row-actions-menu"
            style={position}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                setPosition(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[next]?.focus({ preventScroll: true });
            }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                className={action.danger ? "is-danger" : undefined}
                onClick={() => {
                  close();
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
