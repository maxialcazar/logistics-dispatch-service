import {
  AlertTriangle,
  Bell,
  Building2,
  Loader2,
  PlusCircle,
  Save,
  Shield,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateDispatcherModal } from '../components/CreateDispatcherModal';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import {
  useNotifications,
  type NotificationPreferences,
} from '../context/NotificationContext';
import { userService, type TeamUser } from '../services/userService';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const NOTIFICATION_OPTIONS: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: 'packageUpdates',
    label: 'Actualizaciones de paquetes',
    description: 'Alertas cuando un envío pasa a ruta o se completa la entrega.',
  },
  {
    key: 'incidentAlerts',
    label: 'Incidencias y cancelaciones',
    description: 'Avisos prioritarios por envíos cancelados o incidencias operativas.',
  },
  {
    key: 'driverAlerts',
    label: 'Estado de conductores',
    description: 'Notificar cuando un repartidor se conecta o desconecta en vivo.',
  },
  {
    key: 'showToasts',
    label: 'Notificaciones emergentes (Toasts)',
    description: 'Mostrar tarjetas flotantes en pantalla al recibir nuevos eventos.',
  },
  {
    key: 'soundEnabled',
    label: 'Alerta sonora',
    description: 'Reproducir un aviso acústico sutil cuando ingresa una alerta.',
  },
];

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function SettingsPage() {
  const { user, token, updateCompany } = useAuth();
  const { preferences, updatePreferences } = useNotifications();
  const isAdmin = user?.role === 'admin';

  // IDs for accessible labels
  const usernameInputId = useId();
  const roleInputId = useId();
  const companyNameId = useId();
  const companySlugId = useId();
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  // Company state (admin only)
  const [companyName, setCompanyName] = useState(user?.company?.name ?? '');
  const [companySlug, setCompanySlug] = useState(user?.company?.slug ?? '');
  const [initialCompany, setInitialCompany] = useState({
    name: user?.company?.name ?? '',
    slug: user?.company?.slug ?? '',
  });
  const [companyLoading, setCompanyLoading] = useState(isAdmin);
  const [companyError, setCompanyError] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  // Password state
  const [passwordMode, setPasswordMode] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Dispatchers team state (admin only)
  const [dispatchers, setDispatchers] = useState<TeamUser[]>([]);
  const [dispatchersLoading, setDispatchersLoading] = useState(isAdmin);
  const [dispatchersError, setDispatchersError] = useState('');
  const [showCreateDispatcher, setShowCreateDispatcher] = useState(false);
  const [userToDelete, setUserToDelete] = useState<TeamUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const loadCompany = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || !isAdmin) return;
      setCompanyLoading(true);
      setCompanyError('');
      try {
        const data = await userService.getCompany(token, signal);
        if (signal?.aborted) return;
        setCompanyName(data.name);
        setCompanySlug(data.slug);
        setInitialCompany({ name: data.name, slug: data.slug });
        updateCompany({ id: data.id, name: data.name, slug: data.slug });
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) return;
        setCompanyError(
          err instanceof Error ? err.message : 'No se pudieron cargar los datos de la empresa'
        );
      } finally {
        if (!signal?.aborted) {
          setCompanyLoading(false);
        }
      }
    },
    [token, isAdmin, updateCompany]
  );

  const loadDispatchers = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || !isAdmin) return;
      setDispatchersLoading(true);
      setDispatchersError('');
      try {
        const res = await userService.getUsers(token, {
          role: 'dispatcher',
          limit: 50,
          signal,
        });
        if (signal?.aborted) return;
        setDispatchers(res.items);
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) return;
        setDispatchersError(
          err instanceof Error ? err.message : 'No se pudo cargar el equipo de despachadores'
        );
      } finally {
        if (!signal?.aborted) {
          setDispatchersLoading(false);
        }
      }
    },
    [token, isAdmin]
  );

  useEffect(() => {
    if (!token || !isAdmin) {
      setCompanyLoading(false);
      setDispatchersLoading(false);
      return;
    }

    const controller = new AbortController();
    void loadCompany(controller.signal);
    void loadDispatchers(controller.signal);

    return () => {
      controller.abort();
    };
  }, [token, isAdmin, loadCompany, loadDispatchers]);

  const trimmedCompanyName = companyName.trim();
  const trimmedCompanySlug = companySlug.trim();
  const hasCompanyChanges =
    trimmedCompanyName !== initialCompany.name.trim() ||
    trimmedCompanySlug !== initialCompany.slug.trim();

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !isAdmin || !hasCompanyChanges) return;

    if (trimmedCompanyName.length < 2 || trimmedCompanyName.length > 100) {
      toast.error('El nombre de la empresa debe tener entre 2 y 100 caracteres');
      return;
    }
    if (
      trimmedCompanySlug.length < 2 ||
      trimmedCompanySlug.length > 60 ||
      !SLUG_REGEX.test(trimmedCompanySlug)
    ) {
      toast.error('El slug debe tener entre 2 y 60 caracteres en minúsculas, números y guiones');
      return;
    }

    const payload: { name?: string; slug?: string } = {};
    if (trimmedCompanyName !== initialCompany.name.trim()) {
      payload.name = trimmedCompanyName;
    }
    if (trimmedCompanySlug !== initialCompany.slug.trim()) {
      payload.slug = trimmedCompanySlug;
    }

    setSavingCompany(true);
    const toastId = toast.loading('Actualizando organización...');
    try {
      const updated = await userService.updateCompany(token, payload);
      setCompanyName(updated.name);
      setCompanySlug(updated.slug);
      setInitialCompany({ name: updated.name, slug: updated.slug });
      updateCompany({ id: updated.id, name: updated.name, slug: updated.slug });
      toast.success('Organización actualizada en vivo', { id: toastId });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar la empresa', {
        id: toastId,
      });
    } finally {
      setSavingCompany(false);
    }
  };

  const resetPasswordForm = () => {
    setPasswordMode(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!currentPassword) {
      toast.error('Ingresa tu contraseña actual');
      return;
    }
    if (newPassword.length < 8 || !PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
      toast.error(
        'La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas nuevas no coinciden');
      return;
    }

    setSavingPassword(true);
    const toastId = toast.loading('Actualizando contraseña...');
    try {
      await userService.changePassword(token, {
        currentPassword,
        newPassword,
      });
      toast.success('Contraseña actualizada correctamente', { id: toastId });
      resetPasswordForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña', {
        id: toastId,
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleConfirmDeleteDispatcher = async () => {
    if (!token || !userToDelete) return;
    setDeletingUser(true);
    const target = userToDelete;
    const toastId = toast.loading(`Eliminando a ${target.username}...`);
    try {
      await userService.deleteUser(token, target.id);
      setDispatchers((prev) => prev.filter((item) => item.id !== target.id));
      toast.success(`Despachador ${target.username} eliminado`, { id: toastId });
      setUserToDelete(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar despachador', {
        id: toastId,
      });
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Configuración del Sistema</h1>
        <p className="text-sm text-slate-400 mt-1">
          Perfil de cuenta, preferencias de alertas en tiempo real y administración del tenant.
        </p>
      </div>

      {/* Perfil de Usuario */}
      <section className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-brand-400" aria-hidden="true" />
            <h2 className="font-semibold text-white">Perfil de Usuario</h2>
          </div>
          {user?.company?.slug && (
            <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-brand-500/10 border border-brand-500/25 text-brand-300">
              {user.company.slug}
            </span>
          )}
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor={usernameInputId} className="block text-xs font-medium text-slate-400 mb-1.5">
                Nombre de Usuario
              </label>
              <input
                id={usernameInputId}
                type="text"
                value={user?.username || ''}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label htmlFor={roleInputId} className="block text-xs font-medium text-slate-400 mb-1.5">
                Rol de Acceso
              </label>
              <input
                id={roleInputId}
                type="text"
                value={user?.role?.toUpperCase() || ''}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none cursor-not-allowed"
              />
            </div>
          </div>

          {!isAdmin && (
            <div className="text-xs text-slate-400 flex items-center gap-2 pt-1">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" aria-hidden="true" />
              <span>
                Organización activa:{' '}
                <strong className="text-slate-200">{user?.company?.name || 'Organización'}</strong>.
                Solo los administradores pueden editar la organización o gestionar despachadores.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Organización / Empresa (solo Admin) */}
      {isAdmin && (
        <section className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-brand-400" aria-hidden="true" />
              <h2 className="font-semibold text-white">Organización y Tenant</h2>
            </div>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/80">
              Solo Admin
            </span>
          </div>

          <div className="p-4 sm:p-6">
            {companyLoading ? (
              <div className="space-y-4" aria-label="Cargando datos de organización">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                </div>
                <Skeleton className="h-9 w-40 rounded-lg ml-auto" />
              </div>
            ) : companyError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300"
              >
                <span>{companyError}</span>
                <button
                  type="button"
                  onClick={() => void loadCompany()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-red-500/30 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveCompany} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor={companyNameId}
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Nombre de la Empresa
                    </label>
                    <input
                      id={companyNameId}
                      type="text"
                      required
                      minLength={2}
                      maxLength={100}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={savingCompany}
                      placeholder="Ej. Logistics Express S.A."
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={companySlugId}
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Slug del Tenant
                    </label>
                    <input
                      id={companySlugId}
                      type="text"
                      required
                      minLength={2}
                      maxLength={60}
                      value={companySlug}
                      onChange={(e) => setCompanySlug(e.target.value)}
                      disabled={savingCompany}
                      placeholder="ej. logistics-express"
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none disabled:opacity-60"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Solo minúsculas, números y guiones (ej. mi-flota-norte).
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={savingCompany || !hasCompanyChanges}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-lg shadow-brand-950/30 inline-flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingCompany ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{savingCompany ? 'Guardando...' : 'Guardar Organización'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      {/* Notificaciones en Tiempo Real */}
      <section className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-amber-400" aria-hidden="true" />
            <h2 className="font-semibold text-white">Preferencias de Notificaciones</h2>
          </div>
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
            Sincronización inmediata
          </span>
        </div>

        <div className="p-4 sm:p-6 divide-y divide-slate-800/80">
          {NOTIFICATION_OPTIONS.map((item) => {
            const enabled = preferences[item.key];
            const labelId = `notif-label-${item.key}`;
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p id={labelId} className="text-sm font-medium text-slate-200">
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-labelledby={labelId}
                  onClick={() => updatePreferences({ [item.key]: !enabled })}
                  className={clsx(
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    enabled ? 'bg-emerald-600' : 'bg-slate-700'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Seguridad y Cambio de Contraseña */}
      <section className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden" id="security">
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex items-center gap-3">
          <Shield className="h-5 w-5 text-red-400" aria-hidden="true" />
          <h2 className="font-semibold text-white">Seguridad</h2>
        </div>

        <div className="p-4 sm:p-6">
          {!passwordMode ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                Actualiza tu contraseña periódicamente para mantener segura tu sesión.
              </p>
              <button
                type="button"
                onClick={() => setPasswordMode(true)}
                className="min-h-[40px] text-brand-300 hover:text-brand-200 text-sm font-medium transition-colors border border-brand-500/30 bg-brand-500/10 px-4 py-2 rounded-lg"
              >
                Cambiar Contraseña
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleChangePassword}
              className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 space-y-4"
            >
              <div>
                <label
                  htmlFor={currentPasswordId}
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Contraseña Actual
                </label>
                <input
                  id={currentPasswordId}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={savingPassword}
                  placeholder="Ingresa tu contraseña actual"
                  className="w-full bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={newPasswordId}
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    Nueva Contraseña
                  </label>
                  <input
                    id={newPasswordId}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={savingPassword}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label
                    htmlFor={confirmPasswordId}
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    Confirmar Nueva Contraseña
                  </label>
                  <input
                    id={confirmPasswordId}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={savingPassword}
                    placeholder="Repite la nueva contraseña"
                    className="w-full bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Debe incluir al menos 8 caracteres, una letra mayúscula, una minúscula y un número.
              </p>

              <div className="flex flex-wrap gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={resetPasswordForm}
                  disabled={savingPassword}
                  className="min-h-[40px] px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800/80 hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-lg shadow-brand-950/30 inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {savingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{savingPassword ? 'Actualizando...' : 'Actualizar Contraseña'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Equipo de Despachadores (solo Admin) */}
      {isAdmin && (
        <section className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-brand-400" aria-hidden="true" />
              <h2 className="font-semibold text-white">Equipo de Despachadores</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/80 tabular-nums">
                {dispatchers.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateDispatcher(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Nuevo Despachador</span>
            </button>
          </div>

          <div className="p-4 sm:p-6">
            {dispatchersLoading ? (
              <div className="space-y-3" aria-label="Cargando despachadores">
                {[0, 1, 2].map((idx) => (
                  <Skeleton key={idx} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : dispatchersError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300"
              >
                <span>{dispatchersError}</span>
                <button
                  type="button"
                  onClick={() => void loadDispatchers()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-red-500/30 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            ) : dispatchers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800/80 bg-slate-950/40 p-6 text-center">
                <Users className="h-7 w-7 text-slate-600 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-300">
                  No hay despachadores registrados
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Crea cuentas de despachador para delegar el monitoreo y asignación de envíos.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/80">
                {dispatchers.map((member) => {
                  const initials = member.username.slice(0, 2).toUpperCase();
                  const isSelf = member.id === user?.id;
                  return (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {member.username}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="uppercase tracking-wider text-[10px] font-semibold text-brand-300">
                              {member.role}
                            </span>
                            {member.createdAt && (
                              <span className="tabular-nums">
                                · Alta {new Date(member.createdAt).toLocaleDateString('es-ES')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => setUserToDelete(member)}
                          aria-label={`Eliminar despachador ${member.username}`}
                          className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {isAdmin && (
        <>
          <CreateDispatcherModal
            isOpen={showCreateDispatcher}
            onClose={() => setShowCreateDispatcher(false)}
            onCreated={() => void loadDispatchers()}
          />
          <ConfirmDialog
            isOpen={Boolean(userToDelete)}
            onClose={() => {
              if (!deletingUser) setUserToDelete(null);
            }}
            onConfirm={() => void handleConfirmDeleteDispatcher()}
            title="Eliminar Despachador"
            message={`¿Estás seguro de que deseas eliminar la cuenta de despachador "${userToDelete?.username ?? ''}"? Esta acción revocará su acceso inmediatamente.`}
            confirmText="Eliminar cuenta"
            variant="danger"
            isLoading={deletingUser}
          />
        </>
      )}
    </div>
  );
}
