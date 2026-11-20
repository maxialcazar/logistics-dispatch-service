import { Bell, Search, PlusCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNotifications } from '../context/NotificationContext';
import { CreateDispatcherModal } from './CreateDispatcherModal';
import { NotificationsPopover } from './NotificationsPopover';
import { CommandPalette } from './CommandPalette';

const IS_APPLE_PLATFORM =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export function Topbar() {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const { unreadCount } = useNotifications();
  const [showDispatcherModal, setShowDispatcherModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (
        !event.repeat &&
        !event.altKey &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        if (showDispatcherModal) return;
        setShowNotifications(false);
        setShowCommandPalette((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [showDispatcherModal]);

  useEffect(() => {
    if (!showNotifications) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotifications]);

  return (
    <header className="flex-shrink-0 z-30 flex h-16 w-full items-center justify-between gap-2 sm:gap-4 border-b border-slate-800/80 bg-slate-900/90 px-4 sm:px-6 backdrop-blur-md">
      <button
        type="button"
        onClick={() => {
          setShowNotifications(false);
          setShowCommandPalette(true);
        }}
        aria-label={`Abrir paleta de comandos (${IS_APPLE_PLATFORM ? 'Cmd+K' : 'Ctrl+K'})`}
        aria-haspopup="dialog"
        aria-expanded={showCommandPalette}
        aria-keyshortcuts="Control+k Meta+k"
        className="group flex flex-1 min-w-0 max-w-md h-10 sm:h-9 items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/90 px-3 text-left transition-colors hover:border-slate-700 hover:bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Search
            className="h-4 w-4 flex-shrink-0 text-slate-400 transition-colors group-hover:text-brand-400"
            aria-hidden="true"
          />
          <span className="sm:hidden truncate text-xs text-slate-400 group-hover:text-slate-200">
            Buscar...
          </span>
          <span className="hidden sm:inline truncate text-sm text-slate-400 group-hover:text-slate-200">
            Buscar paquetes, conductores o zonas...
          </span>
        </span>
        <kbd
          aria-hidden="true"
          className="hidden sm:inline-flex flex-shrink-0 items-center rounded border border-slate-800/80 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-300"
        >
          {IS_APPLE_PLATFORM ? '⌘K' : 'Ctrl+K'}
        </kbd>
      </button>

      <div className="flex items-center gap-2.5 sm:gap-4 flex-shrink-0">
        <div
          role="status"
          aria-live="polite"
          title={
            isConnected
              ? 'Conexión WebSocket en tiempo real activa'
              : 'Reconectando con el servidor en tiempo real...'
          }
          className={clsx(
            'flex items-center gap-1.5 sm:gap-2 rounded-full border px-2.5 sm:px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
            isConnected
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/35 bg-amber-500/10 text-amber-300'
          )}
        >
          {isConnected ? (
            <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-amber-400" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {isConnected ? 'Conectado en Vivo' : 'Reconectando...'}
          </span>
          <span className="sm:hidden">{isConnected ? 'En Vivo' : 'Reconectando'}</span>
        </div>

        <div className="h-7 w-px bg-slate-800/80" />

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            aria-label={
              unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : 'Notificaciones'
            }
            aria-expanded={showNotifications}
            aria-haspopup="dialog"
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 flex min-w-[16px] h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-slate-900 tabular-nums"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationsPopover
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowDispatcherModal(true)}
            className="hidden sm:flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-brand-950/30 transition-all hover:bg-brand-500 active:scale-95 whitespace-nowrap"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Nuevo Despachador
          </button>
        )}
      </div>

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />

      {isAdmin && (
        <CreateDispatcherModal
          isOpen={showDispatcherModal}
          onClose={() => setShowDispatcherModal(false)}
        />
      )}
    </header>
  );
}
