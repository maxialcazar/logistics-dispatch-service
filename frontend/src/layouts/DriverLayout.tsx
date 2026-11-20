
import { Outlet } from 'react-router-dom';
import { LogOut, Map, List, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

export function DriverLayout() {
  const { logout, user } = useAuth();
  const location = useLocation();

  const isMap = location.pathname === '/driver/map';

  return (
    <div className={clsx("bg-slate-950 flex flex-col", isMap ? "h-screen overflow-hidden" : "min-h-screen")}>
      {/* Mobile Topbar */}
      <header className="bg-slate-900 border-b border-slate-800/80 p-4 sticky top-0 z-50 flex justify-between items-center gap-3 shadow-md flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
            <User className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-white leading-tight truncate">{user?.username}</h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/25 flex-shrink-0">
                Logistics OS
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {user?.company?.name ? `${user.company.name} · Conductor` : 'Conductor Activo'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          aria-label="Cerrar sesión"
          className="min-h-[48px] min-w-[48px] p-2 flex items-center justify-center flex-shrink-0 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Content Area */}
      <main className={clsx(
        "flex-1 min-h-0 relative",
        isMap ? "flex flex-col overflow-hidden pb-[64px]" : "overflow-y-auto pb-24"
      )}>
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800/80 pb-safe z-50">
        <div className="flex justify-around items-center h-16">
          <Link 
            to="/driver"
            className={clsx(
              "flex flex-col items-center gap-1 w-full h-full justify-center transition-colors",
              !isMap ? "text-brand-400" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <List className="h-6 w-6" />
            <span className="text-xs font-medium">Mis Paquetes</span>
          </Link>
          
          <div className="w-px h-8 bg-slate-800/80"></div>

          <Link 
            to="/driver/map"
            className={clsx(
              "flex flex-col items-center gap-1 w-full h-full justify-center transition-colors",
              isMap ? "text-brand-400" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Map className="h-6 w-6" />
            <span className="text-xs font-medium">Mapa de Ruta</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
