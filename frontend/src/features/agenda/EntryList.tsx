import { Link } from "react-router";
import type { AgendaEntryOut } from "../../api/client";
import { coupleLabel } from "../contracts/names";
import styles from "./Agenda.module.css";
import { entryKey, entryLabel, kindLabel, timeLabel } from "./entries";

export function EntryList({ entries }: { entries: AgendaEntryOut[] }) {
  return (
    <ul className={styles.entries}>
      {entries.map((entry) => (
        <li key={entryKey(entry)} className={styles.entry}>
          <span className={styles.time}>{timeLabel(entry.start_time)}</span>
          {/* The link holds only the couple, so its visible text is part of its full name;
              its ::after stretches the click and focus area over the whole row. */}
          <Link
            to={`/contratos/${entry.contract_id}`}
            className={styles.couple}
            aria-label={entryLabel(entry)}
          >
            {coupleLabel(entry.groom, entry.bride)}
          </Link>
          <span className={styles.kind}>{kindLabel(entry.kind)}</span>
          <span className={styles.venue}>{entry.venue_name}</span>
        </li>
      ))}
    </ul>
  );
}
