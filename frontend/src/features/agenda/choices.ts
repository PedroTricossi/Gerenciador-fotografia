import { useState } from "react";

// A choice remembered on this device. Storage may be missing or blocked; the
// fallback then applies and nothing is remembered.
export function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return allowed.find((option) => option === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeChoice(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered; the choice still applies until the page is left.
  }
}

export function useChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState(() => readChoice(key, allowed, fallback));
  const choose = (next: T) => {
    setValue(next);
    writeChoice(key, next);
  };
  return [value, choose];
}
