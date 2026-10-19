import { useInstalments } from "../../api/instalments";
import { currentMonth, inReminderWindow } from "../../domain/instalments";
import { formatBrl } from "../../domain/money";
import { TextLink } from "../../ui";
import { coupleLabel } from "../contracts/names";
import styles from "./Agenda.module.css";

/** In the month's last week: unpaid instalments due this month or earlier. */
export function Reminders({ today }: { today: string }) {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  const open = inReminderWindow(date);
  const { data } = useInstalments({ unpaidThrough: currentMonth(date), enabled: open });

  if (!open || !data || data.length === 0) return null;
  return (
    <section aria-labelledby="reminders-title" className={styles.reminders}>
      <h2 id="reminders-title" className={styles.dayTitle}>
        Cobranças
      </h2>
      <ul className={styles.entries}>
        {data.map((item) => (
          <li key={`${item.contract_id}:${item.number}`}>
            <TextLink to="/negocio">
              Cobrar parcela:{" "}
              {coupleLabel({ full_name: item.groom_name }, { full_name: item.bride_name })}
              {" · "}
              {item.number}/{item.count}
              {" · "}
              {formatBrl(item.amount_cents)}
            </TextLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
