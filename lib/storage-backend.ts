/** Public metadata describing the verified application-data store, never credentials. */
export type FirestoreStorageBackend = {
  kind: "firestore";
  projectId: string;
  migratedAt: string;
};

export function isFirestoreStorageBackend(value: unknown): value is FirestoreStorageBackend {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 3 || Object.keys(item).some(key => !["kind", "projectId", "migratedAt"].includes(key))) return false;
  if (item.kind !== "firestore" || typeof item.projectId !== "string" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(item.projectId)) return false;
  if (typeof item.migratedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.migratedAt)) return false;
  const time = Date.parse(item.migratedAt);
  return Number.isFinite(time) && new Date(time).toISOString() === item.migratedAt;
}

/** Older deployments remain Sheets-backed until verified migration metadata arrives. */
export function storageBackendOf(snapshot: unknown): FirestoreStorageBackend | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const backend = (snapshot as { storageBackend?: unknown }).storageBackend;
  return isFirestoreStorageBackend(backend) ? backend : null;
}
