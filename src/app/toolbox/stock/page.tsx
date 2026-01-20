"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

export default function StockPage() {
  return (
    <div className="grid gap-8">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-3xl font-semibold text-slate-900">Stock Control</h1>
        <p className="mt-2 text-lg text-slate-600">
          Overview and access to all stock types with QR code management.
        </p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Stock Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/toolbox/yarn/stock" className="w-full">
            <Button variant="primary" className="w-full">
              Yarn Stock
            </Button>
          </Link>
          <Link href="/toolbox/stock/base-fabric" className="w-full">
            <Button variant="primary" className="w-full">
              Base Fabric Stock
            </Button>
          </Link>
          <Link href="/toolbox/dyes/stock" className="w-full">
            <Button variant="primary" className="w-full">
              Dyes & Chemicals Stock
            </Button>
          </Link>
          <Link href="/toolbox/stock/finished-fabric" className="w-full">
            <Button variant="primary" className="w-full">
              Finished Fabric Stock
            </Button>
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
