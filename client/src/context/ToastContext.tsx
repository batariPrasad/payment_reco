import { createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Toast } from 'primereact/toast';

interface ToastApi {
  success: (summary: string, detail?: string) => void;
  error: (summary: string, detail?: string) => void;
  warn: (summary: string, detail?: string) => void;
  info: (summary: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Toast>(null);

  const api = useMemo<ToastApi>(() => {
    const show = (severity: 'success' | 'error' | 'warn' | 'info', life: number) => (summary: string, detail?: string) =>
      ref.current?.show({ severity, summary, detail, life });
    return {
      success: show('success', 4000),
      error: show('error', 6000),
      warn: show('warn', 5000),
      info: show('info', 4000),
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      <Toast ref={ref} position="top-right" />
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
