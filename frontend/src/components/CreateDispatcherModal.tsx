import { useId, useState } from 'react';
import { UserPlus, Lock, User, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import { Modal } from './Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateDispatcherModal({ isOpen, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const formId = useId();
  const usernameId = useId();
  const passwordId = useId();

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    const toastId = toast.loading('Creando despachador...');

    try {
      await userService.createDispatcher(token, { username, password });
      toast.success('Despachador creado exitosamente', { id: toastId });
      onCreated?.();
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnBackdropClick={!loading}
      closeOnEscape={!loading}
      title="Nuevo Despachador"
      icon={<UserPlus className="h-4 w-4" />}
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 min-h-[40px] text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={loading}
            className="px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-lg shadow-brand-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={usernameId} className="block text-xs font-medium text-slate-300">
            Usuario
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              id={usernameId}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="ej. despachador1"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={passwordId} className="block text-xs font-medium text-slate-300">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
        </div>

        <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg p-3 flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
          <p className="text-xs text-brand-200 leading-relaxed">
            Esta cuenta tendrá permisos para gestionar despachos y conductores, pero no podrá crear más usuarios.
          </p>
        </div>
      </form>
    </Modal>
  );
}
