import { useEffect, useState } from "react";

const LETTER_MS = 45;
const MAX_MS = 600;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// The text as typed so far, or null once it is all there. Long texts type faster
// so none takes more than MAX_MS. Under reduced motion it is done at once.
export function useTyping(text: string, delayMs = 0): string | null {
  const [state, setState] = useState(() => ({ text, count: startCount(text) }));
  if (state.text !== text) setState({ text, count: startCount(text) });

  const done = state.text === text && state.count >= text.length;
  useEffect(() => {
    if (done) return;
    const step = Math.min(LETTER_MS, Math.floor(MAX_MS / text.length));
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        setState((current) => ({ ...current, count: current.count + 1 }));
      }, step);
    }, delayMs);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [text, delayMs, done]);

  if (state.text !== text) return "";
  return done ? null : text.slice(0, state.count);
}

function startCount(text: string): number {
  return prefersReducedMotion() ? text.length : 0;
}
