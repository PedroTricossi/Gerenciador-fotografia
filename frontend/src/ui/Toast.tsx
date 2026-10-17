import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "./Button";
import styles from "./Toast.module.css";

type ToastOptions = { tone?: "info" | "error"; action?: { label: string; onClick: () => void } };
type Notify = (message: string, options?: ToastOptions) => void;
type ToastItem = ToastOptions & { id: number; message: string };

const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<Notify>((message, options = {}) => {
    nextId.current += 1;
    const id = nextId.current;
    setItems((current) => [...current, { id, message, ...options }]);
  }, []);

  return (
    <ToastContext value={notify}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  // Time left on the auto-dismiss timer; pausing keeps what is left, not a fresh timeout.
  const remaining = useRef(item.action ? 10_000 : 6_000);
  const { id } = item;

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, id, onDismiss]);

  return (
    <div
      className={`${styles.toast} ${item.tone === "error" ? styles.error : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <span>{item.message}</span>
      {item.action && (
        <Button
          variant="ghost"
          onClick={() => {
            onDismiss(id);
            item.action?.onClick();
          }}
        >
          {item.action.label}
        </Button>
      )}
      <Button variant="ghost" aria-label="Fechar aviso" onClick={() => onDismiss(id)}>
        ×
      </Button>
    </div>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (notify === null) throw new Error("useToast needs a ToastProvider");
  return notify;
}
