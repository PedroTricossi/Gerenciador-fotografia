import type { Ref, SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

export function Select({ ref, ...rest }: Props) {
  return <select {...rest} ref={ref} className={styles.select} />;
}
