/**
 * IndexedDB partagée entre le service worker et les pages de l'extension
 * (même origine chrome-extension://). Permet de stocker des PNG volumineux
 * hors de la quota 10 Mo de chrome.storage.
 */
import type { StoredCapture } from "./types";

const DB_NAME = "full-page-capture";
const DB_VERSION = 1;
const STORE = "captures";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Ouverture IndexedDB impossible"));
  });
}

export async function saveCapture(
  capture: Omit<StoredCapture, "id" | "createdAt"> & { id?: string },
): Promise<string> {
  const db = await openDb();
  const record: StoredCapture = {
    ...capture,
    id: capture.id ?? crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Écriture IndexedDB impossible"));
  });
  db.close();
  return record.id;
}

export async function getCapture(id: string): Promise<StoredCapture | undefined> {
  const db = await openDb();
  const record = await new Promise<StoredCapture | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredCapture | undefined);
    req.onerror = () => reject(req.error ?? new Error("Lecture IndexedDB impossible"));
  });
  db.close();
  return record;
}

export async function getLatestCapture(): Promise<StoredCapture | undefined> {
  const db = await openDb();
  const records = await new Promise<StoredCapture[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredCapture[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("Lecture IndexedDB impossible"));
  });
  db.close();
  return records.sort((a, b) => b.createdAt - a.createdAt)[0];
}
