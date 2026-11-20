import { useState, useEffect, useId } from 'react';
import { Users, UserPlus, Loader2, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { driverService, type AppDriver } from '../services/driverService';
import { Modal } from '../components/Modal';

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

  const formId = useId();
  const nameId = useId();
  const usernameId = useId();
  const passwordId = useId();

  const handleCloseModal = () => {
    if (createLoading) return;
    setShowModal(false);
    setCreateError('');
  };

  useEffect(() => {
    fetchDrivers();
  }, [token]);

  const fetchDrivers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await driverService.getDrivers(token);
      setDrivers(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar conductores');
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
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear conductor');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="h-7 w-7 text-brand-400" />
            Gestión de Conductores
          </h1>
          <p className="text-slate-400 text-sm mt-1">Administra la flota de conductores y sus accesos.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-brand-950/30 transition-all"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Conductor
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando conductores...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-400">Error: {error}</div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900 rounded-xl border border-slate-800/80">
           <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
           <p>No hay conductores registrados.</p>
           <button onClick={() => setShowModal(true)} className="text-brand-400 hover:text-brand-300 mt-2 text-sm font-medium">Registrar el primer conductor</button>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-800/80 bg-slate-950/60 text-xs text-slate-400 uppercase tracking-wider">
                            <th className="px-6 py-3.5 font-semibold">Nombre</th>
                            <th className="px-6 py-3.5 font-semibold">Usuario de Sistema</th>
                            <th className="px-6 py-3.5 font-semibold">Zonas Asignadas</th>
                            <th className="px-6 py-3.5 font-semibold">Fecha Registro</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-sm">
                        {drivers.map((driver) => (
                            <tr key={driver.id} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-6 py-3.5 font-medium text-white">{driver.name}</td>
                                <td className="px-6 py-3.5 text-slate-300 font-mono text-xs flex items-center gap-2">
                                    <Shield className="h-3 w-3 text-slate-400" />
                                    {driver.user?.username || 'Sin Usuario'}
                                </td>
                                <td className="px-6 py-3.5 text-slate-400">
                                    {driver.zones && driver.zones.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {driver.zones.map(z => (
                                                <span key={z.id} className="px-2 py-0.5 bg-slate-950 rounded text-xs text-slate-200 border border-slate-800/80">
                                                    {z.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-slate-400 italic">Sin zonas</span>
                                    )}
                                </td>
                                <td className="px-6 py-3.5 text-slate-400 tabular-nums">
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
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        closeOnBackdropClick={!createLoading}
        closeOnEscape={!createLoading}
        title="Registrar Conductor"
        icon={<UserPlus className="h-4 w-4" />}
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={createLoading}
              className="px-4 py-2 min-h-[40px] text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={formId}
              disabled={createLoading || !formData.name || !formData.username || !formData.password}
              className="px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-lg shadow-brand-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
            >
              {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear Conductor
            </button>
          </>
        }
      >
        <form id={formId} onSubmit={handleCreateDriver} className="space-y-4">
          {createError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor={nameId} className="block text-xs font-medium text-slate-300">
              Nombre Completo
            </label>
            <input
              id={nameId}
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="ej. Juan Perez"
              autoFocus
              disabled={createLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={usernameId} className="block text-xs font-medium text-slate-300">
              Usuario de Acceso
            </label>
            <input
              id={usernameId}
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="ej. jperez"
              disabled={createLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={passwordId} className="block text-xs font-medium text-slate-300">
              Contraseña Inicial
            </label>
            <input
              id={passwordId}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="Mínimo 6 caracteres"
              disabled={createLoading}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
