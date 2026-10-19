import { formatBrl } from "../../../domain/money";
import { paletteVar } from "../../../ui";
import styles from "./ResumoTab.module.css";
import { formatTenths, shareTenths } from "./share";

type TypeShare = {
  type_id: string;
  type_name: string;
  palette_slot: number | null;
  amount_cents: number;
};

type Slice = { key: string; name: string; cents: number; color: string; strong?: boolean };

function toSlices(byType: TypeShare[], inCents: number, outCents: number): Slice[] {
  const slices: Slice[] = [];
  let others = 0;
  for (const t of byType) {
    if (t.palette_slot === null) others += t.amount_cents;
    else
      slices.push({
        key: t.type_id,
        name: t.type_name,
        cents: t.amount_cents,
        color: paletteVar(t.palette_slot),
      });
  }
  if (others > 0)
    slices.push({ key: "others", name: "Outros", cents: others, color: paletteVar(null) });
  if (inCents > outCents)
    slices.push({
      key: "free",
      name: "Livre",
      cents: inCents - outCents,
      color: "var(--color-cat-free)",
      strong: true,
    });
  return slices;
}

type Props = { byType: TypeShare[]; inCents: number; outCents: number };

export function SpendBar({ byType, inCents, outCents }: Props) {
  const slices = toSlices(byType, inCents, outCents);

  if (inCents === 0 && outCents === 0)
    return <p className={styles.note}>Nada entrou ou saiu neste período.</p>;

  if (outCents > inCents)
    return (
      <div>
        <p className={styles.warning}>
          <span aria-hidden="true">⚠ </span>
          Saiu mais do que entrou neste período: {formatBrl(outCents - inCents)} a mais
        </p>
        <ul className={styles.legend}>
          {slices.map((s) => (
            <li key={s.key} className={styles.legendItem}>
              <i className={styles.swatch} style={{ background: s.color }} aria-hidden="true" />
              {`${s.name} · ${formatBrl(s.cents)}`}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div>
      <div role="img" aria-label="Para onde foi o que entrou" className={styles.bar}>
        {slices.map((s) => (
          <span
            key={s.key}
            className={styles.slice}
            style={{ flexGrow: s.cents, background: s.color }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {slices.map((s) => (
          <li key={s.key} className={`${styles.legendItem} ${s.strong ? styles.strong : ""}`}>
            <i className={styles.swatch} style={{ background: s.color }} aria-hidden="true" />
            {`${s.name} ${formatTenths(shareTenths(s.cents, inCents) ?? 0)} · ${formatBrl(s.cents)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
