import { Bell, Search, PlusCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { CreateDispatcherModal } from './CreateDispatcherModal';
import { NotificationsPopover } from './NotificationsPopover';

export function Topbar() {
  const { user } = useAuth();
  const [showDispatcherModal, setShowDispatcherModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const isAdmin = user?.role === 'admin';

  return (
    <header className="flex-shrink-0 z-30 flex h-16 w-full items-center justify-between gap-2 sm:gap-4 border-b border-slate-800/80 bg-slate-900/90 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex flex-1 min-w-0 max-w-xs items-center gap-2.5 text-slate-400">
        <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <input 
          type="text" 
          placeholder="Ctrl+K para buscar conductores o paquetes..." 
          className="bg-transparent text-sm focus:outline-none w-full min-w-0 placeholder-slate-500 text-slate-200 focus:text-white"
        />
      </div>

      <div className="flex items-center gap-2.5 sm:gap-4 flex-shrink-0">
        <button type="button" className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 sm:px-3 py-1 text-xs font-medium text-emerald-300 whitespace-nowrap">
          <CheckCircle className="h-3 w-3 flex-shrink-0" />
          <span className="hidden sm:inline">Conectado en Vivo</span>
          <span className="sm:hidden">En Vivo</span>
        </button>

        <div className="h-7 w-px bg-slate-800/80" />

        <div className="relative">
            <button 
                type="button"
                aria-label="Notificaciones"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-900 animate-pulse" />
            </button>
            {/* Popover */}
            {showNotifications && (
                <div className="absolute right-0 top-12 w-80 z-50">
                    <NotificationsPopover isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
                </div>
            )}
        </div>

        {isAdmin && (
          <button 
              onClick={() => setShowDispatcherModal(true)}
              className="hidden sm:flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-brand-950/30 transition-all hover:bg-brand-500 active:scale-95 whitespace-nowrap"
          >
            <PlusCircle className="h-4 w-4" />
            Nuevo Despachador
          </button>
        )}
      </div>

      {isAdmin && (
        <CreateDispatcherModal isOpen={showDispatcherModal} onClose={() => setShowDispatcherModal(false)} />
      )}
    </header>
  );
}
