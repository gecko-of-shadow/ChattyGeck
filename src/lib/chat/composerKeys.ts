/** What the message box should do with one key, including Tab-completion. */

export interface CompletionKeyState {
  index: number;
  count: number;
}

export interface ComposerKeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /** IME composition in progress; Enter must not accept or send. */
  composing: boolean;
  tabComplete: boolean;
  completion: CompletionKeyState | null;
  text: string;
  history: readonly string[];
  historyIndex: number;
}

export type ComposerKeyDecision =
  | { kind: "cycle"; index: number }
  | { kind: "start"; backwards: boolean }
  | { kind: "accept" }
  | { kind: "close" }
  | { kind: "dismiss" }
  | { kind: "submit" }
  | { kind: "history"; historyIndex: number; text: string }
  | { kind: "escape" }
  | { kind: "none" };

/**
 * Pure key handling for the composer.
 * While a completion is open, Enter accepts it (caret stays after the trailing space) and does not send.
 */
export function reduceComposerKey(input: ComposerKeyInput): ComposerKeyDecision {
  const { key, completion } = input;
  const plainTab = key === "Tab" && input.tabComplete && !input.ctrlKey && !input.altKey && !input.metaKey;

  if (plainTab) {
    if (completion && completion.count > 0) {
      const step = input.shiftKey ? completion.count - 1 : 1;
      return { kind: "cycle", index: (completion.index + step) % completion.count };
    }
    return { kind: "start", backwards: input.shiftKey };
  }

  if (completion && completion.count > 0) {
    if (key === "ArrowDown" || key === "ArrowRight") {
      return { kind: "cycle", index: (completion.index + 1) % completion.count };
    }
    if (key === "ArrowUp" || key === "ArrowLeft") {
      return { kind: "cycle", index: (completion.index + completion.count - 1) % completion.count };
    }
    if (key === "Escape") return { kind: "close" };
    if (key === "Enter" && !input.shiftKey && !input.composing) return { kind: "accept" };
    if (key !== "Shift") return { kind: "dismiss" };
    return { kind: "none" };
  }

  if (key === "Enter" && !input.shiftKey && !input.composing) return { kind: "submit" };

  if (key === "ArrowUp" && (input.text === "" || input.historyIndex >= 0)) {
    const next = Math.min(input.historyIndex + 1, input.history.length - 1);
    if (next >= 0 && input.history[next] !== undefined) {
      return { kind: "history", historyIndex: next, text: input.history[next] };
    }
  }

  if (key === "ArrowDown" && input.historyIndex >= 0) {
    const historyIndex = input.historyIndex - 1;
    return { kind: "history", historyIndex, text: historyIndex >= 0 ? input.history[historyIndex] : "" };
  }

  if (key === "Escape") return { kind: "escape" };
  return { kind: "none" };
}
