import { PALETTE_SIZE, paletteVar } from "./palette";

test("a slot maps to its category colour", () => {
  expect(PALETTE_SIZE).toBe(8);
  expect(paletteVar(0)).toBe("var(--color-cat-0)");
  expect(paletteVar(7)).toBe("var(--color-cat-7)");
});

test("no slot or an unknown slot is the neutral other colour", () => {
  expect(paletteVar(null)).toBe("var(--color-cat-other)");
  expect(paletteVar(8)).toBe("var(--color-cat-other)");
  expect(paletteVar(-1)).toBe("var(--color-cat-other)");
});
