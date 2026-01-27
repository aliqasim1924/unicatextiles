"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

const actions = [
  {
    title: "Record Receiving",
    description: "Capture incoming dyes & chemicals",
    href: "/toolbox/dyes/receiving",
  },
  {
    title: "Record Issuing",
    description: "Issue dyes & chemicals to production",
    href: "/toolbox/dyes/issuing",
  },
  {
    title: "View Stock",
    description: "Check current stock balances",
    href: "/toolbox/dyes/stock",
  },
  {
    title: "Month-end Stocktake",
    description: "Run and review formal stocktake sessions",
    href: "/toolbox/dyes/stocktake",
  },
];

export default function DyesDashboardPage() {
  return (
    <div className="grid gap-8">
      {/* Header */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-3xl font-semibold text-slate-900">
          Dyes &amp; Chemicals Control
        </h1>
        <p className="mt-2 text-lg text-slate-600">
          Manage receiving, issuing, and stock for dyes &amp; chemicals.
        </p>
      </motion.section>

      {/* Actions */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {actions.map((action, index) => (
          <motion.div
            key={action.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 * index }}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-xl font-semibold text-slate-900">{action.title}</h3>
            <p className="mt-2 text-slate-600">{action.description}</p>
            <Link href={action.href} className="mt-4 inline-block">
              <Button variant="primary">Go</Button>
            </Link>
          </motion.div>
        ))}
      </motion.section>

      {/* Future setup link placeholder */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Setup &amp; Master Data
            </h3>
            <p className="text-sm text-slate-600">
              Manage dyes &amp; chemicals master data.
            </p>
          </div>
          <Link href="/toolbox/dyes/items">
            <Button variant="secondary">Manage Dyes &amp; Chemicals Items</Button>
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
