import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { ApiError, apiClient } from '../services/apiClient';

interface LoginResponse {
  token?: string;
  user?: {
    id?: string | number;
    username?: string;
    role?: string;
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
      const user = data?.user;
      const hasValidUserId =
        (typeof user?.id === 'string' && user.id.trim().length > 0) ||
        (typeof user?.id === 'number' && Number.isFinite(user.id));

      if (
        typeof data?.token !== 'string' ||
        !data.token.trim() ||
        !user ||
        !hasValidUserId ||
        typeof user.username !== 'string' ||
        !user.username.trim() ||
        typeof user.role !== 'string' ||
        !user.role.trim()
      ) {
        setError('Respuesta inválida del servidor al iniciar sesión');
        return;
      }

      login(data.token, {
        id: String(user.id),
        username: user.username,
        role: user.role,
      });
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
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-slate-900 p-8 shadow-2xl border border-slate-800">
        <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
               <Lock className="h-6 w-6 text-blue-500" />
            </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Logistics OS</h2>
          <p className="mt-2 text-sm text-slate-400">Inicia sesión para acceder al sistema</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Usuario</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full min-h-[48px] rounded-lg border border-slate-700 bg-slate-950 pl-10 p-2.5 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400">Contraseña</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-500" />
                </div>
                 <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full min-h-[48px] rounded-lg border border-slate-700 bg-slate-950 pl-10 p-2.5 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Autenticando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
