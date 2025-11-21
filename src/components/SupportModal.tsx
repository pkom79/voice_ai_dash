import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sendEmail } from '../services/resend';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const { profile } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    setError(null);

    try {
      const userEmail = profile?.email || 'Unknown User';
      const userName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Unknown Name';
      
      const htmlContent = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Support Request</h2>
          <p><strong>From:</strong> ${userName} (${userEmail})</p>
          <p><strong>User ID:</strong> ${profile?.id}</p>
          <hr />
          <h3>Message:</h3>
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
      `;

      await sendEmail(
        'support@smartcompanyai.com',
        `Support Request from ${userName}`,
        htmlContent,
        profile?.id || '',
        'support_message'
      );

      setSent(true);
      setTimeout(() => {
        onClose();
        setSent(false);
        setMessage('');
      }, 2000);
    } catch (err) {
      console.error('Error sending support message:', err);
      setError('Failed to send message. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-blue-600 dark:bg-blue-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Contact Support</h3>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {sent ? (
            <div className="text-center py-8">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <Send className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Message Sent!</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                We've received your message and will get back to you shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  How can we help you?
                </label>
                <textarea
                  id="message"
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400"
                  placeholder="Describe your issue or question..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !message.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Message
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
