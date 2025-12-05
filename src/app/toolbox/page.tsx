export default function ToolboxPage() {
  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Toolbox</h1>
        <p className="mt-2 text-slate-600">
          Welcome to the toolbox. Select a module to get started.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a
          href="/toolbox/yarn"
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
              Stock
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Yarn</h3>
            <p className="text-sm text-slate-600">
              Manage yarn inventory, receiving, issuing, and stock overview.
            </p>
          </div>
          <span className="mt-4 text-sm font-semibold text-teal-700">
            View module →
          </span>
        </a>
      </section>
    </div>
  );
}

