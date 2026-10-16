import { readChoice, writeChoice } from "./choices";

const OPTIONS = ["list", "calendar"] as const;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("a stored choice is read back; anything else falls back", () => {
  expect(readChoice("k", OPTIONS, "list")).toBe("list");
  writeChoice("k", "calendar");
  expect(readChoice("k", OPTIONS, "list")).toBe("calendar");
  localStorage.setItem("k", "week");
  expect(readChoice("k", OPTIONS, "list")).toBe("list");
});

test("blocked storage falls back and never throws", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => writeChoice("k", "calendar")).not.toThrow();
  expect(readChoice("k", OPTIONS, "list")).toBe("list");
});
