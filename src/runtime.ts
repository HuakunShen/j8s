/**
 * Runtime detection utilities
 * Detects whether code is running in Node.js, Bun, or Deno
 */

/**
 * Check if running in Node.js (not Bun or Deno)
 */
export function isNode(): boolean {
  return !!process.versions.node && !process.versions.bun && !process.versions.deno
}

/**
 * Check if running in Bun
 */
export function isBun(): boolean {
  return !!process.versions.bun
}

/**
 * Check if running in Deno
 */
export function isDeno(): boolean {
  return !!process.versions.deno
}

/**
 * Get the current runtime name
 */
export function getRuntime(): 'node' | 'bun' | 'deno' | 'unknown' {
  if (isBun()) return 'bun'
  if (isDeno()) return 'deno'
  if (isNode()) return 'node'
  return 'unknown'
}

