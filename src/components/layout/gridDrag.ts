import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { chat } from "@/lib/chat/controller";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";

function elementAt(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y);
}

function slotAt(x: number, y: number): string | null {
  return elementAt(x, y)?.closest("[data-grid-channel]")?.getAttribute("data-grid-channel") ?? null;
}

function overGrid(x: number, y: number): boolean {
  return !!elementAt(x, y)?.closest("[data-testid='chat-grid'], [data-testid='grid-canvas']");
}

let dragActive = false;

/** Pointer or mouse drag for a grid header or a sidebar row. A short press still clicks. */
export function beginChannelDrag(event: ReactPointerEvent | ReactMouseEvent, login: string, kind: "box" | "sidebar"): void {
  if (dragActive || event.button !== 0) return;
  const target = event.target;
  if (target instanceof Element) {
    const button = target.closest("button");
    if (button && !button.hasAttribute("data-drag-channel")) return;
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
    window.addEventListener("click", (click) => click.stopPropagation(), { capture: true, once: true });
    // A Twitch follow that isn't in the app yet: add it (joins its chat) before placing it.
    if (kind === "sidebar" && !useChat.getState().settings.channels.includes(login)) {
      // Dropped on a pane it takes that pane's place (below), so it isn't also put in a free slot.
      const added = chat.addChannel(login, { toGrid: !slot });
      if (!added.ok) {
        toast.error(added.error ?? `Couldn't open #${login}`);
        return;
      }
    }
    const mode = useChat.getState().settings.mode;
    if (kind === "sidebar" && mode === "focused") {
      chat.focus(login);
      return;
    }
    if (slot && slot !== login) {
      if (kind === "box") chat.swapGridChannels(login, slot);
      else chat.replaceInGrid(slot, login);
      return;
    }
    if (kind === "sidebar" && !slot && overGrid(x, y)) chat.showInGrid(login);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("mousemove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("mouseup", up);
}
