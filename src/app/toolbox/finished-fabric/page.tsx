"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

export default function FinishedFabricPage() {
  return (
    <div className="grid gap-8">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-3xl font-semibold text-slate-900">Finished Fabric Control</h1>
        <p className="mt-2 text-lg text-slate-600">
          Coating, finished rolls, and finished fabric stock.
        </p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/toolbox/finished-fabric/coating/receiving" className="w-full">
            <Button variant="primary" className="w-full">
              Receive Base Fabric into Coating
            </Button>
          </Link>
          <Link href="/toolbox/finished-fabric/coating-batches" className="w-full">
            <Button variant="primary" className="w-full">
              Coating Batches
            </Button>
          </Link>
          <Link href="/toolbox/finished-fabric/coating-batches/new" className="w-full">
            <Button variant="primary" className="w-full">
              New Coating Batch
            </Button>
          </Link>
        </div>
      </motion.section>
    </div>
  );
}

