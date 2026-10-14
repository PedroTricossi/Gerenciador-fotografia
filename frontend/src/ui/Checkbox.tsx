import { useId } from "react";
import styles from "./Checkbox.module.css";

type Props = { label: string; checked: boolean; onChange: (checked: boolean) => void };

export function Checkbox({ label, checked, onChange }: Props) {
  const id = useId();
  return (
    <span className={styles.checkbox}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}
