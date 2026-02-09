import { useState, useEffect } from 'react';
import { Plus, Map, X, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { packageService } from '../services/packageService';

interface Zone {
  id: string;
  name: string;
}

export function ZonesPage() {
  const { token } = useAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    fetchZones();
  }, [token]);

  const fetchZones = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await packageService.getZones(token);
      setZones(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;

    setCreateLoading(true);
    setCreateError('');
    
    try {
      if (!token) throw new Error("No token");
      await packageService.createZone(token, newZoneName);
      setNewZoneName('');
      setShowModal(false);
      fetchZones(); // Refresh list
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
            <Map className="h-8 w-8 text-purple-500" />
            Gestión de Zonas
          </h1>
          <p className="text-slate-400 mt-1">Administra las áreas geográficas de operación.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg shadow-lg shadow-purple-900/30 transition-all"
        >
          <Plus className="h-5 w-5" />
          Nueva Zona
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando zonas...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">Error: {error}</div>
      ) : zones.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
           <Map className="h-12 w-12 mx-auto mb-3 opacity-20" />
           <p>No hay zonas configuradas.</p>
           <button onClick={() => setShowModal(true)} className="text-purple-400 hover:text-purple-300 mt-2 text-sm font-medium">Crear la primera zona</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-purple-500/50 transition-colors group">
              <div className="flex justify-between items-start">
                <div>
                   <h3 className="text-lg font-semibold text-white">{zone.name}</h3>
                   <p className="text-xs text-slate-500 mt-1 font-mono">{zone.id}</p>
                </div>
                {/* Actions could go here */}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Zone Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
             <button 
               onClick={() => setShowModal(false)}
               className="absolute top-4 right-4 text-slate-400 hover:text-white"
             >
               <X className="h-5 w-5" />
             </button>
             
             <h2 className="text-xl font-bold text-white mb-4">Crear Nueva Zona</h2>
             
             <form onSubmit={handleCreateZone} className="space-y-4">
               {createError && (
                 <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2">
                   <AlertCircle className="h-4 w-4" /> {createError}
                 </div>
               )}
               
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Nombre de la Zona</label>
                 <input 
                   type="text" 
                   value={newZoneName}
                   onChange={(e) => setNewZoneName(e.target.value)}
                   className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none placeholder:text-slate-600"
                   placeholder="ej. Zona Norte - San Isidro"
                   autoFocus
                   disabled={createLoading}
                 />
               </div>

               <div className="flex justify-end gap-3 pt-2">
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
                   disabled={createLoading || !newZoneName.trim()}
                   className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                 >
                   {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                   Crear Zona
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
