import DashboardLoader from "./DashboardLoader";

type DashboardPageProps = {
  searchParams?: {
    listingId?: string;
  };
};

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium text-emerald-300">Boss Listers</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal">Analytics dashboard</h1>
        </header>

        <DashboardLoader listingId={searchParams?.listingId} />
      </div>
    </main>
  );
}
