import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
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

  const notify = useCallback<Notify>(
    (message, options = {}) => {
      nextId.current += 1;
      const id = nextId.current;
      setItems((current) => [...current, { id, message, ...options }]);
      setTimeout(() => dismiss(id), options.action ? 10_000 : 6_000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={notify}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`${styles.toast} ${item.tone === "error" ? styles.error : ""}`}
          >
            <span>{item.message}</span>
            {item.action && (
              <Button
                variant="ghost"
                onClick={() => {
                  dismiss(item.id);
                  item.action?.onClick();
                }}
              >
                {item.action.label}
              </Button>
            )}
            <Button variant="ghost" aria-label="Fechar aviso" onClick={() => dismiss(item.id)}>
              ×
            </Button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (notify === null) throw new Error("useToast needs a ToastProvider");
  return notify;
}
