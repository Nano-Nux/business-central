import type { ApiEnvelope } from "./types";

export async function loadResourcePages<T>(
  path: string,
  allPages: boolean,
  read: <V>(path: string) => Promise<ApiEnvelope<V>>,
): Promise<ApiEnvelope<T[]>> {
  const first = await read<T[]>(path);
  if (!allPages) return first;
  const data = [...first.data];
  const url = new URL(path, "http://resource.local");
  const start = Number(url.searchParams.get("page_index") ?? 0);
  for (let index = start + 1; index < (first.meta?.total_pages ?? 1); index++) {
    url.searchParams.set("page_index", String(index));
    const next = await read<T[]>(`${url.pathname}${url.search}`);
    data.push(...next.data);
  }
  return { ...first, data };
}
