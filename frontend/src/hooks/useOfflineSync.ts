/**
 * useOfflineSync.ts
 *
 * Monitors connectivity and automatically drains the offline IndexedDB
 * queue when the device comes back online. Uses a module-level singleton
 * sync coordinator so route transitions or multiple hook mounts never
 * trigger duplicate parallel drains. Exposes `isOnline`, `pendingCount`,
 * `isSyncing`, `syncNow`, and `refreshPendingCount`.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../services/apiClient';
import {
  getQueuedUpdates,
  clearQueuedUpdate,
  incrementRetry,
  getPendingCount,
  subscribeQueueChanges,
  getEnqueueVersion,
  type QueuedStatusUpdate,
} from '../services/offlineQueue';
import { packageService } from '../services/packageService';
import { getPackageStatusToken } from '../utils/packageStatus';

const MAX_RETRIES = 3;

type SyncTriggerSource = 'mount' | 'online' | 'manual';

interface DiscardedUpdate {
  item: QueuedStatusUpdate;
  reason: string;
}

function notifyDiscardedUpdates(discardedItems: DiscardedUpdate[]): void {
  for (const { item, reason } of discardedItems) {
    const pkgLabel = item.trackingCode ? `#${item.trackingCode}` : item.packageId;
    const statusLabel = getPackageStatusToken(item.status).label;
    const attempts = (typeof item.retries === 'number' ? item.retries : 0) + 1;
    toast.error(`Actualización descartada (${pkgLabel})`, {
      description: `Se eliminó "${statusLabel}" de la cola tras ${attempts} intentos fallidos (${reason}). Reinténtalo manualmente.`,
      duration: 10000,
    });
  }
}

// ── Module-level singleton sync coordinator ──────────────────────────────────

let activeSyncPromise: Promise<void> | null = null;
let globalIsSyncing = false;
let latestToken: string | null = null;
let pendingTokenChange = false;
let pendingOnlineTrigger = false;

const syncingStateListeners = new Set<(syncing: boolean) => void>();
const syncCompletedListeners = new Set<(syncedToken: string) => void>();

function setGlobalSyncing(syncing: boolean): void {
  globalIsSyncing = syncing;
  for (const listener of Array.from(syncingStateListeners)) {
    try {
      listener(syncing);
    } catch (err) {
      console.error('Error notifying syncing state listener:', err);
    }
  }
}

function emitSyncCompleted(syncedToken: string): void {
  for (const listener of Array.from(syncCompletedListeners)) {
    try {
      listener(syncedToken);
    } catch (err) {
      console.error('Error notifying sync completion listener:', err);
    }
  }
}

async function runSyncCoordinator(
  triggerToken: string | null,
  source: SyncTriggerSource
): Promise<void> {
  if (!triggerToken) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  if (activeSyncPromise) {
    if (source === 'online') {
      pendingOnlineTrigger = true;
    }
    if (latestToken !== triggerToken) {
      latestToken = triggerToken;
      pendingTokenChange = true;
    }
    return activeSyncPromise;
  }

  latestToken = triggerToken;
  pendingTokenChange = false;
  pendingOnlineTrigger = false;

  const syncTask = (async () => {
    let currentPassToken: string | null = latestToken;
    const attemptedIdsByToken = new Map<string, Set<string>>();

    let totalSuccessCount = 0;
    let totalRetryCount = 0;
    let lastCompletedToken: string | null = null;
    let abortedByAuth = false;
    let abortedOffline = false;
    const discardedItems: DiscardedUpdate[] = [];
    let toastId: string | number | undefined;
    let didStartUiSync = false;

    try {
      while (currentPassToken) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          abortedOffline = true;
          break;
        }

        pendingTokenChange = false;
        pendingOnlineTrigger = false;
        const passEnqueueVersion = getEnqueueVersion();

        const queue = await getQueuedUpdates();
        let attemptedIds = attemptedIdsByToken.get(currentPassToken);
        if (!attemptedIds) {
          attemptedIds = new Set<string>();
          attemptedIdsByToken.set(currentPassToken, attemptedIds);
        }

        const pendingItems = queue.filter((item) => !attemptedIds.has(item.id));
        if (pendingItems.length === 0) {
          if (pendingTokenChange && latestToken && latestToken !== currentPassToken) {
            currentPassToken = latestToken;
            continue;
          }
          break;
        }

        if (!didStartUiSync) {
          didStartUiSync = true;
          setGlobalSyncing(true);
          toastId = toast.loading(`Sincronizando ${pendingItems.length} entrega(s) offline...`);
        }

        abortedOffline = false;
        abortedByAuth = false;

        for (const item of pendingItems) {
          if (latestToken !== currentPassToken) {
            pendingTokenChange = true;
            break;
          }
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            abortedOffline = true;
            break;
          }

          let updateSucceeded = false;
          try {
            await packageService.updateStatus(
              currentPassToken,
              item.packageId,
              item.status,
              item.lat,
              item.lng,
              item.signature,
              item.photo,
            );
            updateSucceeded = true;
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              // Keep item untouched when session expires so driver can re-auth and retry
              abortedByAuth = true;
              break;
            }

            if (
              !(err instanceof ApiError) &&
              typeof navigator !== 'undefined' &&
              !navigator.onLine
            ) {
              // Network dropped mid-request: pause without consuming a retry
              abortedOffline = true;
              break;
            }

            attemptedIds.add(item.id);
            const reason = err instanceof Error && err.message
              ? err.message
              : 'Error de conexión o servidor';
            const currentRetries = typeof item.retries === 'number' ? item.retries : 0;

            if (currentRetries >= MAX_RETRIES) {
              // Give up after max retries, remove from queue, and warn user in finally
              await clearQueuedUpdate(item.id);
              discardedItems.push({ item, reason });
              lastCompletedToken = currentPassToken;
            } else {
              await incrementRetry(item.id);
              totalRetryCount++;
            }
          }

          if (updateSucceeded) {
            attemptedIds.add(item.id);
            await clearQueuedUpdate(item.id);
            totalSuccessCount++;
            lastCompletedToken = currentPassToken;
          }
        }

        if (abortedByAuth) {
          break;
        }

        if (latestToken && latestToken !== currentPassToken) {
          currentPassToken = latestToken;
          continue;
        }

        const hasNewEnqueue = getEnqueueVersion() !== passEnqueueVersion;
        if (
          (hasNewEnqueue || pendingOnlineTrigger) &&
          latestToken &&
          (typeof navigator === 'undefined' || navigator.onLine)
        ) {
          currentPassToken = latestToken;
          continue;
        }

        break;
      }

      if (toastId !== undefined) {
        if (abortedByAuth) {
          toast.error('Sesión expirada — tus entregas pendientes siguen guardadas', {
            id: toastId,
          });
        } else if (totalSuccessCount > 0) {
          toast.success(
            `✅ ${totalSuccessCount} entrega(s) sincronizada(s) correctamente${
              totalRetryCount > 0 ? ` (${totalRetryCount} pendiente/s de reintento)` : ''
            }`,
            { id: toastId }
          );
        } else if (abortedOffline) {
          toast.warning('Sin conexión — la sincronización continuará al recuperar la red', {
            id: toastId,
          });
        } else if (totalRetryCount > 0) {
          toast.warning(
            `${totalRetryCount} actualización(es) fallaron; se reintentará automáticamente`,
            { id: toastId }
          );
        } else {
          toast.dismiss(toastId);
        }
      }
    } catch (err) {
      console.error('Error inesperado durante la sincronización offline:', err);
      if (toastId !== undefined) {
        toast.error('Error al acceder a la cola offline', { id: toastId });
      }
    } finally {
      if (discardedItems.length > 0) {
        notifyDiscardedUpdates(discardedItems);
      }

      activeSyncPromise = null;
      if (didStartUiSync) {
        setGlobalSyncing(false);
      }

      if (
        (totalSuccessCount > 0 || discardedItems.length > 0) &&
        lastCompletedToken &&
        latestToken === lastCompletedToken
      ) {
        emitSyncCompleted(lastCompletedToken);
      }
    }
  })();

  activeSyncPromise = syncTask;
  return syncTask;
}

export interface UseOfflineSyncOptions {
  /** Auth token for the sync requests */
  token: string | null;
  /** Optional callback invoked after sync resolves or discards queued items */
  onSyncComplete?: () => void | Promise<void>;
}

export interface UseOfflineSyncResult {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  /** Manually trigger a sync attempt */
  syncNow: () => Promise<void>;
  /** Force refresh of the pending count from IndexedDB */
  refreshPendingCount: () => Promise<number | null>;
}

export function useOfflineSync({
  token,
  onSyncComplete,
}: UseOfflineSyncOptions): UseOfflineSyncResult {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(() => globalIsSyncing);

  const isMountedRef = useRef(true);
  const refreshSeqRef = useRef(0);
  const onSyncCompleteRef = useRef(onSyncComplete);
  const activeTokenRef = useRef(token);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  useEffect(() => {
    activeTokenRef.current = token;
    latestToken = token;
  }, [token]);

  // Refresh the pending count from IndexedDB guarding against out-of-order reads
  const refreshPendingCount = useCallback(async (): Promise<number | null> => {
    const seq = ++refreshSeqRef.current;
    try {
      const count = await getPendingCount();
      if (isMountedRef.current && seq === refreshSeqRef.current) {
        setPendingCount(count);
      }
      return count;
    } catch (err) {
      console.error('Error al consultar la cola offline:', err);
      return null;
    }
  }, []);

  // Drain the queue via the module-level coordinator
  const syncNow = useCallback(async () => {
    if (!token) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (isMountedRef.current) {
        setIsOnline(false);
      }
      return;
    }
    await runSyncCoordinator(token, 'manual');
    await refreshPendingCount();
  }, [token, refreshPendingCount]);

  // Listen to online/offline browser events, queue mutations, and coordinator state
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void runSyncCoordinator(token, 'online').finally(() => {
        void refreshPendingCount();
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      void refreshPendingCount();
    };

    const handleSyncingChange = (syncing: boolean) => {
      if (isMountedRef.current) {
        setIsSyncing(syncing);
      }
    };

    const handleSyncCompleted = (syncedToken: string) => {
      if (isMountedRef.current && syncedToken === activeTokenRef.current) {
        void Promise.resolve(onSyncCompleteRef.current?.()).catch((err) => {
          console.error('Error al ejecutar onSyncComplete:', err);
        });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubscribeQueue = subscribeQueueChanges(() => {
      void refreshPendingCount();
    });
    syncingStateListeners.add(handleSyncingChange);
    syncCompletedListeners.add(handleSyncCompleted);

    let cancelled = false;

    // Sync initial state and trigger mount drain asynchronously in callback
    queueMicrotask(() => {
      if (cancelled || !isMountedRef.current) return;
      setIsSyncing(globalIsSyncing);
      void refreshPendingCount();
      if (typeof navigator !== 'undefined' && navigator.onLine && token) {
        void runSyncCoordinator(token, 'mount').finally(() => {
          if (!cancelled) {
            void refreshPendingCount();
          }
        });
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeQueue();
      syncingStateListeners.delete(handleSyncingChange);
      syncCompletedListeners.delete(handleSyncCompleted);
    };
  }, [token, refreshPendingCount]);

  return { isOnline, pendingCount, isSyncing, syncNow, refreshPendingCount };
}
