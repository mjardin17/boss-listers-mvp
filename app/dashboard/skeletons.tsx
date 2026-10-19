export function ProfitSummarySkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="h-4 w-28 rounded bg-zinc-800" />
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="h-10 w-36 rounded bg-zinc-800" />
        <div className="h-14 w-28 rounded bg-zinc-800" />
      </div>
      <div className="mt-5 h-4 w-40 rounded bg-zinc-800" />
    </div>
  );
}

export function CompsTableSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="h-5 w-28 rounded bg-zinc-800" />
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
