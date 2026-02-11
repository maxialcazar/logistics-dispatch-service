import { Bell, Search, PlusCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { CreateDispatcherModal } from './CreateDispatcherModal';
import { NotificationsPopover } from './NotificationsPopover';

export function Topbar() {
  const [showDispatcherModal, setShowDispatcherModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-4 text-slate-400">
        <Search className="h-5 w-5" />
        <input 
          type="text" 
          placeholder="Ctrl+K para buscar conductores o paquetes..." 
          className="bg-transparent text-sm focus:outline-none w-64 placeholder-slate-600 focus:text-white"
        />
      </div>

      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 rounded-full border border-green-700/50 bg-green-900/20 px-3 py-1 text-xs font-medium text-green-400">
          <CheckCircle className="h-3 w-3" />
          Conectado en Vivo
        </button>

        <div className="h-8 w-px bg-slate-800" />

        <div className="relative">
            <button 
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

        <button 
            onClick={() => setShowDispatcherModal(true)}
            className="hidden sm:flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-900/20 transition-all hover:bg-blue-500 hover:shadow-blue-900/40 active:scale-95"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo Despachador
        </button>
      </div>

      <CreateDispatcherModal isOpen={showDispatcherModal} onClose={() => setShowDispatcherModal(false)} />
    </header>
  );
}
