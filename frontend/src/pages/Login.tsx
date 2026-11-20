import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { normalizeUserRecord } from '../utils/authSession';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, MapPin, Truck, User } from 'lucide-react';
import { ApiError, apiClient } from '../services/apiClient';

interface RawCompanyResponse {
  id?: string | number;
  name?: string;
  slug?: string;
}

interface LoginResponse {
  token?: string;
  company?: RawCompanyResponse;
  user?: {
    id?: string | number;
    username?: string;
    role?: string;
    companyId?: string | number;
    companyName?: string;
    companySlug?: string;
    company?: RawCompanyResponse;
  };
}

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await apiClient.post<LoginResponse>(
        '/api/auth/login',
        { username, password },
        { skipAuthHandler: true, token: null }
      );
      const normalizedUser = normalizeUserRecord(data?.user, data?.company);

      if (
        typeof data?.token !== 'string' ||
        !data.token.trim() ||
        !normalizedUser
      ) {
        setError('Respuesta inválida del servidor al iniciar sesión');
        return;
      }

      login(data.token, normalizedUser);
      navigate('/');
      
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Credenciales inválidas');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Credenciales inválidas');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-slate-900 p-8 shadow-2xl border border-slate-800/80">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-brand-600 flex items-center justify-center mb-4 shadow-lg shadow-brand-950/40">
            <Truck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Logistics <span className="text-brand-400">OS</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Inicia sesión para acceder al sistema</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Usuario</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full min-h-[48px] rounded-lg border border-slate-800/80 bg-slate-950 pl-10 p-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:ring-brand-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">Contraseña</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                </div>
                 <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full min-h-[48px] rounded-lg border border-slate-800/80 bg-slate-950 pl-10 p-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:ring-brand-500 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-950/30 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Autenticando...' : 'Ingresar'}
          </button>
        </form>

        <div className="border-t border-slate-800/80 pt-6 space-y-3">
          <p className="text-xs text-slate-400 text-center">
            ¿Esperas un paquete? Consulta tu entrega sin iniciar sesión
          </p>
          <Link
            to="/tracking"
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/80 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white hover:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors"
          >
            <MapPin className="h-4 w-4 text-brand-400 shrink-0" />
            <span>Rastrear envío</span>
            <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  );
}
