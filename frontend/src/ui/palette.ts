/** How many categorical chart colours the stylesheet defines (`--color-cat-0` … `--color-cat-7`). */
export const PALETTE_SIZE = 8;

/** The CSS colour for a type's palette slot; no slot (or an unknown one) is the neutral "other". */
export function paletteVar(slot: number | null): string {
  return slot === null || !Number.isInteger(slot) || slot < 0 || slot >= PALETTE_SIZE
    ? "var(--color-cat-other)"
    : `var(--color-cat-${slot})`;
}
