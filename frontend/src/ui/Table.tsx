import type { ReactNode } from "react";
import styles from "./Table.module.css";

export type Column<T> = { header: string; cell: (row: T) => ReactNode; align?: "start" | "end" };

type Props<T> = {
  label: string;
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  rowMuted?: (row: T) => boolean;
  empty?: ReactNode;
};

export function Table<T>({ label, columns, rows, rowKey, rowMuted, empty }: Props<T>) {
  if (rows.length === 0 && empty) return <div className={styles.empty}>{empty}</div>;
  return (
    <table className={styles.table} aria-label={label}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.header}
              scope="col"
              className={column.align === "end" ? styles.end : undefined}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className={rowMuted?.(row) ? styles.muted : undefined}>
            {columns.map((column) => (
              <td key={column.header} className={column.align === "end" ? styles.end : undefined}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
