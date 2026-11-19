export function getPageRange(params: { current?: number; pageSize?: number }) {
  const current = Number.isFinite(params.current) ? Math.max(1, Math.floor(params.current!)) : 1;
  const pageSize = Number.isFinite(params.pageSize) ? Math.min(100, Math.max(1, Math.floor(params.pageSize!))) : 50;
  const from = (current - 1) * pageSize;
  return { current, pageSize, from, to: from + pageSize - 1 };
}
