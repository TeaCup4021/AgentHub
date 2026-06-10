import { useRef, useEffect, useCallback } from "react";

interface UseResizableOptions {
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  defaultWidth?: string;
  defaultHeight: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function useResizable(options: UseResizableOptions) {
  const {
    minW = 320,
    minH = 140,
    maxW = 1200,
    maxH = 700,
    defaultHeight,
  } = options;

  const cardRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const sizeLabelRef = useRef<HTMLSpanElement>(null);

  // ResizeObserver: unified label update using border-box size
  useEffect(() => {
    const card = cardRef.current;
    const label = sizeLabelRef.current;
    if (!card || !label) return;

    const ro = new ResizeObserver(() => {
      const rect = card.getBoundingClientRect();
      label.textContent = Math.round(rect.width) + "×" + Math.round(rect.height);
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  // Drag-to-resize
  useEffect(() => {
    const handle = resizeRef.current;
    const card = cardRef.current;
    if (!handle || !card) return;

    let dragging = false;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    let sh = 0;

    const onDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      handle.classList.add("active");
      card.classList.add("artifact-card--resizing");
      sx = e.clientX;
      sy = e.clientY;
      sw = card.getBoundingClientRect().width;
      sh = card.getBoundingClientRect().height;
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const w = clamp(sw + (e.clientX - sx), minW, Math.max(maxW, sw));
      const h = clamp(sh + (e.clientY - sy), minH, Math.max(maxH, sh));
      card.style.width = w + "px";
      card.style.height = h + "px";
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("active");
      card.classList.remove("artifact-card--resizing");
    };

    handle.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      handle.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minW, minH, maxW, maxH]);

  const resetSize = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.classList.add("artifact-card--restoring");
    card.style.width = "";
    card.style.height = defaultHeight + "px";
    const onEnd = () => {
      card.classList.remove("artifact-card--restoring");
      card.removeEventListener("transitionend", onEnd);
    };
    card.addEventListener("transitionend", onEnd);
  }, [defaultHeight]);

  return { cardRef, resizeRef, sizeLabelRef, resetSize };
}
