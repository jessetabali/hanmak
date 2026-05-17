import Modal from './Modal';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={loading}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {message}
      </p>
    </Modal>
  );
}
