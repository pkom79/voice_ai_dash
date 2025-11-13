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
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-yellow-600',
    info: 'bg-blue-600',
  };

  const bgColor = colors[type];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-md w-full">
        <div className={`${bgColor} px-6 py-4 rounded-t-lg flex items-center justify-between`}>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-6">
          <p className="text-slate-300 leading-relaxed">{message}</p>
        </div>

        <div className="px-6 py-4 bg-slate-900/50 rounded-b-lg flex justify-center">
          <button
            onClick={onClose}
            className={`${bgColor} text-white px-8 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity min-w-[120px]`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
