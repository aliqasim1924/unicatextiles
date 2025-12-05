export default function Home() {
  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-teal-700">
          Unica Textile Mills
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Production-ready foundation for stock and orders.
        </h1>
        <p className="mt-3 max-w-3xl text-lg text-slate-600">
          Modern Next.js 14 + Supabase stack, optimized for clean workflows,
          mobile-first design, and rapid delivery.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
            href="/auth/login"
          >
            Go to dashboard
          </a>
          <a
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-teal-700 hover:text-teal-800"
            href="/toolbox"
          >
            Open toolbox
          </a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {[
          {
            title: "Auth",
            href: "/auth/login",
            description:
              "Secure entry for operators and managers. Supabase Auth ready.",
            badge: "Login & Register",
          },
          {
            title: "Toolbox",
            href: "/toolbox",
            description:
              "Jump into utilities that support production and planning.",
            badge: "Utilities",
          },
          {
            title: "Yarn",
            href: "/toolbox/yarn",
            description:
              "Inventory hub for yarn inputs with realtime-ready design.",
            badge: "Stock",
          },
          {
            title: "Design System",
            href: "/docs/PROJECT_PLAN",
            description:
              "Shared rules for typography, color, and component behavior.",
            badge: "Documentation",
          },
        ].map((item) => (
          <a
            key={item.title}
            className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
            href={item.href}
          >
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                {item.badge}
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                {item.title}
              </h3>
              <p className="text-sm text-slate-600">{item.description}</p>
            </div>
            <span className="mt-4 text-sm font-semibold text-teal-700">
              View module →
            </span>
          </a>
        ))}
      </section>
    </div>
  );
}
