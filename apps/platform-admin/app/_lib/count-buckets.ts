/** SQL GROUP BY omits zero-sized groups; an absent collection remains unavailable. */
export function bucketCount(
  counts: Record<string, number> | null | undefined,
  key: string,
): number | undefined {
  if (!counts) return undefined;
  if (!Object.hasOwn(counts, key)) return 0;
  const value = counts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
