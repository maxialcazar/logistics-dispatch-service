
import { createContext, useContext, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  time: string;
  read: boolean;
  timestamp: Date;
}

interface NotificationContextData {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextData | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    const newNotif: Notification = {
      id: crypto.randomUUID(),
      title,
      message,
      type,
      time: 'Justo ahora',
      read: false,
      timestamp: new Date()
    };

    setNotifications(prev => [newNotif, ...prev]);

    // Also trigger toast
    toast[type === 'warning' ? 'warning' : type === 'error' ? 'error' : type === 'success' ? 'success' : 'message'](
      message, 
      { description: title }
    );
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotifications must be used within NotificationProvider');
    return context;
}
