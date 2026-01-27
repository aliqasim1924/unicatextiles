"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

const actions = [
  {
    title: "Record Yarn Receiving",
    description: "Record new yarn receipts from suppliers",
    href: "/toolbox/yarn/receiving",
  },
  {
    title: "Record Yarn Issuing",
    description: "Issue yarn to production or other departments",
    href: "/toolbox/yarn/issuing",
  },
  {
    title: "View Yarn Stock",
    description: "View current stock levels for all yarn items",
    href: "/toolbox/yarn/stock",
  },
  {
    title: "Month-end Stocktake",
    description: "Run and review formal yarn stocktake sessions",
    href: "/toolbox/yarn/stocktake",
  },
];

export default function YarnPage() {
  return (
    <div className="grid gap-8">
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Yarn Control</h1>
        <p className="mt-2 text-lg text-slate-600">
          Manage receiving, issuing, and stock of all yarn items.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action, index) => (
          <motion.div
            key={action.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Link
              href={action.href}
              className="block h-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
            >
              <div className="flex h-full flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {action.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {action.description}
                  </p>
                </div>
                <span className="mt-4 inline-block text-sm font-semibold text-teal-700">
                  Open →
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </section>

      {/* Setup & Master Data */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Setup & Master Data
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/toolbox/yarn/items"
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 transition hover:border-teal-700 hover:shadow-sm"
          >
            <div>
              <h3 className="font-semibold text-slate-900">Manage Yarn Items</h3>
              <p className="mt-1 text-sm text-slate-600">
                Add and edit yarn items
              </p>
            </div>
            <span className="text-sm font-semibold text-teal-700">→</span>
          </Link>
          <Link
            href="/toolbox/suppliers"
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 transition hover:border-teal-700 hover:shadow-sm"
          >
            <div>
              <h3 className="font-semibold text-slate-900">Manage Suppliers</h3>
              <p className="mt-1 text-sm text-slate-600">
                Add and edit suppliers
              </p>
            </div>
            <span className="text-sm font-semibold text-teal-700">→</span>
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
