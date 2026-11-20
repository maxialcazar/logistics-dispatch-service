import { Bell, Trash2, CheckCircle } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsPopover({ isOpen, onClose }: Props) {
  const { notifications, unreadCount, markAllAsRead, clearAll } = useNotifications();

  if (!isOpen) return null;

  return (
    <>
        {/* Backdrop to close */}
        <div className="fixed inset-0 z-40" onClick={onClose} />

        <div className="absolute right-200 top-0 w-80 bg-slate-900 border border-slate-800/80 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3 border-b border-slate-800/80 bg-slate-950/50 flex justify-between items-center">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Bell size={14} className="text-brand-400" /> Notificaciones
                </h3>
                {unreadCount > 0 && (
                    <span className="text-xs bg-red-500 text-white px-1.5 rounded-full tabular-nums">{unreadCount}</span>
                )}
            </div>
            
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">
                        No tienes notificaciones nuevas
                    </div>
                ) : (
                    notifications.map(n => (
                        <div key={n.id} className={`p-3 border-b border-slate-800/80 last:border-0 hover:bg-slate-800/50 transition-colors ${!n.read ? 'bg-slate-800/30' : ''}`}>
                            <div className="flex gap-3">
                                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                                    n.type === 'success' ? 'bg-emerald-500' :
                                    n.type === 'warning' ? 'bg-amber-500' : 
                                    n.type === 'error' ? 'bg-red-500' : 'bg-brand-500'
                                }`} />
                                <div>
                                    <h4 className={`text-xs ${!n.read ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>{n.title}</h4>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{n.message}</p>
                                    <span className="text-[10px] text-slate-400 mt-2 block capitalize">
                                        {formatDistanceToNow(n.timestamp, { addSuffix: true, locale: es })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <div className="p-2 border-t border-slate-800/80 bg-slate-950/30 flex justify-between">
                <button 
                    onClick={markAllAsRead}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
                >
                    <CheckCircle size={12} /> Marcar leído
                </button>
                <button 
                    onClick={clearAll}
                    className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                    <Trash2 size={12} /> Limpiar
                </button>
            </div>
        </div>
    </>
  );
}
