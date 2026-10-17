import { type InputHTMLAttributes, type Ref, useId } from "react";
import styles from "./TextInput.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  adornment?: string;
  ref?: Ref<HTMLInputElement>;
};

const SPOKEN: Record<string, string> = { R$: "em reais" };

export function TextInput({ adornment, ref, ...rest }: Props) {
  const adornmentId = useId();
  if (!adornment) return <input {...rest} ref={ref} className={styles.input} />;
  const describedBy =
    [rest["aria-describedby"], adornmentId].filter(Boolean).join(" ") || undefined;
  return (
    <span className={styles.group}>
      <span className={styles.adornment} aria-hidden="true">
        {adornment}
      </span>
      <span id={adornmentId} className={styles.spoken}>
        {SPOKEN[adornment] ?? adornment}
      </span>
      <input
        {...rest}
        aria-describedby={describedBy}
        ref={ref}
        className={`${styles.input} ${styles.inGroup}`}
      />
    </span>
  );
}
