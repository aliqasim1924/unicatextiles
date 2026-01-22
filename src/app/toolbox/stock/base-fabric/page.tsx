"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { QRCode } from "@/components/qr/QRCode";
import { Button } from "@/components/ui/Button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  base_fabric_order_id?: string | null;
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
  const [isGenerating, setIsGenerating] = useState(false);

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
            base_fabric_order_id: row.base_fabric_order_id || null,
          };
        });

      const mappedInStock = mapRolls(inStockData || []);
      
      // Calculate yarn cost per meter for each roll
      const rollsWithValuation = await Promise.all(
        mappedInStock.map(async (roll) => {
          if (!roll.base_fabric_order_id) {
            return { ...roll, yarn_cost_per_m: null, valuation_zar: 0 };
          }

          try {
            // Get yarn issues for this order
            const { data: yarnIssues } = await supabaseBrowserClient
              .from("yarn_issues")
              .select("yarn_item_id, quantity")
              .eq("base_fabric_order_id", roll.base_fabric_order_id);

            if (!yarnIssues || yarnIssues.length === 0) {
              return { ...roll, yarn_cost_per_m: null, valuation_zar: 0 };
            }

            // Get yarn receipt prices for weighted average
            const yarnItemIds = [...new Set(yarnIssues.map((issue: any) => issue.yarn_item_id))];
            const { data: yarnReceipts } = await supabaseBrowserClient
              .from("yarn_transactions")
              .select("yarn_item_id, quantity, unit_price_zar")
              .in("yarn_item_id", yarnItemIds)
              .in("transaction_type", ["RECEIPT", "RETURN"])
              .not("unit_price_zar", "is", null);

            // Calculate weighted average price per yarn item
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
              if (val.qty > 0) {
                avgUnitPriceByYarn.set(key, val.cost / val.qty);
              }
            });

            // Calculate total yarn cost for the order
            let totalYarnCost = 0;
            yarnIssues.forEach((issue: any) => {
              const avgPrice = avgUnitPriceByYarn.get(issue.yarn_item_id) || 0;
              totalYarnCost += Number(issue.quantity || 0) * avgPrice;
            });

            // Get total produced meters for the order
            const { data: orderRolls } = await supabaseBrowserClient
              .from("base_fabric_rolls")
              .select("length_m")
              .eq("base_fabric_order_id", roll.base_fabric_order_id);

            const totalMeters = (orderRolls || []).reduce(
              (sum: number, r: any) => sum + Number(r.length_m || 0),
              0
            );

            const yarnCostPerM = totalMeters > 0 ? totalYarnCost / totalMeters : null;
            const valuation = yarnCostPerM ? roll.length_m * yarnCostPerM : 0;

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
    const totalValuation = inStockRolls.reduce((sum, roll) => sum + (roll.valuation_zar || 0), 0);
    return { rollsCount, metersTotal, totalValuation };
  }, [inStockRolls]);

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
      let pageNumber = 1;

      // ===== COVER PAGE =====
      let logoLoaded = false;
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = "/Logo.png";
        
        await Promise.race([
          new Promise<void>((resolve) => {
            logoImg.onload = () => {
              try {
                const logoWidth = 60;
                const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
                const logoX = (pageWidth - logoWidth) / 2;
                doc.addImage(logoImg, "PNG", logoX, 30, logoWidth, logoHeight);
                logoLoaded = true;
                resolve();
              } catch (err) {
                resolve();
              }
            };
            logoImg.onerror = () => resolve();
          }),
          new Promise<void>((resolve) => setTimeout(() => resolve(), 1500)),
        ]);
      } catch (err) {
        console.warn("Logo loading error:", err);
      }

      const titleY = logoLoaded ? 100 : 60;
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("UNICA TEXTILES", pageWidth / 2, titleY, { align: "center" });
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.text("Base Fabric Stock Report", pageWidth / 2, titleY + 15, { align: "center" });

      doc.setFontSize(12);
      const reportDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const metadataY = titleY + 35;
      doc.text(`Generated: ${reportDate}`, pageWidth / 2, metadataY, { align: "center" });
      
      doc.text(`Total Rolls: ${inStockTotals.rollsCount}`, pageWidth / 2, metadataY + 15, { align: "center" });
      doc.text(`Total Meters: ${inStockTotals.metersTotal.toFixed(3)} m`, pageWidth / 2, metadataY + 30, { align: "center" });
      doc.text(`Total Valuation: R ${inStockTotals.totalValuation.toFixed(2)}`, pageWidth / 2, metadataY + 45, { align: "center" });

      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      doc.text("Confidential - For Internal Use Only", pageWidth / 2, pageHeight - 20, { align: "center" });

      // ===== STOCK TABLE =====
      doc.addPage();
      pageNumber++;
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Stock Overview", margin, 20);

      const tableData = inStockRolls.map((roll) => [
        roll.roll_no || roll.qr_code || "N/A",
        roll.fabric_name || "-",
        roll.order_no || "-",
        roll.loom_no?.toString() || "-",
        roll.length_m.toFixed(3),
        roll.yarn_cost_per_m && roll.yarn_cost_per_m > 0 ? `R ${roll.yarn_cost_per_m.toFixed(4)}` : "-",
        roll.valuation_zar && roll.valuation_zar > 0 ? `R ${roll.valuation_zar.toFixed(2)}` : "-",
      ]);

      const availableWidth = pageWidth - 2 * margin;
      autoTable(doc, {
        head: [["Roll No", "Fabric Name", "Order No", "Loom", "Length (m)", "Cost/m (ZAR)", "Valuation (ZAR)"]],
        body: tableData,
        startY: 30,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        columnStyles: {
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
        },
        didDrawPage: function (data: any) {
          const currentPage = data.pageNumber || doc.internal.pages.length - 1;
          if (currentPage > 1) {
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Page ${currentPage}`, margin, pageHeight - 10);
            doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
          }
        },
      });

      // ===== VALUATION SUMMARY =====
      const rollsWithValuation = inStockRolls.filter((r) => r.valuation_zar && r.valuation_zar > 0);
      if (rollsWithValuation.length > 0) {
        doc.addPage();
        pageNumber++;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("Valuation Summary", margin, 20);

        const valuationData = rollsWithValuation
          .map((roll) => [
            roll.roll_no || roll.qr_code || "N/A",
            roll.fabric_name || "-",
            roll.length_m.toFixed(3),
            `R ${(roll.yarn_cost_per_m || 0).toFixed(4)}`,
            `R ${(roll.valuation_zar || 0).toFixed(2)}`,
          ])
          .sort((a, b) => {
            const valA = parseFloat(a[4].replace("R ", "").replace(",", ""));
            const valB = parseFloat(b[4].replace("R ", "").replace(",", ""));
            return valB - valA;
          });

        autoTable(doc, {
          head: [["Roll No", "Fabric Name", "Length (m)", "Cost/m (ZAR)", "Total Valuation (ZAR)"]],
          body: valuationData,
          startY: 30,
          margin: { left: margin, right: margin },
          styles: { fontSize: 8 },
          headStyles: {
            fillColor: [16, 185, 129],
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251],
          },
          columnStyles: {
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
          },
          didDrawPage: function (data: any) {
            const currentPage = data.pageNumber || doc.internal.pages.length - 1;
            if (currentPage > 1) {
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              doc.text(`Page ${currentPage}`, margin, pageHeight - 10);
              doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
            }
          },
        });

        const finalY = (doc as any).lastAutoTable.finalY || 30;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(
          `Grand Total Valuation: R ${inStockTotals.totalValuation.toFixed(2)}`,
          pageWidth - margin,
          finalY + 10,
          { align: "right" }
        );
      }

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
            View available rolls and access QR codes. History shows consumed/dispatched rolls.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={generatePDF} disabled={isGenerating || isLoading}>
            {isGenerating ? "Generating..." : "Print Report"}
          </Button>
          <Link
            href="/toolbox/stock"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Stock Control
          </Link>
        </div>
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
