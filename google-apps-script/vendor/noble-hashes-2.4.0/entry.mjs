import { sha256 } from "./upstream/sha2.js";
import { pbkdf2 } from "./upstream/pbkdf2.js";

// Only byte inputs reach this server-only adapter. Password UTF-8 encoding and
// pepper handling remain in the existing Apps Script Utilities prehash.
export function derive(key, salt, iterations) {
  return pbkdf2(sha256, key, salt, { c: iterations, dkLen: 32 });
}
