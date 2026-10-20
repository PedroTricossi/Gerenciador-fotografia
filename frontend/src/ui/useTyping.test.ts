import { act, renderHook } from "@testing-library/react";
import { useTyping } from "./useTyping";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("types one letter at a time, then reports done with null", () => {
  const { result } = renderHook(() => useTyping("Agenda"));
  expect(result.current).toBe("");
  act(() => vi.advanceTimersByTime(45));
  expect(result.current).toBe("A");
  act(() => vi.advanceTimersByTime(45 * 4));
  expect(result.current).toBe("Agend");
  act(() => vi.advanceTimersByTime(45));
  expect(result.current).toBeNull();
});

test("a long text still finishes within 600ms", () => {
  const { result } = renderHook(() => useTyping("x".repeat(80)));
  act(() => vi.advanceTimersByTime(300));
  expect(result.current).not.toBeNull();
  act(() => vi.advanceTimersByTime(300));
  expect(result.current).toBeNull();
});

test("waits for the delay before the first letter", () => {
  const { result } = renderHook(() => useTyping("Ok", 350));
  act(() => vi.advanceTimersByTime(349));
  expect(result.current).toBe("");
  act(() => vi.advanceTimersByTime(46));
  expect(result.current).toBe("O");
});

test("starts over when the text changes", () => {
  const { result, rerender } = renderHook(({ text }) => useTyping(text), {
    initialProps: { text: "Ab" },
  });
  act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBeNull();
  rerender({ text: "Cd" });
  expect(result.current).toBe("");
  act(() => vi.advanceTimersByTime(45));
  expect(result.current).toBe("C");
});

test("does not type when the system asks for reduced motion", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
  }));
  const { result } = renderHook(() => useTyping("Agenda"));
  expect(result.current).toBeNull();
});
