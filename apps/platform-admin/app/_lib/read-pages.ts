/** Read complete operator selections without silently dropping later pages. */
export async function readPages<T, E>(
  read: (
    offset: number,
    limit: number,
  ) => Promise<{ ok: true; data: T[] } | { ok: false; code: E }>,
): Promise<{ ok: true; data: T[] } | { ok: false; code: E }> {
  const data: T[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const result = await read(offset, limit);
    if (!result.ok) return result;
    data.push(...result.data);
    if (result.data.length < limit) return { ok: true, data };
  }
}
