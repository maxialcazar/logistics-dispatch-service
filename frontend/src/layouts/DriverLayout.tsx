
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
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Mobile Topbar */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
            <User className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="font-bold text-white leading-tight">{user?.username}</h1>
            <p className="text-xs text-slate-400">Conductor Activo</p>
          </div>
        </div>
        <button 
          onClick={logout}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto pb-20 relative">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-safe z-50">
        <div className="flex justify-around items-center h-16">
          <Link 
            to="/driver"
            className={clsx(
              "flex flex-col items-center gap-1 w-full h-full justify-center transition-colors",
              !isMap ? "text-blue-500" : "text-slate-500 hover:text-slate-300"
            )}
          >
            <List className="h-6 w-6" />
            <span className="text-xs font-medium">Mis Paquetes</span>
          </Link>
          
          <div className="w-px h-8 bg-slate-800"></div>

          <Link 
            to="/driver/map"
            className={clsx(
              "flex flex-col items-center gap-1 w-full h-full justify-center transition-colors",
              isMap ? "text-purple-500" : "text-slate-500 hover:text-slate-300"
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
