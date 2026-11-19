import { BarChart3, Map, Truck, Package, Users, PieChart, MapPin, Settings, LogOut, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { icon: BarChart3, label: 'Tablero Principal', path: '/' },
  { icon: MapPin, label: 'Zonas', path: '/zones' },
  { icon: Map, label: 'Mapa en Vivo', path: '/monitor' },
  { icon: Truck, label: 'Centro de Despacho', path: '/dispatch' },
  { icon: Package, label: 'Paquetes', path: '/packages' },
  { icon: Users, label: 'Conductores', path: '/drivers' },
  { icon: PieChart, label: 'Reportes', path: '/analytics' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <>
      {/* Mobile Menu Trigger (<768px) */}
      {!mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú de navegación"
          className="md:hidden fixed bottom-4 left-4 z-40 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-200 hover:text-white shadow-lg"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside 
        className={clsx(
          mobileOpen ? "flex fixed inset-y-0 left-0 w-64 md:inset-auto" : "hidden md:flex",
          "h-screen bg-slate-950 border-r border-slate-800 flex-col transition-all duration-300 md:relative z-50",
          collapsed ? "md:w-20" : "md:w-64"
        )}
      >
        {/* Toggle Button */}
        <button 
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3 top-8 bg-blue-600 rounded-full p-1 text-white shadow-lg hover:bg-blue-500 transition-colors z-50"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-blue-900/50 shadow-lg">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <span className={clsx(
            "ml-3 font-bold text-lg tracking-tight text-white transition-opacity duration-300",
            collapsed ? "md:opacity-0 md:w-0 md:overflow-hidden" : "opacity-100"
          )}>
            Logi<span className="text-blue-500">Tech</span>
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú de navegación"
            className="md:hidden ml-auto min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 space-y-1 px-3 overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-sm font-medium",
                  isActive 
                    ? "bg-blue-600/10 text-blue-400 shadow-sm border border-blue-600/20" 
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                )
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span className={clsx(
                "whitespace-nowrap transition-all duration-300",
                collapsed ? "md:opacity-0 md:w-0 md:overflow-hidden" : "opacity-100"
              )}>
                {item.label}
              </span>
              {/* Tooltip for collapsed state */}
              {collapsed && (
                 <div className="hidden md:block absolute left-16 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap border border-slate-700">
                   {item.label}
                 </div>
              )}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="my-4 border-t border-slate-800 mx-2"></div>
           
           {/* System Links */}
           <div className="space-y-1">
               <div className={clsx("px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider", collapsed && "md:hidden")}>
                  Sistema
               </div>
              <NavLink
                to="/settings"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group text-sm font-medium",
                    isActive
                      ? "bg-blue-600/10 text-blue-400 shadow-sm border border-blue-600/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-900"
                  )
                }
              >
                  <Settings className="h-5 w-5 flex-shrink-0 group-hover:text-blue-400 transition-colors" />
                  <span className={clsx("font-medium text-sm", collapsed ? "md:hidden" : "block")}>Configuración</span>
              </NavLink>
           </div>

        </nav>

        {/* User Logic */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
              {user?.username.substring(0,2).toUpperCase()}
            </div>
            <div className={clsx("flex-1 overflow-hidden transition-all duration-300", collapsed ? "md:w-0 md:opacity-0" : "w-auto opacity-100")}>
              <p className="text-sm font-medium text-white truncate">{user?.username || 'Usuario'}</p>
              <p className="text-xs text-slate-400 truncate capitalize">{user?.role || 'Rol'}</p>
            </div>
            <button 
              onClick={logout}
              className={clsx("text-slate-400 hover:text-red-400 transition-colors", collapsed && "md:hidden")}
              title="Cerrar Sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
