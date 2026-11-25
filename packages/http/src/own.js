/**
 * Own-property helpers used to read user options without ever picking up
 * values from a polluted Object.prototype. Runtime-neutral (no node: imports).
 */

/** Copy only own enumerable properties into a null-prototype object. */
export function own(value) {
  const out = Object.create(null);
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) out[k] = value[k];
  }
  return out;
}

/** Read an own property only (never an inherited one). */
export function ownGet(obj, key) {
  return obj != null && Object.hasOwn(obj, key) ? obj[key] : undefined;
}
