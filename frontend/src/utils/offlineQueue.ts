/**
 * offlineQueue.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Manages a persistent queue of failed API requests using IndexedDB.
 * Used by the DriverDashboard to queue status updates when the device is offline
 * and automatically replay them when connectivity is restored.
 */

const DB_NAME = "lde-offline-queue";
const STORE_NAME = "pending-requests";
const DB_VERSION = 1;

export interface QueuedRequest {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  queuedAt: number;
  /** Human-readable label for the UI (e.g. "Entregar #PKG-001") */
  label: string;
}

// ─── DB Bootstrap ─────────────────────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Adds a request to the offline queue */
export async function enqueue(req: Omit<QueuedRequest, "id" | "queuedAt">): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ ...req, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns all queued requests in insertion order */
export async function getAll(): Promise<QueuedRequest[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedRequest[]);
    req.onerror = () => reject(req.error);
  });
}

/** Removes a request from the queue by id (after successful replay) */
export async function dequeue(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns the number of pending requests in the queue */
export async function count(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Attempts to replay all queued requests in order.
 * Successfully replayed requests are removed from the queue.
 * Failed ones remain for the next attempt.
 * @returns Number of successfully replayed requests
 */
export async function replayQueue(): Promise<number> {
  const pending = await getAll();
  if (pending.length === 0) return 0;

  let replayed = 0;

  for (const item of pending) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });

      // Consider 2xx and 422 (invalid transition) as "done" — remove from queue
      if (res.ok || res.status === 422) {
        await dequeue(item.id!);
        replayed++;
      }
    } catch {
      // Network still unavailable — leave in queue, stop processing
      break;
    }
  }

  return replayed;
}
