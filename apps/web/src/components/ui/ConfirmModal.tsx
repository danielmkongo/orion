import { motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onCancel} />
      <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
        className="panel" onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'hsl(var(--surface))', borderTop: `3px solid ${danger ? 'hsl(var(--bad))' : 'hsl(var(--primary))'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid hsl(var(--border))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {danger && <AlertTriangle size={14} style={{ color: 'hsl(var(--bad))' }} />}
            <span className="eyebrow" style={{ fontSize: 10 }}>{title}</span>
          </div>
          <button onClick={onCancel} className="btn btn-ghost btn-sm btn-icon"><X size={14} /></button>
        </div>
        <div style={{ padding: '20px', fontSize: 13, color: 'hsl(var(--fg))' }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid hsl(var(--border))' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            style={danger ? { background: 'hsl(var(--bad))', borderColor: 'hsl(var(--bad))' } : undefined}
            onClick={() => { onConfirm(); }}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
