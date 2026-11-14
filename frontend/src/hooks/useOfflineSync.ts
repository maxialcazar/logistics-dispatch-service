/**
 * useOfflineSync.ts
 *
 * Monitors connectivity and automatically drains the offline IndexedDB
 * queue when the device comes back online. Exposes `isOnline` and
 * `pendingCount` for UI consumption.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  getQueuedUpdates,
  clearQueuedUpdate,
  incrementRetry,
  getPendingCount,
} from '../services/offlineQueue';
import { packageService } from '../services/packageService';

const MAX_RETRIES = 3;

interface UseOfflineSyncOptions {
  /** Auth token for the sync requests */
  token: string | null;
}

interface UseOfflineSyncResult {
  isOnline: boolean;
  pendingCount: number;
  /** Manually trigger a sync attempt */
  syncNow: () => Promise<void>;
}

export function useOfflineSync({ token }: UseOfflineSyncOptions): UseOfflineSyncResult {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const isSyncing = useRef(false);

  // Refresh the pending count from IndexedDB
  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Drain the queue — called when coming back online
  const syncNow = useCallback(async () => {
    if (isSyncing.current || !token) return;
    isSyncing.current = true;

    try {
      const queue = await getQueuedUpdates();
      if (queue.length === 0) return;

      const toastId = toast.loading(`Sincronizando ${queue.length} entrega(s) offline...`);
      let successCount = 0;
      let failCount = 0;

      for (const item of queue) {
        try {
          await packageService.updateStatus(
            token,
            item.packageId,
            item.status,
            item.lat,
            item.lng,
            item.signature,
            item.photo,
          );
          await clearQueuedUpdate(item.id);
          successCount++;
        } catch (err) {
          if (item.retries >= MAX_RETRIES) {
            // Give up after too many retries and remove from queue
            await clearQueuedUpdate(item.id);
            failCount++;
          } else {
            await incrementRetry(item.id);
          }
        }
      }

      if (successCount > 0) {
        toast.success(
          `✅ ${successCount} entrega(s) sincronizada(s) correctamente`,
          { id: toastId }
        );
      } else if (failCount > 0) {
        toast.error(
          `${failCount} entrega(s) no pudieron sincronizarse tras varios intentos`,
          { id: toastId }
        );
      } else {
        toast.dismiss(toastId);
      }
    } finally {
      isSyncing.current = false;
      await refreshCount();
    }
  }, [token, refreshCount]);

  // Listen to online/offline browser events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial count refresh
    refreshCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, refreshCount]);

  return { isOnline, pendingCount, syncNow };
}
