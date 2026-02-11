import { useState, useEffect } from 'react';
import { Users, UserPlus, X, Loader2, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { driverService, type AppDriver } from '../services/driverService';

export function DriversPage() {
  const { token } = useAuth();
  const [drivers, setDrivers] = useState<AppDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: ''
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    fetchDrivers();
  }, [token]);

  const fetchDrivers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await driverService.getDrivers(token);
      setDrivers(data.items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username || !formData.password) return;

    setCreateLoading(true);
    setCreateError('');
    
    try {
      if (!token) throw new Error("No token");
      await driverService.createDriver(token, formData);
      setFormData({ name: '', username: '', password: '' });
      setShowModal(false);
      fetchDrivers(); // Refresh list
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="h-8 w-8 text-emerald-500" />
            Gestión de Conductores
          </h1>
          <p className="text-slate-400 mt-1">Administra la flota de conductores y sus accesos.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg shadow-lg shadow-emerald-900/30 transition-all"
        >
          <UserPlus className="h-5 w-5" />
          Nuevo Conductor
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando conductores...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">Error: {error}</div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
           <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
           <p>No hay conductores registrados.</p>
           <button onClick={() => setShowModal(true)} className="text-emerald-400 hover:text-emerald-300 mt-2 text-sm font-medium">Registrar el primer conductor</button>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/50 text-xs text-slate-400 uppercase tracking-wider">
                            <th className="px-6 py-4 font-semibold">Nombre</th>
                            <th className="px-6 py-4 font-semibold">Usuario de Sistema</th>
                            <th className="px-6 py-4 font-semibold">Zonas Asignadas</th>
                            <th className="px-6 py-4 font-semibold">Fecha Registro</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                        {drivers.map((driver) => (
                            <tr key={driver.id} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-6 py-4 font-medium text-white">{driver.name}</td>
                                <td className="px-6 py-4 text-slate-300 font-mono text-xs flex items-center gap-2">
                                    <Shield className="h-3 w-3 text-slate-500" />
                                    {driver.user?.username || 'Sin Usuario'}
                                </td>
                                <td className="px-6 py-4 text-slate-400">
                                    {driver.zones && driver.zones.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {driver.zones.map(z => (
                                                <span key={z.id} className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-300 border border-slate-700">
                                                    {z.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-slate-600 italic">Sin zonas</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                    {new Date(driver.createdAt).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Create Driver Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
             <button 
               onClick={() => setShowModal(false)}
               className="absolute top-4 right-4 text-slate-400 hover:text-white"
             >
               <X className="h-5 w-5" />
             </button>
             
             <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                 <UserPlus className="h-5 w-5 text-emerald-500" />
                 Registrar Conductor
             </h2>
             
             <form onSubmit={handleCreateDriver} className="space-y-4">
               {createError && (
                 <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2">
                   <AlertCircle className="h-4 w-4" /> {createError}
                 </div>
               )}
               
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Nombre Completo</label>
                 <input 
                   type="text" 
                   value={formData.name}
                   onChange={(e) => setFormData({...formData, name: e.target.value})}
                   className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none placeholder:text-slate-600"
                   placeholder="ej. Juan Perez"
                   autoFocus
                   disabled={createLoading}
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Usuario de Acceso</label>
                 <input 
                   type="text" 
                   value={formData.username}
                   onChange={(e) => setFormData({...formData, username: e.target.value})}
                   className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none placeholder:text-slate-600"
                   placeholder="ej. jperez"
                   disabled={createLoading}
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Contraseña Inicial</label>
                 <input 
                   type="password" 
                   value={formData.password}
                   onChange={(e) => setFormData({...formData, password: e.target.value})}
                   className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none placeholder:text-slate-600"
                   placeholder="Mínimo 6 caracteres"
                   disabled={createLoading}
                 />
               </div>

               <div className="flex justify-end gap-3 pt-4">
                 <button
                   type="button"
                   onClick={() => setShowModal(false)}
                   className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                   disabled={createLoading}
                 >
                   Cancelar
                 </button>
                 <button
                   type="submit"
                   disabled={createLoading || !formData.name || !formData.username || !formData.password}
                   className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                 >
                   {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                   Crear Conductor
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
