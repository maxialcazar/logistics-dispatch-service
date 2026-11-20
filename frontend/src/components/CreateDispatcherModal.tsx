
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Lock, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateDispatcherModal({ isOpen, onClose }: Props) {
  const { token } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    setLoading(true);
    const toastId = toast.loading('Creando despachador...');

    try {
      await userService.createDispatcher(token, { username, password });
      toast.success('Despachador creado exitosamente', { id: toastId });
      onClose();
      setUsername('');
      setPassword('');
    } catch (err: unknown) {
      if (err instanceof Error) {
          toast.error(err.message, { id: toastId });
      } else {
          toast.error('Error al crear despachador', { id: toastId });
      }
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-dispatcher-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative flex w-full max-w-md max-h-[calc(100vh-2rem)] flex-col bg-slate-900 border border-slate-800/80 rounded-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="shrink-0 bg-slate-950/50 p-4 border-b border-slate-800/80 flex justify-between items-center">
          <h2
            id="create-dispatcher-modal-title"
            className="text-lg font-bold text-white flex items-center gap-2"
          >
            <UserPlus className="h-5 w-5 text-brand-400" />
            Nuevo Despachador
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Usuario</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none"
                placeholder="ej. despachador1"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none"
                placeholder="******"
              />
            </div>
          </div>

          <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg p-3">
              <p className="text-xs text-brand-300">
                  ⚠️ Esta cuenta tendrá permisos para gestionar despachos y conductores, pero no podrá crear más usuarios.
              </p>
          </div>

          <div className="pt-2 flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 rounded-lg shadow-lg shadow-brand-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Creando...' : 'Crear Cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
