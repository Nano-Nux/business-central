export function getPaginationPages(pageIndex: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: Math.max(0, totalPages) }, (_, index) => index);
  }

  const pages = new Set([0, totalPages - 1]);
  for (let index = pageIndex - 1; index <= pageIndex + 1; index += 1) {
    if (index > 0 && index < totalPages - 1) pages.add(index);
  }
  return [...pages].sort((left, right) => left - right);
}

export function paginateItems<T>(items: T[], pageIndex: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(0, pageIndex), totalPages - 1);
  return {
    currentPage,
    pageItems: items.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    totalPages,
  };
}
