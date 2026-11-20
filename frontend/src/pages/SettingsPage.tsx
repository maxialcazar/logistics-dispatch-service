
import { Save, Shield, Bell, User, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { userService } from '../services/userService';

// Key for LocalStorage
const NOTIFS_KEY = 'user_notification_prefs';

export function SettingsPage() {
  const { user, token } = useAuth();
  const [passwordMode, setPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Notification States
  const [notifs, setNotifs] = useState({
      driverAlerts: true,
      newPackages: true,
      dailyReports: false,
      systemErrors: true
  });

  // Load from LocalStorage on mount
  useEffect(() => {
      const saved = localStorage.getItem(NOTIFS_KEY);
      if (saved) {
          try { setNotifs(JSON.parse(saved)); } catch { /* ignore */ }
      }
  }, []);

  const handleNotifToggle = (key: keyof typeof notifs) => {
      setNotifs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
      if (!token) return;
      setSaving(true);
      const toastId = toast.loading('Guardando configuración...');

      try {
          // 1. Save Notifications (Local)
          localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifs));

          // 2. Change Password (Backend)
          if (passwordMode) {
              if (newPassword.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
              if (newPassword !== confirmPassword) throw new Error("Las contraseñas no coinciden");
              
              await userService.changePassword(token, newPassword);
              setPasswordMode(false);
              setNewPassword('');
              setConfirmPassword('');
          }

          toast.success('Configuración actualizada correctamente', { id: toastId });
      } catch (err: unknown) {
          if (err instanceof Error) {
              toast.error(err.message, { id: toastId });
          } else {
              toast.error('Error al guardar cambios', { id: toastId });
          }
      } finally {
          setSaving(false);
      }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <h1 className="text-2xl font-bold tracking-tight text-white">Configuración del Sistema</h1>

      {/* Account Settings */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex items-center gap-3">
          <User className="text-brand-400" />
          <h2 className="font-semibold text-white">Perfil de Usuario</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nombre de Usuario</label>
              <input 
                type="text" 
                value={user?.username || ''}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-slate-300 focus:outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Rol</label>
              <input 
                type="text" 
                value={user?.role?.toUpperCase() || ''}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-slate-300 focus:outline-none cursor-not-allowed"
              />
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2 mt-2">
              <AlertTriangle size={12} className="text-amber-400" />
              <span>Para cambiar estos datos, contacte al administrador del sistema.</span>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex items-center gap-3">
          <Bell className="text-amber-400" />
          <h2 className="font-semibold text-white">Notificaciones</h2>
        </div>
        <div className="p-6 space-y-4">
          {[
              { key: 'driverAlerts', label: 'Alertas de Conductores' },
              { key: 'newPackages', label: 'Nuevos Paquetes' }, 
              { key: 'dailyReports', label: 'Reportes Diarios' },
              { key: 'systemErrors', label: 'Errores del Sistema' }
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2 border-b border-slate-800/80 last:border-0">
              <span className="text-slate-200 text-sm">{item.label}</span>
              <button 
                  onClick={() => handleNotifToggle(item.key as keyof typeof notifs)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${notifs[item.key as keyof typeof notifs] ? 'bg-emerald-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notifs[item.key as keyof typeof notifs] ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden" id="security">
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex items-center gap-3">
          <Shield className="text-red-400" />
          <h2 className="font-semibold text-white">Seguridad</h2>
        </div>
        <div className="p-6">
            {!passwordMode ? (
                <button 
                    onClick={() => setPasswordMode(true)}
                    className="text-brand-300 hover:text-brand-200 text-sm font-medium transition-colors border border-brand-500/30 bg-brand-500/10 px-4 py-2 rounded-lg"
                >
                    Cambiar Contraseña
                </button>
            ) : (
                <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Nueva Contraseña</label>
                        <input 
                            type="password" 
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Confirmar Contraseña</label>
                        <input 
                            type="password" 
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                            placeholder="Repite la contraseña"
                        />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setPasswordMode(false)} className="text-xs text-slate-400 hover:text-white px-3 py-1">Cancelar</button>
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 sticky bottom-4">
          <button 
            onClick={() => window.history.back()}
            className="px-6 py-2 rounded-lg bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
          >
              Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-lg shadow-brand-950/30 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
              <Save size={16} /> 
              {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
      </div>
    </div>
  );
}
