import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

export interface NotificationPreferences {
  driverAlerts: boolean;
  packageUpdates: boolean;
  incidentAlerts: boolean;
  showToasts: boolean;
  soundEnabled: boolean;
}

interface NotificationContextData {
  notifications: Notification[];
  unreadCount: number;
  preferences: NotificationPreferences;
  updatePreferences: (patch: Partial<NotificationPreferences>) => void;
  addNotification: (title: string, message: string, type: Notification['type']) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NOTIFS_PREFS_KEY = 'user_notification_prefs';
const NOTIFS_PREFS_EVENT = 'lds:notification-prefs-updated';
const MAX_NOTIFICATIONS = 100;

const DEFAULT_PREFERENCES: NotificationPreferences = {
  driverAlerts: true,
  packageUpdates: true,
  incidentAlerts: true,
  showToasts: true,
  soundEnabled: false,
};

const NotificationContext = createContext<NotificationContextData | null>(null);

let sharedAudioCtx: AudioContext | null = null;

function normalizePreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_PREFERENCES };
  }
  const rec = value as Record<string, unknown>;
  return {
    driverAlerts:
      typeof rec.driverAlerts === 'boolean'
        ? rec.driverAlerts
        : DEFAULT_PREFERENCES.driverAlerts,
    packageUpdates:
      typeof rec.packageUpdates === 'boolean'
        ? rec.packageUpdates
        : typeof rec.newPackages === 'boolean'
          ? rec.newPackages
          : DEFAULT_PREFERENCES.packageUpdates,
    incidentAlerts:
      typeof rec.incidentAlerts === 'boolean'
        ? rec.incidentAlerts
        : typeof rec.systemErrors === 'boolean'
          ? rec.systemErrors
          : DEFAULT_PREFERENCES.incidentAlerts,
    showToasts:
      typeof rec.showToasts === 'boolean'
        ? rec.showToasts
        : DEFAULT_PREFERENCES.showToasts,
    soundEnabled:
      typeof rec.soundEnabled === 'boolean'
        ? rec.soundEnabled
        : DEFAULT_PREFERENCES.soundEnabled,
  };
}

function readStoredPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(NOTIFS_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function arePreferencesEqual(a: NotificationPreferences, b: NotificationPreferences): boolean {
  return (
    a.driverAlerts === b.driverAlerts &&
    a.packageUpdates === b.packageUpdates &&
    a.incidentAlerts === b.incidentAlerts &&
    a.showToasts === b.showToasts &&
    a.soundEnabled === b.soundEnabled
  );
}

function createNotificationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function playNotificationChime(type: Notification['type']): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume().catch(() => {});
    }

    const now = sharedAudioCtx.currentTime;
    const oscillator = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();

    oscillator.type = type === 'error' || type === 'warning' ? 'triangle' : 'sine';
    const frequency =
      type === 'error' ? 440 : type === 'warning' ? 523.25 : type === 'success' ? 659.25 : 587.33;
    oscillator.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    oscillator.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  } catch {
    // Ignore audio playback errors when blocked by browser autoplay policy
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(readStoredPreferences);
  const preferencesRef = useRef<NotificationPreferences>(preferences);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    const syncPreferences = (next: NotificationPreferences) => {
      preferencesRef.current = next;
      setPreferences((prev) => (arePreferencesEqual(prev, next) ? prev : next));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== NOTIFS_PREFS_KEY) return;
      syncPreferences(readStoredPreferences());
    };

    const handleCustomSync = (event: Event) => {
      const customEvent = event as CustomEvent<NotificationPreferences>;
      if (customEvent.detail) {
        syncPreferences(normalizePreferences(customEvent.detail));
      } else {
        syncPreferences(readStoredPreferences());
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(NOTIFS_PREFS_EVENT, handleCustomSync);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(NOTIFS_PREFS_EVENT, handleCustomSync);
    };
  }, []);

  const updatePreferences = useCallback((patch: Partial<NotificationPreferences>) => {
    const next: NotificationPreferences = {
      ...preferencesRef.current,
      ...patch,
    };
    preferencesRef.current = next;
    setPreferences(next);
    try {
      window.localStorage.setItem(NOTIFS_PREFS_KEY, JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent<NotificationPreferences>(NOTIFS_PREFS_EVENT, { detail: next })
      );
    } catch {
      // Ignore storage errors in restricted environments
    }
  }, []);

  const addNotification = useCallback(
    (title: string, message: string, type: Notification['type']) => {
      const newNotif: Notification = {
        id: createNotificationId(),
        title,
        message,
        type,
        time: 'Justo ahora',
        read: false,
        timestamp: new Date(),
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, MAX_NOTIFICATIONS));

      const activePrefs = preferencesRef.current;
      if (activePrefs.showToasts) {
        const toastMethod =
          type === 'warning'
            ? toast.warning
            : type === 'error'
              ? toast.error
              : type === 'success'
                ? toast.success
                : toast.message;
        toastMethod(message, { description: title });
      }

      if (activePrefs.soundEnabled) {
        playNotificationChime(type);
      }
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = useMemo(
    () => notifications.reduce((count, n) => (n.read ? count : count + 1), 0),
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      preferences,
      updatePreferences,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    }),
    [
      notifications,
      unreadCount,
      preferences,
      updatePreferences,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
