const MAX_LIMIT = 1000

export function clampLimit(val) {
  const n = parseInt(val) || 50
  return Math.min(Math.max(n, 1), MAX_LIMIT)
}

export function clampOffset(val) {
  const n = parseInt(val) || 0
  return Math.max(n, 0)
}
