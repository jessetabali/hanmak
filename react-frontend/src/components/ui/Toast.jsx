import { createContext, useCallback, useState } from 'react';

export const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 9999,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`toast toast-${t.type}`}
            onClick={() => dismiss(t.id)}
            style={{ cursor: 'pointer' }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
