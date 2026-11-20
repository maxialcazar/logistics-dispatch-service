export type PackageStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export interface PackageStatusToken {
  status: string;
  label: string;
  badgeClass: string;
  dotClass: string;
  barClass: string;
  hexColor: string;
  pulse?: boolean;
  trackingDescription: string;
}

export const PACKAGE_STATUS_ORDER: readonly PackageStatus[] = [
  'pending',
  'assigned',
  'in_transit',
  'delivered',
  'cancelled',
] as const;

export const PACKAGE_STATUS_TOKENS: Record<PackageStatus, PackageStatusToken> = {
  pending: {
    status: 'pending',
    label: 'Pendiente',
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    dotClass: 'bg-amber-400',
    barClass: 'bg-amber-500',
    hexColor: '#f59e0b',
    trackingDescription: 'Tu envío fue registrado y espera asignación de unidad.',
  },
  assigned: {
    status: 'assigned',
    label: 'Asignado',
    badgeClass: 'bg-brand-500/10 text-brand-300 border-brand-500/25',
    dotClass: 'bg-brand-400',
    barClass: 'bg-brand-500',
    hexColor: '#0ea5e9',
    trackingDescription: 'Un conductor fue asignado y preparará la salida.',
  },
  in_transit: {
    status: 'in_transit',
    label: 'En Camino',
    badgeClass: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
    dotClass: 'bg-violet-400',
    barClass: 'bg-violet-500',
    hexColor: '#8b5cf6',
    pulse: true,
    trackingDescription: 'El paquete se encuentra en ruta hacia el destino.',
  },
  delivered: {
    status: 'delivered',
    label: 'Entregado',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    dotClass: 'bg-emerald-400',
    barClass: 'bg-emerald-500',
    hexColor: '#10b981',
    trackingDescription: 'El paquete fue entregado en la dirección indicada.',
  },
  cancelled: {
    status: 'cancelled',
    label: 'Cancelado',
    badgeClass: 'bg-red-500/10 text-red-300 border-red-500/25',
    dotClass: 'bg-red-400',
    barClass: 'bg-red-500',
    hexColor: '#ef4444',
    trackingDescription: 'Este envío fue cancelado. Contacta al remitente para más detalles.',
  },
};

export function getPackageStatusToken(status: string): PackageStatusToken {
  if (Object.prototype.hasOwnProperty.call(PACKAGE_STATUS_TOKENS, status)) {
    return PACKAGE_STATUS_TOKENS[status as PackageStatus];
  }

  return {
    status,
    label: status || 'Desconocido',
    badgeClass: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
    dotClass: 'bg-slate-400',
    barClass: 'bg-slate-700',
    hexColor: '#64748b',
    trackingDescription: 'Estado del envío en actualización.',
  };
}
