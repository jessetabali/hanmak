import { useEffect } from 'react';

export default function Drawer({ open, onClose, title, children, width = 440 }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div
        className="drawer"
        style={{ width }}
        role="complementary"
        aria-label={title}
      >
        <div className="drawer-header">
          <h3 className="drawer-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  );
}
