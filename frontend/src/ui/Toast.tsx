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
import { useTyping } from "./useTyping";

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

// The box takes this long to switch on; the message types once it is open.
const SWITCH_ON_MS = 350;

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [closing, setClosing] = useState(false);
  const paused = hovered || focused;
  // Time left on the auto-dismiss timer; pausing keeps what is left, not a fresh timeout.
  const remaining = useRef(item.action ? 10_000 : 6_000);
  const box = useRef<HTMLDivElement>(null);
  const typed = useTyping(item.message, SWITCH_ON_MS);
  const { id } = item;
  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (paused || closing) return;
    const startedAt = Date.now();
    const timer = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, closing, close]);

  useEffect(() => {
    // With no switch-off to wait for (reduced motion), the toast goes at once.
    if (closing && box.current && !hasAnimation(box.current)) onDismiss(id);
  }, [closing, id, onDismiss]);

  return (
    <div
      ref={box}
      className={`${styles.toast} ${item.tone === "error" ? styles.error : ""} ${closing ? styles.closing : ""}`}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onDismiss(id);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {/* The whole message stays in the text; data-typed only drives what is drawn. */}
      <span className={styles.message} data-typed={typed ?? undefined}>
        {item.message}
      </span>
      {item.action && (
        <Button
          variant="ghost"
          onClick={() => {
            close();
            item.action?.onClick();
          }}
        >
          {item.action.label}
        </Button>
      )}
      <Button variant="ghost" aria-label="Fechar aviso" onClick={close}>
        ×
      </Button>
    </div>
  );
}

function hasAnimation(element: Element): boolean {
  const name = window.getComputedStyle(element).animationName;
  return name !== "" && name !== "none";
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (notify === null) throw new Error("useToast needs a ToastProvider");
  return notify;
}
