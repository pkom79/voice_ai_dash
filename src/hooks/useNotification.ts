import { useState, useCallback } from 'react';

interface NotificationState {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export function useNotification() {
  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showNotification = useCallback((
    title: string,
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    setNotification({
      isOpen: true,
      title,
      message,
      type,
    });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  }, []);

  const showSuccess = useCallback((message: string, title: string = 'Success') => {
    showNotification(title, message, 'success');
  }, [showNotification]);

  const showError = useCallback((message: string, title: string = 'Error') => {
    showNotification(title, message, 'error');
  }, [showNotification]);

  const showWarning = useCallback((message: string, title: string = 'Warning') => {
    showNotification(title, message, 'warning');
  }, [showNotification]);

  const showInfo = useCallback((message: string, title: string = 'Information') => {
    showNotification(title, message, 'info');
  }, [showNotification]);

  return {
    notification,
    showNotification,
    hideNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}
