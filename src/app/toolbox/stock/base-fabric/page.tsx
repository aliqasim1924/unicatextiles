"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { QRCode } from "@/components/qr/QRCode";
import { Button } from "@/components/ui/Button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const LOCATION_COATING = "COATING";
const STATUS_READY_FOR_COATING = "READY_FOR_COATING";
const STATUS_ISSUED = "ISSUED";
const STATUS_COATING_IN_PROGRESS = "COATING_IN_PROGRESS";

interface BaseFabricRoll {
  id: string;
  qr_code: string | null;
  roll_no: string | null;
  length_m: number; // Raw length (used for history)
  remaining_for_batches: number; // Effective stock length for in-stock view
  status: string;
  current_location: string;
  cut_at: string | null;
  order_no: string | null;
  fabric_name: string | null;
  effective_gsm: number | null;
  gsm_change_reason: string | null;
  loom_no: number | null;
  base_fabric_order_id?: string | null;
  is_outsourced?: boolean;
  purchased_cost_per_m_zar?: number | null;
  yarn_cost_per_m?: number | null;
  valuation_zar?: number;
}

export default function BaseFabricStockPage() {
  const [inStockRolls, setInStockRolls] = useState<BaseFabricRoll[]>([]);
  const [historyRolls, setHistoryRolls] = useState<BaseFabricRoll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inStock" | "history">("inStock");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoll, setSelectedRoll] = useState<BaseFabricRoll | null>(null);
  const [expandedFabric, setExpandedFabric] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"summary" | "detail">("summary");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch available in-stock rolls via the availability view
      const { data: inStockData, error: inStockError } = await supabaseBrowserClient
        .from("base_fabric_rolls_available_for_coating")
        .select(`
          id,
          qr_code,
          roll_no,
          length_m,
          cut_at,
          order_no,
          loom_no,
          fabric_name,
          current_location,
          status,
          total_allocated_to_batches,
          remaining_for_batches,
          base_fabric_order_id
        `)
        .gt("remaining_for_batches", 0)
        .order("cut_at", { ascending: false });

      if (inStockError) throw inStockError;

      // Fetch history rolls (everything that is not a standard active coating roll)
      const { data: historyData, error: historyError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(`
  id,
  qr_code,
  roll_no,
  length_m,
  status,
  current_location,
  cut_at,
  actual_gsm,
  gsm_change_reason,
  base_fabric_order_id,
  base_fabric_orders:base_fabric_order_id (
    order_no,
    loom_no,
    base_fabric_items:base_fabric_item_id (
      name,
      gsm
    )
  )
`)
        .not("status", "eq", STATUS_READY_FOR_COATING) // Exclude ready rolls that belong in stock
        .order("cut_at", { ascending: false })
        .limit(200);

      if (historyError) throw historyError;

      const mapInStockRolls = (data: any[]): BaseFabricRoll[] =>
        (data || []).map((row: any) => ({
          id: row.id,
          qr_code: row.qr_code,
          roll_no: row.roll_no,
          length_m: Number(row.length_m || 0),
          remaining_for_batches: Number(row.remaining_for_batches ?? 0),
          status: row.status || STATUS_READY_FOR_COATING,
          current_location: row.current_location || LOCATION_COATING,
          cut_at: row.cut_at,
          order_no: row.order_no || null,
          fabric_name: row.fabric_name || null,
          effective_gsm: null,
          gsm_change_reason: null,
          loom_no: row.loom_no ? Number(row.loom_no) : null,
          base_fabric_order_id: row.base_fabric_order_id || null,
          is_outsourced: false,
        }));

      const mapHistoryRolls = (data: any[]): BaseFabricRoll[] =>
        (data || []).map((row: any) => {
          const order = Array.isArray(row.base_fabric_orders)
            ? row.base_fabric_orders[0]
            : row.base_fabric_orders;
          const item = order?.base_fabric_items
            ? Array.isArray(order.base_fabric_items)
              ? order.base_fabric_items[0]
              : order.base_fabric_items
            : null;

          const len = Number(row.length_m || 0);
          return {
            id: row.id,
            qr_code: row.qr_code,
            roll_no: row.roll_no,
            length_m: len,
            remaining_for_batches: len,
            status: row.status,
            current_location: row.current_location,
            cut_at: row.cut_at,
            order_no: order?.order_no || null,
            fabric_name: item?.name || null,
            effective_gsm: row.actual_gsm ?? item?.gsm ?? null,
            gsm_change_reason: row.gsm_change_reason ?? null,
            loom_no: order?.loom_no || null,
            base_fabric_order_id: row.base_fabric_order_id || null,
          };
        });

      const mappedInStock = mapInStockRolls(inStockData || []);

      // 3. Calculate valuations for in-stock rolls using remaining meters
      const rollsWithValuation = await Promise.all(
        mappedInStock.map(async (roll) => {
          if (!roll.base_fabric_order_id) {
            return { ...roll, yarn_cost_per_m: null, valuation_zar: 0 };
          }

          try {
            const { data: orderData } = await supabaseBrowserClient
              .from("base_fabric_orders")
              .select("is_outsourced, purchased_cost_per_m_zar")
              .eq("id", roll.base_fabric_order_id)
              .single();

            if (orderData?.is_outsourced && orderData.purchased_cost_per_m_zar != null) {
              const costPerM = Number(orderData.purchased_cost_per_m_zar);
              return {
                ...roll,
                is_outsourced: true,
                yarn_cost_per_m: costPerM,
                valuation_zar: roll.remaining_for_batches * costPerM,
              };
            }

            const { data: yarnIssues } = await supabaseBrowserClient
              .from("yarn_transactions")
              .select("yarn_item_id, quantity")
              .eq("base_fabric_order_id", roll.base_fabric_order_id)
              .eq("transaction_type", "ISSUE");

            if (!yarnIssues || yarnIssues.length === 0) {
              return { ...roll, yarn_cost_per_m: null, valuation_zar: 0 };
            }

            const yarnItemIds = [...new Set(yarnIssues.map((i: any) => i.yarn_item_id))];
            const { data: yarnReceipts } = await supabaseBrowserClient
              .from("yarn_transactions")
              .select("yarn_item_id, quantity, unit_price_zar")
              .in("yarn_item_id", yarnItemIds)
              .in("transaction_type", ["RECEIPT", "RETURN"])
              .not("unit_price_zar", "is", null);

            const avgPriceMap = new Map<string, { qty: number; cost: number }>();
            (yarnReceipts || []).forEach((txn: any) => {
              const existing = avgPriceMap.get(txn.yarn_item_id) || { qty: 0, cost: 0 };
              const qty = Number(txn.quantity || 0);
              const price = Number(txn.unit_price_zar || 0);
              avgPriceMap.set(txn.yarn_item_id, {
                qty: existing.qty + qty,
                cost: existing.cost + qty * price,
              });
            });

            const avgUnitPriceByYarn = new Map<string, number>();
            avgPriceMap.forEach((val, key) => {
              if (val.qty > 0) avgUnitPriceByYarn.set(key, val.cost / val.qty);
            });

            let totalYarnCost = 0;
            yarnIssues.forEach((issue: any) => {
              const avgPrice = avgUnitPriceByYarn.get(issue.yarn_item_id) || 0;
              totalYarnCost += Number(issue.quantity || 0) * avgPrice;
            });

            const { data: orderRolls } = await supabaseBrowserClient
              .from("base_fabric_rolls")
              .select("length_m")
              .eq("base_fabric_order_id", roll.base_fabric_order_id);

            const totalMeters = (orderRolls || []).reduce(
              (sum: number, r: any) => sum + Number(r.length_m || 0),
              0
            );

            const yarnCostPerM = totalMeters > 0 ? totalYarnCost / totalMeters : null;
            const valuation = yarnCostPerM ? roll.remaining_for_batches * yarnCostPerM : 0;

            return {
              ...roll,
              yarn_cost_per_m: yarnCostPerM,
              valuation_zar: valuation,
            };
          } catch (err) {
            console.error(`Error calculating valuation for roll ${roll.id}:`, err);
            return { ...roll, yarn_cost_per_m: null, valuation_zar: 0 };
          }
        })
      );

      setInStockRolls(rollsWithValuation);
      setHistoryRolls(mapHistoryRolls(historyData || []));
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
    const metersTotal = inStockRolls.reduce((sum, roll) => sum + roll.remaining_for_batches, 0);
    const totalValuation = inStockRolls.reduce((sum, roll) => sum + (roll.valuation_zar || 0), 0);
    return { rollsCount, metersTotal, totalValuation };
  }, [inStockRolls]);

  const summaryByFabric = useMemo(() => {
    const byFabric = new Map<
      string,
      { fabricName: string; rolls: BaseFabricRoll[]; totalMetres: number; totalValuation: number }
    >();
    filteredInStockRolls.forEach((roll) => {
      const name = roll.fabric_name || "Unknown";
      const existing = byFabric.get(name);
      const rollMeters = roll.remaining_for_batches;
      const totalValuation = roll.valuation_zar ?? 0;
      if (existing) {
        existing.rolls.push(roll);
        existing.totalMetres += rollMeters;
        existing.totalValuation += totalValuation;
      } else {
        byFabric.set(name, {
          fabricName: name,
          rolls: [roll],
          totalMetres: rollMeters,
          totalValuation,
        });
      }
    });
    return Array.from(byFabric.values()).sort((a, b) =>
      a.fabricName.localeCompare(b.fabricName)
    );
  }, [filteredInStockRolls]);

  async function generatePDF() {
    if (inStockRolls.length === 0) {
      alert("No stock data to generate report");
      return;
    }

    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const templateName = "Base Fabric Stock Report";

      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("UNICA TEXTILES", pageWidth / 2, 60, { align: "center" });

      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.text("Base Fabric Stock Report", pageWidth / 2, 75, { align: "center" });

      doc.setFontSize(12);
      const reportDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.text(`Generated: ${reportDate}`, pageWidth / 2, 95, { align: "center" });
      doc.text(`Total Available Rolls: ${inStockTotals.rollsCount}`, pageWidth / 2, 110, { align: "center" });
      doc.text(`Total Remaining Meters: ${inStockTotals.metersTotal.toFixed(3)} m`, pageWidth / 2, 125, { align: "center" });
      doc.text(`Total Valuation: R ${inStockTotals.totalValuation.toFixed(2)}`, pageWidth / 2, 140, { align: "center" });

      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      doc.text("Confidential - For Internal Use Only", pageWidth / 2, pageHeight - 20, { align: "center" });

      // ===== SUMMARY BY FABRIC =====
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Summary by Fabric", margin, 20);

      const summaryTableData = summaryByFabric.map((group) => [
        group.fabricName,
        group.rolls.length.toString(),
        group.totalMetres.toFixed(3),
        `R ${(group.totalValuation || 0).toFixed(2)}`,
      ]);

      autoTable(doc, {
        head: [["Fabric Name", "Roll Count", "Total (m)", "Valuation (ZAR)"]],
        body: summaryTableData,
        startY: 30,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });

      doc.save(`base-fabric-stock-report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF: " + (err.message || "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Base Fabric Stock</h1>
          <p className="mt-1 text-slate-600">
            View available inventory based on remaining batch quantities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/toolbox/base-fabric/stocktake"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            Month-end Stocktake
          </Link>
          <Button variant="primary" onClick={generatePDF} disabled={isGenerating || isLoading}>
            {isGenerating ? "Generating..." : "Print Report"}
          </Button>
          <Link
            href="/toolbox/stock"
            className="text-sm font-semibold text-slate-700 hover:text-slate-900 transition"
          >
            ← Back to Stock Control
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      {activeTab === "inStock" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Available Rolls</p>
              <p className="text-2xl font-semibold text-slate-900">{inStockTotals.rollsCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Total Remaining Meters</p>
              <p className="text-2xl font-semibold text-slate-900">
                {inStockTotals.metersTotal.toFixed(3)} m
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Total Valuation</p>
              <p className="text-2xl font-semibold text-slate-900">
                R {inStockTotals.totalValuation?.toFixed(2) || "0.00"}
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
              className={`px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "inStock"
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
              className={`px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "history"
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
                  <>
                    <div className="mb-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setViewMode("summary")}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${viewMode === "summary"
                          ? "bg-teal-700 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                      >
                        Summary by fabric
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("detail")}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${viewMode === "detail"
                          ? "bg-teal-700 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                      >
                        All rolls
                      </button>
                    </div>

                    {viewMode === "summary" ? (
                      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="px-4 py-3 w-8"></th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-900">Fabric name</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-900">Rolls</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-900">Remaining (m)</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-900">Valuation (ZAR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summaryByFabric.map((group) => (
                              <React.Fragment key={group.fabricName}>
                                <tr
                                  onClick={() => setExpandedFabric((prev) => (prev === group.fabricName ? null : group.fabricName))}
                                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                                >
                                  <td className="px-4 py-3 text-slate-500">
                                    {expandedFabric === group.fabricName ? "▼" : "▶"}
                                  </td>
                                  <td className="px-4 py-3 font-medium text-slate-900">{group.fabricName}</td>
                                  <td className="px-4 py-3 text-right text-slate-900">{group.rolls.length}</td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-900">{group.totalMetres.toFixed(3)}</td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                                    R {(group.totalValuation || 0).toFixed(2)}
                                  </td>
                                </tr>
                                {expandedFabric === group.fabricName && (
                                  <tr key={`${group.fabricName}-rolls`}>
                                    <td colSpan={5} className="px-0 py-0 bg-slate-50">
                                      <div className="px-4 py-2 border-b border-slate-200">
                                        <table className="min-w-full text-sm">
                                          <thead>
                                            <tr className="border-b border-slate-200">
                                              <th className="px-3 py-2 text-left font-semibold text-slate-700">Roll No</th>
                                              <th className="px-3 py-2 text-left font-semibold text-slate-700">Order No</th>
                                              <th className="px-3 py-2 text-right font-semibold text-slate-700">Remaining (m)</th>
                                              <th className="px-3 py-2 text-right font-semibold text-slate-700">Cost/m (ZAR)</th>
                                              <th className="px-3 py-2 text-right font-semibold text-slate-700">Valuation (ZAR)</th>
                                              <th className="px-3 py-2 text-left font-semibold text-slate-700">Actions</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {group.rolls.map((roll) => (
                                              <tr key={roll.id} className="border-b border-slate-100">
                                                <td className="px-3 py-2 font-medium text-slate-900">{roll.roll_no || "—"}</td>
                                                <td className="px-3 py-2 text-slate-600">{roll.order_no || "—"}</td>
                                                <td className="px-3 py-2 text-right text-slate-900">{roll.remaining_for_batches.toFixed(3)}</td>
                                                <td className="px-3 py-2 text-right text-slate-900">
                                                  {roll.yarn_cost_per_m != null ? `R ${Number(roll.yarn_cost_per_m).toFixed(2)}` : "—"}
                                                </td>
                                                <td className="px-3 py-2 text-right font-medium text-slate-900">
                                                  {roll.valuation_zar != null && roll.valuation_zar > 0 ? `R ${roll.valuation_zar.toFixed(2)}` : "—"}
                                                </td>
                                                <td className="px-3 py-2">
                                                  {roll.qr_code && (
                                                    <button
                                                      type="button"
                                                      onClick={(e) => { e.stopPropagation(); setSelectedRoll(roll); }}
                                                      className="text-teal-700 text-xs font-semibold hover:underline"
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
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-900">QR Code</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-900">Fabric Name</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-900">Order No</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-900">Loom</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-900">Remaining (m)</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-900">Cost/m (ZAR)</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-900">Valuation (ZAR)</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredInStockRolls.map((roll) => (
                              <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-900">{roll.roll_no || "—"}</td>
                                <td className="px-4 py-3 text-slate-600">{roll.qr_code || "—"}</td>
                                <td className="px-4 py-3 text-slate-600">{roll.fabric_name || "—"}</td>
                                <td className="px-4 py-3 text-slate-600">{roll.order_no || "—"}</td>
                                <td className="px-4 py-3 text-slate-600">{roll.loom_no ? `Loom ${roll.loom_no}` : "—"}</td>
                                <td className="px-4 py-3 text-right font-medium text-slate-900">{roll.remaining_for_batches.toFixed(3)}</td>
                                <td className="px-4 py-3 text-right text-slate-900">
                                  {roll.yarn_cost_per_m != null ? `R ${Number(roll.yarn_cost_per_m).toFixed(2)}` : "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-slate-900">
                                  {roll.valuation_zar != null && roll.valuation_zar > 0 ? `R ${roll.valuation_zar.toFixed(2)}` : "—"}
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
                  </>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === "history" && (
              <div>
                {filteredHistoryRolls.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">
                      {searchQuery ? "No rolls match your search." : "No history records found."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">QR Code</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Fabric Name</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Order No</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">GSM</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">Length (m)</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Location</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryRolls.map((roll) => (
                          <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{roll.roll_no || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{roll.qr_code || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{roll.fabric_name || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{roll.order_no || "—"}</td>
                            <td className="px-4 py-3 text-right text-slate-900">
                              {roll.effective_gsm != null ? roll.effective_gsm.toFixed(2) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">{roll.length_m.toFixed(3)}</td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${roll.status === STATUS_ISSUED ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                {roll.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{roll.current_location.replace(/_/g, " ")}</td>
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
              <button onClick={() => setSelectedRoll(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="mb-4 text-center">
              {selectedRoll.qr_code && (
                <div className="mb-4 flex justify-center">
                  <QRCode value={selectedRoll.qr_code} size={200} />
                </div>
              )}
              <div className="space-y-2 text-sm text-left">
                <p className="font-medium text-slate-900">Roll No: {selectedRoll.roll_no || "—"}</p>
                <p className="text-slate-600">Fabric: {selectedRoll.fabric_name || "—"}</p>
                <p className="text-slate-600">Remaining Length: {selectedRoll.remaining_for_batches.toFixed(3)} m</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/toolbox/qr/print?rollIds=${selectedRoll.id}&type=base_fabric`} className="flex-1">
                <Button variant="primary" className="w-full">Print QR Code</Button>
              </Link>
              <Button variant="secondary" onClick={() => setSelectedRoll(null)} className="flex-1">Close</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}