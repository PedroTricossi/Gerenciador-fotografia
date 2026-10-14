import type { InputHTMLAttributes, Ref } from "react";
import styles from "./TextInput.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  adornment?: string;
  ref?: Ref<HTMLInputElement>;
};

export function TextInput({ adornment, ref, ...rest }: Props) {
  const input = <input {...rest} ref={ref} className={styles.input} />;
  if (!adornment) return input;
  return (
    <span className={styles.group}>
      <span className={styles.adornment} aria-hidden="true">
        {adornment}
      </span>
      {input}
    </span>
  );
}
