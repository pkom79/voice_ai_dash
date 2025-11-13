import { X } from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

export function NotificationModal({ isOpen, onClose, title, message, type = 'info' }: NotificationModalProps) {
  if (!isOpen) return null;

  const colors = {
    success: {
      header: 'bg-green-600 dark:bg-green-700',
      button: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
    },
    error: {
      header: 'bg-red-600 dark:bg-red-700',
      button: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
    },
    warning: {
      header: 'bg-yellow-600 dark:bg-yellow-700',
      button: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
    },
    info: {
      header: 'bg-blue-600 dark:bg-blue-700',
      button: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
    },
  };

  const colorScheme = colors[type];

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
        <div className={`${colorScheme.header} px-6 py-4 flex items-center justify-between`}>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-8 bg-slate-50 dark:bg-slate-900">
          <p className="text-gray-900 dark:text-gray-100 text-center leading-relaxed">{message}</p>
        </div>

        <div className="px-6 py-4 bg-white dark:bg-slate-800 flex justify-center">
          <button
            onClick={onClose}
            className={`${colorScheme.button} text-white px-8 py-2 rounded-lg font-medium transition-colors min-w-[120px]`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
