import { NavLink } from "react-router";
import styles from "./Nav.module.css";

type Props = { links: { to: string; label: string }[] };

export function Nav({ links }: Props) {
  return (
    <nav aria-label="Principal" className={styles.nav}>
      <span className={styles.brand}>Gerenciador Fotografia</span>
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
    </nav>
  );
}
