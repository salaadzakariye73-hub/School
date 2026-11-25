import { Modal } from './Modal';
import { useTheme } from '../../context/ThemeContext';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  loading = false,
}: ConfirmModalProps) {
  const { tr } = useTheme();

  return (
    <Modal open={open} onClose={onClose} title={title || tr('confirmDeleteTitle')} maxWidthClass="max-w-md">
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        {message || tr('confirmDeleteMessage')}
      </p>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {tr('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
        >
          {loading ? tr('loading') : confirmLabel || tr('yesDelete')}
        </button>
      </div>
    </Modal>
  );
}
