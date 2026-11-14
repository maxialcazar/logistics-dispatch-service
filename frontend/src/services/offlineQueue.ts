/**
 * offlineQueue.ts
 *
 * A lightweight IndexedDB abstraction for queuing package status updates
 * while the driver is offline. The queue is drained automatically by
 * useOfflineSync when connectivity is restored.
 */

const DB_NAME = 'logistics-offline';
const DB_VERSION = 1;
const STORE_NAME = 'statusQueue';

export interface QueuedStatusUpdate {
  id: string; // locally generated UUID
  packageId: string;
  status: string;
  lat?: number;
  lng?: number;
  signature?: string;
  photo?: string;
  createdAt: number; // epoch ms
  retries: number;
}

// ── DB bootstrap ────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── CRUD helpers ─────────────────────────────────────────────────────────────

export async function enqueueStatusUpdate(
  payload: Omit<QueuedStatusUpdate, 'id' | 'createdAt' | 'retries'>
): Promise<QueuedStatusUpdate> {
  const db = await openDB();
  const item: QueuedStatusUpdate = {
    ...payload,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).add(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedUpdates(): Promise<QueuedStatusUpdate[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedStatusUpdate[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueuedUpdate(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function incrementRetry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedStatusUpdate;
      if (!item) { resolve(); return; }
      item.retries += 1;
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const items = await getQueuedUpdates();
  return items.length;
}
