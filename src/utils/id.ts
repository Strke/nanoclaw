/**
 * Shared utility: generate a unique ID with optional prefix.
 */
export function generateId(prefix = 'msg'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
