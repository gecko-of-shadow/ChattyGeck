import { useLayoutEffect, useState, type DependencyList, type RefObject } from "react";

/**
 * Where to draw a strip just above `anchorRef` (portaled so grid overflow can't clip it).
 * Re-measured on resize, on scroll, and when `deps` change.
 */
export function useAnchorAbove(
  anchorRef: RefObject<HTMLElement | null>,
  deps: DependencyList,
): { left: number; width: number; bottom: number } | null {
  const [box, setBox] = useState<{ left: number; width: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const place = () => {
      const rect = el.getBoundingClientRect();
      setBox({
        left: rect.left,
        width: rect.width,
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, ...deps]);

  return box;
}
