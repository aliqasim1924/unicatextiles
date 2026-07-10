/**
 * PostgREST/Supabase returns at most 1000 rows by default.
 * Use this helper whenever a query may exceed that limit.
 */
export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}
