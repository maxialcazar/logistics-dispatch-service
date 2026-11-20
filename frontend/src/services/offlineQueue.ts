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

let enqueueSequence = 0;

export interface QueuedStatusUpdate {
  id: string; // locally generated unique ID
  packageId: string;
  status: string;
  lat?: number;
  lng?: number;
  signature?: string;
  photo?: string;
  createdAt: number; // epoch ms
  retries: number;
}

interface TransactionContext<T> {
  store: IDBObjectStore;
  setResult: (value: T) => void;
  onRequestError: (req: IDBRequest) => void;
  abortWithError: (err: unknown) => void;
}

// ── DB bootstrap & lifecycle ────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };

    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function withDb<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try {
    return await operation(db);
  } finally {
    db.close();
  }
}

function withTransaction<T>(
  mode: IDBTransactionMode,
  executor: (ctx: TransactionContext<T>) => void
): Promise<T> {
  return withDb((db) => {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let hasResult = false;
      let result: T;
      let firstRequestError: unknown = null;

      const settleResolve = (value: T) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const settleReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);

      const abortWithError = (err: unknown) => {
        if (firstRequestError === null) {
          firstRequestError = err;
        }
        try {
          tx.abort();
        } catch {
          // Ignore if transaction already finished or aborted
        }
        settleReject(firstRequestError);
      };

      tx.oncomplete = () => {
        settleResolve(hasResult ? result : (undefined as T));
      };

      tx.onerror = () => {
        settleReject(firstRequestError ?? tx.error ?? new Error('IndexedDB transaction error'));
      };

      tx.onabort = () => {
        settleReject(firstRequestError ?? tx.error ?? new Error('IndexedDB transaction aborted'));
      };

      const setResult = (value: T) => {
        result = value;
        hasResult = true;
      };

      const onRequestError = (req: IDBRequest) => {
        if (firstRequestError === null && req.error) {
          firstRequestError = req.error;
        }
      };

      try {
        executor({ store, setResult, onRequestError, abortWithError });
      } catch (err) {
        abortWithError(err);
      }
    });
  });
}

// ── FIFO ordering helpers ────────────────────────────────────────────────────

function toTimestampMs(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function compareIds(a: unknown, b: unknown): number {
  const numA =
    typeof a === 'number'
      ? a
      : typeof a === 'string' && /^-?\d+(\.\d+)?$/.test(a.trim())
        ? Number(a)
        : NaN;
  const numB =
    typeof b === 'number'
      ? b
      : typeof b === 'string' && /^-?\d+(\.\d+)?$/.test(b.trim())
        ? Number(b)
        : NaN;

  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }

  const strA = String(a ?? '');
  const strB = String(b ?? '');
  if (strA < strB) return -1;
  if (strA > strB) return 1;
  return 0;
}

function sortQueuedUpdatesFifo(items: QueuedStatusUpdate[]): QueuedStatusUpdate[] {
  return [...items].sort((a, b) => {
    const timeDiff = toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return compareIds(a.id, b.id);
  });
}

// ── CRUD helpers ─────────────────────────────────────────────────────────────

export async function enqueueStatusUpdate(
  payload: Omit<QueuedStatusUpdate, 'id' | 'createdAt' | 'retries'>
): Promise<QueuedStatusUpdate> {
  const createdAt = Date.now();
  enqueueSequence += 1;
  const seq = String(enqueueSequence).padStart(8, '0');
  const item: QueuedStatusUpdate = {
    ...payload,
    id: `${createdAt}-${seq}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt,
    retries: 0,
  };

  return withTransaction<QueuedStatusUpdate>('readwrite', ({ store, setResult, onRequestError }) => {
    const req = store.add(item);
    req.onsuccess = () => setResult(item);
    req.onerror = () => onRequestError(req);
  });
}

export async function getQueuedUpdates(): Promise<QueuedStatusUpdate[]> {
  const items = await withTransaction<QueuedStatusUpdate[]>('readonly', ({ store, setResult, onRequestError }) => {
    const req = store.getAll();
    req.onsuccess = () => setResult((req.result as QueuedStatusUpdate[] | undefined) ?? []);
    req.onerror = () => onRequestError(req);
  });
  return sortQueuedUpdatesFifo(items);
}

export async function clearQueuedUpdate(id: string): Promise<void> {
  return withTransaction<void>('readwrite', ({ store, onRequestError }) => {
    const req = store.delete(id);
    req.onerror = () => onRequestError(req);
  });
}

export async function incrementRetry(id: string): Promise<void> {
  return withTransaction<void>('readwrite', ({ store, onRequestError, abortWithError }) => {
    const getReq = store.get(id);
    getReq.onerror = () => onRequestError(getReq);
    getReq.onsuccess = () => {
      try {
        const item = getReq.result as QueuedStatusUpdate | undefined;
        if (!item) return;

        const updated: QueuedStatusUpdate = {
          ...item,
          retries: (typeof item.retries === 'number' ? item.retries : 0) + 1,
        };
        const putReq = store.put(updated);
        putReq.onerror = () => onRequestError(putReq);
      } catch (err) {
        abortWithError(err);
      }
    };
  });
}

export async function getPendingCount(): Promise<number> {
  return withTransaction<number>('readonly', ({ store, setResult, onRequestError }) => {
    const req = store.count();
    req.onsuccess = () => setResult(req.result);
    req.onerror = () => onRequestError(req);
  });
}
