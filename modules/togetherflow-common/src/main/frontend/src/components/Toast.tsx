/**
 * Single feedback mechanism reused across every TogetherFlow app (§14.3) — screens
 * must not invent their own success/error banners.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useT } from "../i18n/I18nContext";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Shown for errors so a user can quote it to support (§13.2). */
  reference?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      // Errors stay until dismissed — auto-hiding a failure the user needs to act on
      // is how people lose track of what went wrong.
      if (toast.tone !== "error") {
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="tf-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`tf-toast tf-toast--${toast.tone}`} role="status">
            <div className="tf-toast__body">
              <p className="tf-toast__message">{toast.message}</p>
              {toast.reference ? (
                <p className="tf-toast__reference">
                  {t("toast.reference")} <code>{toast.reference}</code>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="tf-toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label={t("toast.dismiss")}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
