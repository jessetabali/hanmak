export default function Badge({ color = 'secondary', children, style }) {
  return (
    <span className={`badge badge-${color}`} style={style}>
      {children}
    </span>
  );
}

export function statusColor(status) {
  const map = {
    active: 'success', completed: 'success', approved: 'success', verified: 'success',
    enabled: 'success', success: 'success', live: 'success', released: 'success',
    suspended: 'danger', voided: 'danger', rejected: 'danger', declined: 'danger',
    failed: 'danger', revoked: 'danger', deleted: 'danger', error: 'danger',
    pending: 'warning', sent: 'warning', in_progress: 'warning', running: 'warning',
    partially_signed: 'warning', review: 'warning', queued: 'warning', overdue: 'warning',
    draft: 'secondary', inactive: 'secondary', archived: 'secondary', cancelled: 'secondary',
    viewed: 'primary', signed: 'success', expired: 'danger',
  };
  return map[String(status || '').toLowerCase()] || 'secondary';
}
