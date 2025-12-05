"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";

interface YarnStockItem {
  yarn_item_id: string;
  stock_qty: number;
  yarn_items: {
    name: string;
    material: string | null;
    denier: number | null;
    uom: string;
  };
}

export default function YarnStockPage() {
  const [stockItems, setStockItems] = useState<YarnStockItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<YarnStockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStock() {
      try {
        const { data, error } = await supabaseBrowserClient
          .from("yarn_stock")
          .select(
            `
            yarn_item_id,
            stock_qty,
            yarn_items:yarn_item_id (
              name,
              material,
              denier,
              uom
            )
          `
          );

        if (error) throw error;

        const processedData = (data as any[]).map((item) => ({
          ...item,
          yarn_items: Array.isArray(item.yarn_items) ? item.yarn_items[0] : item.yarn_items,
        })) as YarnStockItem[];

        // Sort by yarn name
        processedData.sort((a, b) => {
          const nameA = a.yarn_items?.name || "";
          const nameB = b.yarn_items?.name || "";
          return nameA.localeCompare(nameB);
        });

        setStockItems(processedData);
        setFilteredItems(processedData);
      } catch (err) {
        console.error("Error fetching yarn stock:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStock();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredItems(stockItems);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = stockItems.filter((item) =>
      item.yarn_items?.name?.toLowerCase().includes(query)
    );
    setFilteredItems(filtered);
  }, [searchQuery, stockItems]);

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Stock</h1>
          <p className="mt-1 text-slate-600">
            Current stock levels for all yarn items
          </p>
        </div>
        <Link
          href="/toolbox/yarn"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Yarn Control
        </Link>
      </div>

      {/* Search */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Search by Yarn Name
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Type to search..."
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent transition"
        />
      </motion.section>

      {/* Stock Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Stock Overview
        </h2>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-slate-600">
            {searchQuery ? "No yarn items match your search." : "No yarn items found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Yarn Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Material
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Denier
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Stock Quantity
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    UoM
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.yarn_item_id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.yarn_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.yarn_items?.material || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.yarn_items?.denier ? `${item.yarn_items.denier}D` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {item.stock_qty?.toFixed(3) || "0.000"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.yarn_items?.uom || "kg"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/toolbox/yarn/ledger/${item.yarn_item_id}`}
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
    </div>
  );
}

