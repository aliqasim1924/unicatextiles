"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

interface StockRow {
  dye_item_id: string;
  stock_qty: number;
  dye_items: {
    id: string;
    name: string;
    type: string | null;
    code: string | null;
    uom: string;
  };
}

export default function StockClient({ initialStock }: { initialStock: StockRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return initialStock;
    const q = search.toLowerCase();
    return initialStock.filter((row) => row.dye_items?.name?.toLowerCase().includes(q));
  }, [search, initialStock]);

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Search by Name
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type to search..."
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent transition"
        />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Stock Overview
        </h2>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-600">No dye items found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Code</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Stock Qty</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">UoM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.dye_item_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.dye_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.dye_items?.type || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.dye_items?.code || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {row.stock_qty?.toFixed(3) ?? "0.000"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.dye_items?.uom || "kg"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/toolbox/dyes/ledger/${row.dye_item_id}`}
                        className="inline-block rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800"
                      >
                        View Ledger
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </>
  );
}

