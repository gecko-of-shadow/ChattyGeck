import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { chat } from "@/lib/chat/controller";
import { useUi } from "@/store/ui";

function elementAt(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y);
}

function slotAt(x: number, y: number): string | null {
  return elementAt(x, y)?.closest("[data-grid-channel]")?.getAttribute("data-grid-channel") ?? null;
}

let dragActive = false;

/** Pointer or mouse drag for a grid pane header (drop on another pane to swap). A short press still clicks. */
export function beginChannelDrag(event: ReactPointerEvent | ReactMouseEvent, login: string, kind: "box"): void {
  if (dragActive || event.button !== 0) return;
  const target = event.target;
  if (target instanceof Element) {
    if (target.closest("button")) return;
    if (target.closest("input, textarea, [role='menu'], [data-no-drag]")) return;
  }
  dragActive = true;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let lastX = startX;
  let lastY = startY;

  const move = (ev: PointerEvent | MouseEvent) => {
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!dragging) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      dragging = true;
    }
    const slot = slotAt(ev.clientX, ev.clientY);
    if (useUi.getState().dropTarget !== slot) useUi.setState({ dropTarget: slot });
  };

  const stopListening = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("mouseup", up);
  };

  const up = (ev: PointerEvent | MouseEvent) => {
    if (!dragActive) return;
    dragActive = false;
    stopListening();
    const x = ev.clientX || lastX;
    const y = ev.clientY || lastY;
    const slot = slotAt(x, y);
    useUi.setState({ dropTarget: null });
    if (!dragging) return;
    ev.preventDefault();
    // The click that follows a drop isn't a click. When the browser sends none (the drop landed on another
    // element), stop waiting soon, or the next real click (say a pane's "−") would be swallowed.
    const swallow = (click: MouseEvent) => click.stopPropagation();
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 100);
    if (kind === "box" && slot && slot !== login) chat.swapGridChannels(login, slot);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("mousemove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("mouseup", up);
}
