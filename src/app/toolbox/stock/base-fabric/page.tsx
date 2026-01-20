"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { QRCode } from "@/components/qr/QRCode";
import { Button } from "@/components/ui/Button";

const LOCATION_WEAVING = "WEAVING";
const STATUS_AVAILABLE = "AVAILABLE";
const STATUS_ISSUED = "ISSUED";
const STATUS_READY_FOR_COATING = "READY_FOR_COATING";
const STATUS_IN_TRANSIT = "IN_TRANSIT";

interface BaseFabricRoll {
  id: string;
  qr_code: string | null;
  roll_no: string | null;
  length_m: number;
  status: string;
  current_location: string;
  cut_at: string | null;
  order_no: string | null;
  fabric_name: string | null;
  loom_no: number | null;
}

export default function BaseFabricStockPage() {
  const [inStockRolls, setInStockRolls] = useState<BaseFabricRoll[]>([]);
  const [historyRolls, setHistoryRolls] = useState<BaseFabricRoll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inStock" | "history">("inStock");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoll, setSelectedRoll] = useState<BaseFabricRoll | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch in-stock rolls (available at weaving)
      const { data: inStockData, error: inStockError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          status,
          current_location,
          cut_at,
          base_fabric_orders:base_fabric_order_id (
            order_no,
            loom_no,
            base_fabric_items:base_fabric_item_id (
              name
            )
          )
        `
        )
        .eq("current_location", LOCATION_WEAVING)
        .eq("status", STATUS_AVAILABLE)
        .order("cut_at", { ascending: false });

      if (inStockError) throw inStockError;

      // Fetch history rolls (issued, consumed, or dispatched)
      const { data: historyData, error: historyError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          status,
          current_location,
          cut_at,
          base_fabric_orders:base_fabric_order_id (
            order_no,
            loom_no,
            base_fabric_items:base_fabric_item_id (
              name
            )
          )
        `
        )
        .in("status", [STATUS_ISSUED, STATUS_READY_FOR_COATING, STATUS_IN_TRANSIT])
        .order("cut_at", { ascending: false })
        .limit(500); // Limit history to recent 500 rolls

      if (historyError) throw historyError;

      const mapRolls = (data: any[]): BaseFabricRoll[] =>
        (data || []).map((row: any) => {
          const order = Array.isArray(row.base_fabric_orders)
            ? row.base_fabric_orders[0]
            : row.base_fabric_orders;
          const item = order?.base_fabric_items
            ? Array.isArray(order.base_fabric_items)
              ? order.base_fabric_items[0]
              : order.base_fabric_items
            : null;

          return {
            id: row.id,
            qr_code: row.qr_code,
            roll_no: row.roll_no,
            length_m: Number(row.length_m || 0),
            status: row.status,
            current_location: row.current_location,
            cut_at: row.cut_at,
            order_no: order?.order_no || null,
            fabric_name: item?.name || null,
            loom_no: order?.loom_no || null,
          };
        });

      setInStockRolls(mapRolls(inStockData || []));
      setHistoryRolls(mapRolls(historyData || []));
    } catch (err: any) {
      console.error("Error fetching base fabric stock:", err);
      setError(err.message || "Failed to load stock data.");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredInStockRolls = useMemo(() => {
    if (!searchQuery.trim()) return inStockRolls;
    const query = searchQuery.toLowerCase();
    return inStockRolls.filter(
      (roll) =>
        roll.roll_no?.toLowerCase().includes(query) ||
        roll.qr_code?.toLowerCase().includes(query) ||
        roll.fabric_name?.toLowerCase().includes(query) ||
        roll.order_no?.toLowerCase().includes(query)
    );
  }, [inStockRolls, searchQuery]);

  const filteredHistoryRolls = useMemo(() => {
    if (!searchQuery.trim()) return historyRolls;
    const query = searchQuery.toLowerCase();
    return historyRolls.filter(
      (roll) =>
        roll.roll_no?.toLowerCase().includes(query) ||
        roll.qr_code?.toLowerCase().includes(query) ||
        roll.fabric_name?.toLowerCase().includes(query) ||
        roll.order_no?.toLowerCase().includes(query)
    );
  }, [historyRolls, searchQuery]);

  const inStockTotals = useMemo(() => {
    const rollsCount = inStockRolls.length;
    const metersTotal = inStockRolls.reduce((sum, roll) => sum + roll.length_m, 0);
    return { rollsCount, metersTotal };
  }, [inStockRolls]);

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Base Fabric Stock</h1>
          <p className="mt-1 text-slate-600">
            View available rolls and access QR codes. History shows consumed/dispatched rolls.
          </p>
        </div>
        <Link
          href="/toolbox/stock"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Stock Control
        </Link>
      </div>

      {/* Summary Card */}
      {activeTab === "inStock" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Total Rolls in Stock</p>
              <p className="text-2xl font-semibold text-slate-900">{inStockTotals.rollsCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Total Meters</p>
              <p className="text-2xl font-semibold text-slate-900">
                {inStockTotals.metersTotal.toFixed(3)} m
              </p>
            </div>
          </div>
        </motion.section>
      )}

      {/* Tabs */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2 border-b border-slate-200">
            <button
              onClick={() => {
                setActiveTab("inStock");
                setSelectedRoll(null);
              }}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "inStock"
                  ? "border-b-2 border-teal-700 text-teal-700"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              In Stock ({inStockRolls.length})
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                setSelectedRoll(null);
              }}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "history"
                  ? "border-b-2 border-teal-700 text-teal-700"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              History ({historyRolls.length})
            </button>
          </div>
          <Button variant="secondary" onClick={fetchData} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Search by Roll No, QR Code, Fabric Name, or Order No
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type to search..."
            className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent transition"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : (
          <>
            {/* In Stock Tab */}
            {activeTab === "inStock" && (
              <div>
                {filteredInStockRolls.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">
                      {searchQuery ? "No rolls match your search." : "No rolls currently in stock."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Roll No
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            QR Code
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Fabric Name
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Order No
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Loom</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">
                            Length (m)
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInStockRolls.map((roll) => (
                          <tr
                            key={roll.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {roll.roll_no || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.qr_code || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.fabric_name || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.order_no || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.loom_no ? `Loom ${roll.loom_no}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {roll.length_m.toFixed(3)}
                            </td>
                            <td className="px-4 py-3">
                              {roll.qr_code && (
                                <button
                                  onClick={() => setSelectedRoll(roll)}
                                  className="inline-block rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800"
                                >
                                  View QR Code
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === "history" && (
              <div>
                {filteredHistoryRolls.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">
                      {searchQuery
                        ? "No rolls match your search."
                        : "No history records found."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Roll No
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            QR Code
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Fabric Name
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Order No
                          </th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">
                            Length (m)
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Location
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryRolls.map((roll) => (
                          <tr
                            key={roll.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {roll.roll_no || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.qr_code || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.fabric_name || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.order_no || "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {roll.length_m.toFixed(3)}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <span
                                className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                                  roll.status === STATUS_ISSUED
                                    ? "bg-orange-100 text-orange-700"
                                    : roll.status === STATUS_READY_FOR_COATING
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {roll.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.current_location.replace(/_/g, " ")}
                            </td>
                            <td className="px-4 py-3">
                              {roll.qr_code && (
                                <button
                                  onClick={() => setSelectedRoll(roll)}
                                  className="inline-block rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800"
                                >
                                  View QR Code
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.section>

      {/* QR Code Modal */}
      {selectedRoll && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => setSelectedRoll(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">QR Code</h3>
              <button
                onClick={() => setSelectedRoll(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="mb-4 text-center">
              {selectedRoll.qr_code && (
                <div className="mb-4 flex justify-center">
                  <QRCode value={selectedRoll.qr_code} size={200} />
                </div>
              )}
              <div className="space-y-2 text-sm">
                <p className="font-medium text-slate-900">
                  Roll No: {selectedRoll.roll_no || "—"}
                </p>
                <p className="text-slate-600">QR Code: {selectedRoll.qr_code || "—"}</p>
                <p className="text-slate-600">Fabric: {selectedRoll.fabric_name || "—"}</p>
                <p className="text-slate-600">Length: {selectedRoll.length_m.toFixed(3)} m</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/toolbox/qr/print?rollIds=${selectedRoll.id}&type=base_fabric`}
                className="flex-1"
              >
                <Button variant="primary" className="w-full">
                  Print QR Code
                </Button>
              </Link>
              <Button variant="secondary" onClick={() => setSelectedRoll(null)} className="flex-1">
                Close
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
