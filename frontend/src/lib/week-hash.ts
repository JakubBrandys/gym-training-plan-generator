const WEEK_HASH_PATTERN = /^#week-([1-9]\d*)$/

export const weekFromHash = (hash: string, weekCount: number): number => {
  const match = WEEK_HASH_PATTERN.exec(hash)
  if (!match) return 1

  const week = Number(match[1])
  return week >= 1 && week <= weekCount ? week : 1
}

export const weekHash = (week: number): string => `#week-${week}`
