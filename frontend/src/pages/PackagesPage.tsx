import { useState, useEffect } from 'react';
import { Plus, Package, MapPin, Phone, Calendar, Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { packageService, type Package as IPackage } from '../services/packageService';
import clsx from 'clsx';

export function PackagesPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [packages, setPackages] = useState<IPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>(''); // '' = all
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPackages();
  }, [token, activeFilter]);

  const fetchPackages = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // We are fetching only page 1 for now. Pagination can be added later as requested.
      const res = await packageService.getPackages(token, activeFilter || undefined, 1);
      setPackages(res.items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">Pendiente</span>;
      case 'assigned': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">Asignado</span>;
      case 'in_transit': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20">En Camino</span>;
      case 'delivered': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">Entregado</span>;
      case 'cancelled': return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">Cancelado</span>;
      default: return <span className="text-slate-400">{status}</span>;
    }
  };

  const filteredPackages = packages.filter(p => 
    p.trackingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.recipientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="h-8 w-8 text-blue-500" />
            Gestión de Paquetes
          </h1>
          <p className="text-slate-400 mt-1">Administra todos los envíos y su estado actual.</p>
        </div>
        <button
          onClick={() => navigate('/packages/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-lg shadow-blue-900/30 transition-all"
        >
          <Plus className="h-5 w-5" />
          Nuevo Paquete
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
         <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input 
              type="text"
              placeholder="Buscar por tracking o nombre..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
         </div>
         <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
             {['', 'pending', 'assigned', 'in_transit', 'delivered'].map((status) => (
               <button
                 key={status}
                 onClick={() => setActiveFilter(status)}
                 className={clsx(
                   "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
                   activeFilter === status 
                     ? "bg-blue-600/10 border-blue-600/30 text-blue-400" 
                     : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                 )}
               >
                 {status === '' ? 'Todos' : status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
               </button>
             ))}
         </div>
      </div>

      {/* Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
             <div className="p-12 text-center text-slate-500">Cargando paquetes...</div>
        ) : error ? (
             <div className="p-12 text-center text-red-400">Error: {error}</div>
        ) : filteredPackages.length === 0 ? (
             <div className="p-12 text-center text-slate-500">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No se encontraron paquetes.</p>
             </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold">Tracking</th>
                  <th className="px-6 py-4 font-semibold">Destinatario</th>
                  <th className="px-6 py-4 font-semibold">Ubicación</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                {filteredPackages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-mono text-white font-medium">{pkg.trackingCode}</div>
                      <div className="text-xs text-slate-500">ID: {pkg.id.substring(0,8)}...</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-200 font-medium">{pkg.recipientName}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                         <Phone className="h-3 w-3" /> {pkg.recipientPhone}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-300 max-w-xs truncate" title={pkg.recipientAddress}>
                          {pkg.recipientAddress}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Zona: {pkg.zone?.name || 'Sin Asignar'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(pkg.status)}
                    </td>
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                       <div className="flex items-center gap-2">
                           <Calendar className="h-3 w-3" />
                           {new Date(pkg.createdAt).toLocaleDateString()}
                       </div>
                       <div className="text-xs text-slate-600 mt-0.5">
                           {new Date(pkg.createdAt).toLocaleTimeString()}
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

       {/* Pagination (Visual placeholder) */}
       <div className="flex items-center justify-between text-sm text-slate-400 px-2">
           <div>Mostrando {filteredPackages.length} resultados</div>
           <div className="flex gap-2">
               <button className="px-3 py-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-50" disabled>Anterior</button>
               <button className="px-3 py-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-50" disabled>Siguiente</button>
           </div>
       </div>
    </div>
  );
}
