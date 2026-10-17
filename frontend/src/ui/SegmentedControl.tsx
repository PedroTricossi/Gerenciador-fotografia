import styles from "./SegmentedControl.module.css";

type Props<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of buttons of which exactly one is pressed. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={`${styles.option} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(option.value)}
          >
            <span aria-hidden="true" className={styles.indicator}>
              {selected ? "●" : "○"}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
