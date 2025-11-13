import { useState, useEffect } from 'react';
import { X, Loader2, Monitor, Smartphone, Tablet, XCircle } from 'lucide-react';
import { adminService, ActiveSession } from '../../services/admin';
import { format } from 'date-fns';
import { ConfirmationModal } from '../ConfirmationModal';
import { NotificationModal } from '../NotificationModal';
import { useNotification } from '../../hooks/useNotification';

interface UserSessionsModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

export function UserSessionsModal({ userId, userName, onClose }: UserSessionsModalProps) {
  const { notification, showError, hideNotification } = useNotification();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmTerminate, setConfirmTerminate] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, [userId]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await adminService.getUserSessions(userId);
      setSessions(data);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    const success = await adminService.terminateSession(sessionId);
    if (success) {
      await loadSessions();
      setConfirmTerminate(null);
    } else {
      showError('Failed to terminate session');
      setConfirmTerminate(null);
    }
  };

  const getDeviceIcon = (deviceType: string | null) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-5 w-5 text-gray-600" />;
      case 'tablet':
        return <Tablet className="h-5 w-5 text-gray-600" />;
      default:
        return <Monitor className="h-5 w-5 text-gray-600" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Active Sessions</h2>
            <p className="text-sm text-gray-600 mt-1">{userName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-2 animate-spin" />
              <p className="text-gray-600">Loading sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p>No active sessions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        {getDeviceIcon(session.device_type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium text-gray-900">
                            {session.device_name || session.device_type || 'Unknown Device'}
                          </h3>
                          {session.browser && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                              {session.browser}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          {session.os && (
                            <p>
                              <span className="font-medium">OS:</span> {session.os}
                            </p>
                          )}
                          {session.ip_address && (
                            <p>
                              <span className="font-medium">IP:</span> {session.ip_address}
                            </p>
                          )}
                          {(session.location_city || session.location_country) && (
                            <p>
                              <span className="font-medium">Location:</span>{' '}
                              {[session.location_city, session.location_country]
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                          )}
                          <p>
                            <span className="font-medium">Last Activity:</span>{' '}
                            {format(new Date(session.last_activity_at), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-xs text-gray-500">
                            Started: {format(new Date(session.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmTerminate(session.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Terminate session"
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmTerminate !== null}
        title="Terminate Session"
        message="Are you sure you want to terminate this session? The user will be logged out immediately."
        type="danger"
        onConfirm={() => confirmTerminate && handleTerminateSession(confirmTerminate)}
        onCancel={() => setConfirmTerminate(null)}
      />

      <NotificationModal
        isOpen={notification.isOpen}
        onClose={hideNotification}
        title={notification.title}
        message={notification.message}
        type={notification.type}
      />
    </div>
  );
}
