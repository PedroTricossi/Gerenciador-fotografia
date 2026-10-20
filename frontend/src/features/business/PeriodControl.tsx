import { currentMonth, addMonths } from "../../domain/instalments";
import { Button, SegmentedControl } from "../../ui";
import { monthName } from "./groups";
import styles from "./PeriodControl.module.css";

export type Period = { kind: "month" | "year"; value: string };

const KINDS = [
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
] as const;

/** The period `n` months or years away (negative goes back). */
export function shiftPeriod(p: Period, n: number): Period {
  return p.kind === "month"
    ? { kind: "month", value: addMonths(p.value, n) }
    : { kind: "year", value: String(Number(p.value) + n).padStart(4, "0") };
}

/** "outubro 2026" for a month, "2026" for a year. */
export function periodLabel(p: Period): string {
  return p.kind === "month"
    ? `${monthName(p.value).toLowerCase()} ${p.value.slice(0, 4)}`
    : p.value;
}

function switchKind(p: Period, kind: Period["kind"]): Period {
  if (kind === p.kind) return p;
  if (kind === "year") return { kind, value: p.value.slice(0, 4) };
  const now = currentMonth();
  return { kind, value: now.startsWith(p.value) ? now : `${p.value}-01` };
}

type Props = { value: Period; onChange: (period: Period) => void };

export function PeriodControl({ value, onChange }: Props) {
  return (
    <div className={styles.control}>
      <SegmentedControl
        label="Período"
        options={KINDS}
        value={value.kind}
        onChange={(kind) => onChange(switchKind(value, kind))}
      />
      <div className={styles.stepper}>
        <Button aria-label="Período anterior" onClick={() => onChange(shiftPeriod(value, -1))}>
          ◀
        </Button>
        <h2 className={styles.heading}>{periodLabel(value)}</h2>
        <Button aria-label="Próximo período" onClick={() => onChange(shiftPeriod(value, 1))}>
          ▶
        </Button>
      </div>
    </div>
  );
}
