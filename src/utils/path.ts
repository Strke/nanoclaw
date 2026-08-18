/**
 * Safe path utilities — ensure a resolved path stays inside a base directory.
 */
import path from 'path';

/** Check whether `child` is inside `parent` (resolved). */
export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Assert that `child` is inside `parent`, throw otherwise. */
export function ensureWithinBase(parent: string, child: string): void {
  if (!isPathInside(parent, child)) {
    throw new Error(`Path escapes base directory: ${child}`);
  }
}
