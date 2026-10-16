import { Link } from "react-router";
import type { AgendaEntryOut } from "../../api/client";
import { coupleLabel } from "../contracts/names";
import styles from "./Agenda.module.css";
import { entryKey, entryLabel, kindLabel, timeLabel } from "./entries";

export function EntryList({ entries }: { entries: AgendaEntryOut[] }) {
  return (
    <ul className={styles.entries}>
      {entries.map((entry) => (
        <li key={entryKey(entry)}>
          <Link
            to={`/contratos/${entry.contract_id}`}
            className={styles.entry}
            aria-label={entryLabel(entry)}
          >
            <span className={styles.time}>{timeLabel(entry.start_time)}</span>
            <span className={styles.couple}>{coupleLabel(entry.groom, entry.bride)}</span>
            <span className={styles.kind}>{kindLabel(entry.kind)}</span>
            <span className={styles.venue}>{entry.venue_name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
