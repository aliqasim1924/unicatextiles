"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

export default function BaseFabricPage() {
  return (
    <div className="grid gap-8">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-3xl font-semibold text-slate-900">Base Fabric Control</h1>
        <p className="mt-2 text-lg text-slate-600">
          Plan and track weaving production orders.
        </p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/toolbox/base-fabric/orders/new" className="w-full">
            <Button variant="primary" className="w-full">
              New Production Order
            </Button>
          </Link>
          <Link href="/toolbox/base-fabric/orders" className="w-full">
            <Button variant="secondary" className="w-full">
              View Orders
            </Button>
          </Link>
          <Link href="/toolbox/base-fabric/issuing" className="w-full">
            <Button variant="secondary" className="w-full">
              Issue to Coating
            </Button>
          </Link>
          <Link href="/toolbox/base-fabric/stocktake" className="w-full">
            <Button variant="secondary" className="w-full">
              Month-end Stocktake
            </Button>
          </Link>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Setup &amp; Master Data</h3>
            <p className="text-sm text-slate-600">Manage base fabric items and specs.</p>
          </div>
          <Link href="/toolbox/base-fabric/items">
            <Button variant="secondary">Manage Base Fabric Items</Button>
          </Link>
        </div>
      </motion.section>
    </div>
  );
}

