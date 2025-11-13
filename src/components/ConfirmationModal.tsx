import { X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const colors = {
    danger: {
      header: 'bg-red-600 dark:bg-red-700',
      confirmButton: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
    },
    warning: {
      header: 'bg-yellow-600 dark:bg-yellow-700',
      confirmButton: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
    },
    info: {
      header: 'bg-blue-600 dark:bg-blue-700',
      confirmButton: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
    },
  };

  const colorScheme = colors[type];

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
        <div className={`${colorScheme.header} px-6 py-4 flex items-center justify-between`}>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-8 bg-slate-50 dark:bg-slate-900">
          <p className="text-gray-900 dark:text-gray-100 text-center leading-relaxed">{message}</p>
        </div>

        <div className="px-6 py-4 bg-white dark:bg-slate-800 flex justify-center gap-3">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors min-w-[100px]"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`${colorScheme.confirmButton} text-white px-6 py-2 rounded-lg font-medium transition-colors min-w-[100px]`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
