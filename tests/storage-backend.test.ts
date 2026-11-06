import test from "node:test";
import assert from "node:assert/strict";
import { isFirestoreStorageBackend, storageBackendOf } from "../lib/storage-backend.ts";
import { assertSnapshot } from "../lib/sheets-client.ts";

const backend = { kind: "firestore", projectId: "fictional-insup-node", migratedAt: "2026-11-06T04:00:00.000Z" } as const;
const snapshot = { self: { playerId: "ND-001", role: "player" }, players: [{ id: "ND-001", name: "架空担当", target: 20 }], activities: [], counts: {}, syncedAt: "2026-11-06T04:00:00.000Z", warnings: [], writesEnabled: true };

test("a verified Firebase marker is accepted without changing old snapshot or transport contracts", () => {
  assert.doesNotThrow(() => assertSnapshot(snapshot));
  assert.equal(storageBackendOf(snapshot), null);
  assert.equal(storageBackendOf(null), null);
  assert.equal(storageBackendOf(undefined), null);
  const migrated = { ...snapshot, storageBackend: backend };
  assert.doesNotThrow(() => assertSnapshot(migrated));
  assert.equal(storageBackendOf(migrated), backend);
  assert.equal(migrated.writesEnabled, true);
});

test("malformed storage markers and accidental secret or destination fields fail closed", () => {
  for (const value of [null, [], "firestore", {}, { ...backend, kind: "sheets" },
    { ...backend, projectId: "https://unexpected.example" }, { ...backend, projectId: "UPPERCASE" },
    { ...backend, projectId: "short" }, { ...backend, projectId: "project-" },
    { ...backend, migratedAt: "2026-02-30T04:00:00.000Z" }, { ...backend, migratedAt: "not-a-date" },
    { ...backend, migratedAt: "2026-11-06" }, { ...backend, migratedAt: 0 },
    { ...backend, token: "must-not-enter-metadata" }, { ...backend, destinationUrl: "https://docs.google.com/" },
    { ...backend, apiKey: "must-not-enter-metadata" }]) {
    assert.equal(isFirestoreStorageBackend(value), false, JSON.stringify(value));
    assert.equal(storageBackendOf({ storageBackend: value }), null);
    assert.throws(() => assertSnapshot({ ...snapshot, storageBackend: value }), { code: "INVALID_RESPONSE" });
  }
});

test("the Firebase marker never enables writes on a read-only or cached snapshot", () => {
  const readonly = { ...snapshot, storageBackend: backend, writesEnabled: false };
  assert.doesNotThrow(() => assertSnapshot(readonly));
  assert.equal(storageBackendOf(readonly)?.kind, "firestore");
  assert.equal(readonly.writesEnabled, false);
});
