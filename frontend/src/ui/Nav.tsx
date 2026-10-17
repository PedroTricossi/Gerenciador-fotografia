import { NavLink } from "react-router";
import styles from "./Nav.module.css";
import { ThemeSwitch } from "./ThemeSwitch";

type Props = { links: { to: string; label: string }[] };

export function Nav({ links }: Props) {
  return (
    <nav aria-label="Principal" className={styles.nav}>
      <span className={styles.brand}>▣ ESTÚDIO</span>
      <ul className={styles.links}>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <ThemeSwitch />
      </div>
    </nav>
  );
}
