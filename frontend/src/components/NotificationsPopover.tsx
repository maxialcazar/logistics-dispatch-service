import { Bell, Trash2, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import clsx from 'clsx';
import { useNotifications } from '../context/NotificationContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsPopover({ isOpen }: Props) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Centro de notificaciones"
      className="fixed inset-x-3 top-[4.25rem] sm:inset-x-auto sm:absolute sm:right-0 sm:top-12 sm:w-80 bg-slate-900 border border-slate-800/80 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden"
    >
      <div className="px-3.5 py-3 border-b border-slate-800/80 bg-slate-950/60 flex justify-between items-center gap-2">
        <h3 className="font-semibold text-white text-sm flex items-center gap-2">
          <Bell size={14} className="text-brand-400" aria-hidden="true" />
          <span>Notificaciones</span>
        </h3>
        {unreadCount > 0 && (
          <span className="text-[11px] font-semibold bg-red-600 text-white px-2 py-0.5 rounded-full tabular-nums">
            {unreadCount}
          </span>
        )}
      </div>

      <div className="max-h-[min(22rem,calc(100vh-11rem))] overflow-y-auto custom-scrollbar">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="h-6 w-6 text-slate-600 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-300">No tienes notificaciones nuevas</p>
            <p className="text-xs text-slate-400 mt-1">
              Las alertas operativas aparecerán aquí en tiempo real.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => markAsRead(n.id)}
              className={clsx(
                'w-full text-left p-3 border-b border-slate-800/80 last:border-0 transition-colors hover:bg-slate-800/50 focus:outline-none focus-visible:bg-slate-800/70',
                !n.read ? 'bg-slate-800/35' : 'bg-transparent opacity-80 hover:opacity-100'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className={clsx(
                    'mt-1.5 h-2 w-2 rounded-full flex-shrink-0',
                    n.type === 'success'
                      ? 'bg-emerald-500'
                      : n.type === 'warning'
                        ? 'bg-amber-500'
                        : n.type === 'error'
                          ? 'bg-red-500'
                          : 'bg-brand-500'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className={clsx(
                        'text-xs leading-snug',
                        !n.read ? 'font-semibold text-white' : 'font-medium text-slate-300'
                      )}
                    >
                      {n.title}
                    </h4>
                    {!n.read && (
                      <span
                        aria-label="Sin leer"
                        className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400 flex-shrink-0"
                      />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed break-words">
                    {n.message}
                  </p>
                  <span className="text-[11px] text-slate-400 mt-1.5 block tabular-nums">
                    {formatDistanceToNow(n.timestamp, { addSuffix: true, locale: es })}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={markAllAsRead}
          disabled={unreadCount === 0}
          className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1.5 py-1 px-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle size={12} aria-hidden="true" />
          <span>Marcar leído</span>
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={notifications.length === 0}
          className="text-xs font-medium text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1.5 py-1 px-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={12} aria-hidden="true" />
          <span>Limpiar</span>
        </button>
      </div>
    </div>
  );
}
