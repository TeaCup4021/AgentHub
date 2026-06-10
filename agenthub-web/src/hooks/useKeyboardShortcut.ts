import { useEffect } from "react";

interface ShortcutOptions {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  enabled?: boolean;
}

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: ShortcutOptions = {},
) {
  useEffect(() => {
    if (options.enabled === false) return;

    const handler = (e: KeyboardEvent) => {
      const ctrlOrMeta = options.ctrl || options.meta;
      const hasModifier = ctrlOrMeta ? (e.ctrlKey || e.metaKey) : true;
      const shiftOk = options.shift ? e.shiftKey : true;

      if (e.key.toLowerCase() === key.toLowerCase() && hasModifier && shiftOk) {
        const isInputFocused =
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement ||
          (document.activeElement as HTMLElement | null)?.isContentEditable;

        if (ctrlOrMeta && isInputFocused && key.toLowerCase() !== "escape") {
          return;
        }

        e.preventDefault();
        callback();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, callback, options.ctrl, options.meta, options.shift, options.enabled]);
}
