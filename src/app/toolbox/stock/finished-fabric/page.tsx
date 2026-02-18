"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { QRCode } from "@/components/qr/QRCode";
import { Button } from "@/components/ui/Button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const LOCATION_STORE = "FINISHED_STORE";
const STATUS_IN_STORE = "IN_STORE";
const STATUS_ISSUED = "ISSUED";
const LOCATION_DISPATCHED = "DISPATCHED";

interface FinishedFabricRoll {
  id: string;
  qr_code: string | null;
  roll_no: string | null;
  length_m: number;
  status: string;
  current_location: string;
  grade: string | null;
  batch_no: string | null;
  color: string | null;
  gsm: number | null;
  coating_type: string | null;
  created_at: string | null;
}

export default function FinishedFabricStockPage() {
  const [inStockRolls, setInStockRolls] = useState<FinishedFabricRoll[]>([]);
  const [historyRolls, setHistoryRolls] = useState<FinishedFabricRoll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inStock" | "history">("inStock");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoll, setSelectedRoll] = useState<FinishedFabricRoll | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch in-stock rolls (in store)
      // Note: qr_code column may not exist in all databases, so we try to select it but handle gracefully
      let inStockData, inStockError;
      const inStockResult = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          status,
          current_location,
          grade,
          color,
          gsm,
          coating_type,
          created_at,
          coating_batches (
            batch_no
          )
        `
        )
        .eq("status", STATUS_IN_STORE)
        .eq("current_location", LOCATION_STORE)
        .order("created_at", { ascending: false });
      
      inStockData = inStockResult.data;
      inStockError = inStockResult.error;

      // If qr_code column doesn't exist, retry without it
      if (inStockError && (inStockError.message?.includes("qr_code") || inStockError.message?.includes("column"))) {
        const retryResult = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .select(
            `
            id,
            roll_no,
            length_m,
            status,
            current_location,
            grade,
            color,
            gsm,
            coating_type,
            created_at,
            coating_batches (
              batch_no
            )
          `
          )
          .eq("status", STATUS_IN_STORE)
          .eq("current_location", LOCATION_STORE)
          .order("created_at", { ascending: false });
        inStockData = retryResult.data;
        inStockError = retryResult.error;
      }

      if (inStockError) throw inStockError;

      // Fetch history rolls (issued/dispatched)
      let historyData, historyError;
      const historyResult = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          status,
          current_location,
          grade,
          color,
          gsm,
          coating_type,
          created_at,
          issued_store_at,
          coating_batches (
            batch_no
          )
        `
        )
        .eq("status", STATUS_ISSUED)
        .eq("current_location", LOCATION_DISPATCHED)
        .order("issued_store_at", { ascending: false })
        .limit(500); // Limit history to recent 500 rolls
      
      historyData = historyResult.data;
      historyError = historyResult.error;

      // If qr_code column doesn't exist, retry without it
      if (historyError && (historyError.message?.includes("qr_code") || historyError.message?.includes("column"))) {
        const retryResult = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .select(
            `
            id,
            roll_no,
            length_m,
            status,
            current_location,
            grade,
            color,
            gsm,
            coating_type,
            created_at,
            issued_store_at,
            coating_batches (
              batch_no
            )
          `
          )
          .eq("status", STATUS_ISSUED)
          .eq("current_location", LOCATION_DISPATCHED)
          .order("issued_store_at", { ascending: false })
          .limit(500);
        historyData = retryResult.data;
        historyError = retryResult.error;
      }

      if (historyError) throw historyError;

      const mapRolls = (data: any[]): FinishedFabricRoll[] =>
        (data || []).map((row: any) => {
          const batch = Array.isArray(row.coating_batches)
            ? row.coating_batches[0]
            : row.coating_batches;

          return {
            id: row.id,
            qr_code: row.qr_code || null, // May not exist in database
            roll_no: row.roll_no,
            length_m: Number(row.length_m || 0),
            status: row.status,
            current_location: row.current_location,
            grade: row.grade,
            batch_no: batch?.batch_no || null,
            color: row.color,
            gsm: row.gsm ? Number(row.gsm) : null,
            coating_type: row.coating_type,
            created_at: row.created_at || row.issued_store_at || null,
          };
        });

      setInStockRolls(mapRolls(inStockData || []));
      setHistoryRolls(mapRolls(historyData || []));
    } catch (err: any) {
      console.error("Error fetching finished fabric stock:", err);
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
        roll.batch_no?.toLowerCase().includes(query) ||
        roll.color?.toLowerCase().includes(query) ||
        roll.coating_type?.toLowerCase().includes(query)
    );
  }, [inStockRolls, searchQuery]);

  const filteredHistoryRolls = useMemo(() => {
    if (!searchQuery.trim()) return historyRolls;
    const query = searchQuery.toLowerCase();
    return historyRolls.filter(
      (roll) =>
        roll.roll_no?.toLowerCase().includes(query) ||
        roll.qr_code?.toLowerCase().includes(query) ||
        roll.batch_no?.toLowerCase().includes(query) ||
        roll.color?.toLowerCase().includes(query) ||
        roll.coating_type?.toLowerCase().includes(query)
    );
  }, [historyRolls, searchQuery]);

  const inStockTotals = useMemo(() => {
    const rollsCount = inStockRolls.length;
    const metersTotal = inStockRolls.reduce((sum, roll) => sum + roll.length_m, 0);
    return { rollsCount, metersTotal };
  }, [inStockRolls]);

  async function generatePDF() {
    if (inStockRolls.length === 0) {
      alert("No stock data to generate report");
      return;
    }

    setIsGenerating(true);
    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const tableWidth = pageWidth - 2 * margin;
      const templateName = "Finished Fabric Stock Report";
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
      doc.text("Finished Fabric Stock Report", pageWidth / 2, titleY + 15, { align: "center" });

      doc.setFontSize(12);
      const reportDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const metadataY = titleY + 35;
      doc.text(`Generated: ${reportDate}`, pageWidth / 2, metadataY, { align: "center" });
      
      doc.text(
        `Total Rolls: ${inStockTotals.rollsCount}`,
        pageWidth / 2,
        metadataY + 15,
        { align: "center" },
      );
      doc.text(
        `Total Meters: ${inStockTotals.metersTotal.toFixed(3)} m`,
        pageWidth / 2,
        metadataY + 30,
        { align: "center" },
      );

      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      doc.text("Confidential - For Internal Use Only", pageWidth / 2, pageHeight - 20, { align: "center" });

      // ===== PAGE 2: SUMMARY BY TYPE / GSM / COLOUR (table format) =====
      doc.addPage("a4", "landscape");
      pageNumber++;
      const ripstopRolls = inStockRolls.filter((r) =>
        (r.coating_type || "").toLowerCase().includes("ripstop"),
      );
      const pvcRolls = inStockRolls.filter((r) =>
        (r.coating_type || "").toLowerCase().includes("pvc"),
      );

      type SummaryRow = { rollsCount: number; metersTotal: number };
      // Build table body: for each GSM a total row, then indented rows per colour
      const buildGsmColourTableBody = (rolls: FinishedFabricRoll[]): (string | number)[][] => {
        if (rolls.length === 0) return [];
        const byGsm: Record<
          string,
          { total: SummaryRow; byColor: Record<string, SummaryRow> }
        > = {};
        rolls.forEach((roll) => {
          const gsmKey = roll.gsm != null ? String(roll.gsm) : "Unknown";
          if (!byGsm[gsmKey]) {
            byGsm[gsmKey] = { total: { rollsCount: 0, metersTotal: 0 }, byColor: {} };
          }
          byGsm[gsmKey].total.rollsCount += 1;
          byGsm[gsmKey].total.metersTotal += roll.length_m;
          const colorKey = (roll.color || "Unknown").trim() || "Unknown";
          if (!byGsm[gsmKey].byColor[colorKey]) {
            byGsm[gsmKey].byColor[colorKey] = { rollsCount: 0, metersTotal: 0 };
          }
          byGsm[gsmKey].byColor[colorKey].rollsCount += 1;
          byGsm[gsmKey].byColor[colorKey].metersTotal += roll.length_m;
        });
        const gsmOrder = Object.keys(byGsm).sort((a, b) => {
          if (a === "Unknown") return 1;
          if (b === "Unknown") return -1;
          return Number(a) - Number(b);
        });
        const body: (string | number)[][] = [];
        gsmOrder.forEach((gsmKey) => {
          const { total, byColor } = byGsm[gsmKey];
          const gsmLabel = gsmKey === "Unknown" ? "Unknown GSM" : `${gsmKey} GSM`;
          body.push([gsmLabel, total.rollsCount, total.metersTotal.toFixed(2)]);
          const colors = Object.entries(byColor).sort(([a], [b]) => a.localeCompare(b));
          colors.forEach(([color, stats]) => {
            body.push([`  ${color}`, stats.rollsCount, stats.metersTotal.toFixed(2)]);
          });
        });
        return body;
      };

      const drawSummaryTable = (
        title: string,
        rolls: FinishedFabricRoll[],
        startY: number,
      ): number => {
        if (rolls.length === 0) return startY;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(title, margin, startY);
        const body = buildGsmColourTableBody(rolls);
        if (body.length === 0) return startY + 6;
        autoTable(doc, {
          head: [["GSM / Colour", "Rolls", "Meters"]],
          body,
          startY: startY + 6,
          margin: { left: margin, right: margin },
          tableWidth,
          theme: "grid",
          styles: { fontSize: 9 },
          headStyles: {
            fillColor: [15, 118, 110],
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          columnStyles: {
            0: { cellWidth: tableWidth - 45 - 50, halign: "left" },
            1: { cellWidth: 45, halign: "right" },
            2: { cellWidth: 50, halign: "right" },
          },
          didParseCell: (data) => {
            if (data.section === "head" && (data.column.index === 1 || data.column.index === 2)) {
              data.cell.styles.halign = "right";
            }
            if (data.section === "body") {
              const firstCell = data.row.raw[0];
              const isTotalRow = typeof firstCell === "string" ? !firstCell.startsWith("  ") : true;
              if (isTotalRow) data.cell.styles.fontStyle = "bold";
            }
          },
        });
        return (doc as any).lastAutoTable.finalY + 8;
      };

      let summaryY = margin + 10;
      summaryY = drawSummaryTable("Ripstop summary (by GSM, then colour)", ripstopRolls, summaryY);
      summaryY = drawSummaryTable("PVC summary (by GSM, then colour)", pvcRolls, summaryY);

      // ===== PAGE 3: STOCK TABLE =====
      doc.addPage();
      pageNumber++;
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Stock Overview", margin, 20);

      const tableData = inStockRolls.map((roll) => [
        roll.roll_no || roll.qr_code || "N/A",
        roll.batch_no || "-",
        roll.color || "-",
        roll.gsm?.toString() || "-",
        roll.coating_type || "-",
        roll.grade || "-",
        roll.length_m.toFixed(3),
      ]);

      const availableWidth = pageWidth - 2 * margin;
      autoTable(doc, {
        head: [["Roll No", "Batch No", "Color", "GSM", "Coating Type", "Grade", "Length (m)"]],
        body: tableData,
        startY: 30,
        margin: { left: margin, right: margin },
        theme: "grid",
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
          6: { halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section === "head" && data.column.index === 6) {
            data.cell.styles.halign = "right";
          }
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

      doc.save(`finished-fabric-stock-report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF: " + (err.message || "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  }

  // Breakdown by attributes
  const inStockByGsm = useMemo(() => {
    const grouped: Record<string, { rollsCount: number; metersTotal: number }> = {};
    inStockRolls.forEach((roll) => {
      const key = roll.gsm?.toString() || "Unknown";
      if (!grouped[key]) {
        grouped[key] = { rollsCount: 0, metersTotal: 0 };
      }
      grouped[key].rollsCount += 1;
      grouped[key].metersTotal += roll.length_m;
    });
    return Object.entries(grouped)
      .map(([gsm, stats]) => ({ gsm, ...stats }))
      .sort((a, b) => {
        if (a.gsm === "Unknown") return 1;
        if (b.gsm === "Unknown") return -1;
        return Number(a.gsm) - Number(b.gsm);
      });
  }, [inStockRolls]);

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Finished Fabric Stock</h1>
            <p className="mt-1 text-slate-600">
              View available rolls and access QR codes. History shows dispatched rolls.
            </p>
          </div>
          <Link
            href="/toolbox/stock"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Stock Control
          </Link>
        </div>
        
        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/toolbox/finished-fabric/store">
            <Button variant="primary" className="text-sm">
              Store Management
            </Button>
          </Link>
          <Link href="/toolbox/finished-fabric/stocktake">
            <Button variant="primary" className="text-sm">
              Month-end Stocktake
            </Button>
          </Link>
          <Button 
            variant="secondary" 
            onClick={generatePDF} 
            disabled={isGenerating || isLoading}
            className="text-sm"
          >
            {isGenerating ? "Generating..." : "Print Report"}
          </Button>
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
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Summary</h3>
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

          {/* Breakdown by GSM */}
          {inStockByGsm.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Breakdown by GSM</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-1.5 pr-4 font-semibold text-slate-700">GSM</th>
                      <th className="py-1.5 pr-4 font-semibold text-slate-700 text-right">Rolls</th>
                      <th className="py-1.5 font-semibold text-slate-700 text-right">Meters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inStockByGsm.map((item) => (
                      <tr
                        key={item.gsm}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-1.5 pr-4 font-medium text-slate-700">{item.gsm} GSM</td>
                        <td className="py-1.5 pr-4 text-slate-600 text-right">
                          {item.rollsCount} roll{item.rollsCount !== 1 ? "s" : ""}
                        </td>
                        <td className="py-1.5 text-slate-600 text-right">
                          {item.metersTotal.toFixed(2)} m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
            Search by Roll No, QR Code, Batch, Colour, or Coating Type
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
                            Batch
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Grade
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Colour
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
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
                              {roll.batch_no || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{roll.grade || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{roll.color || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.gsm ? roll.gsm.toString() : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.coating_type || "—"}
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
                        : "No dispatched rolls found in history."}
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
                            Batch
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Grade
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Colour
                          </th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">
                            Length (m)
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Dispatched
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
                              {roll.batch_no || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{roll.grade || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{roll.color || "—"}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {roll.length_m.toFixed(3)}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {roll.created_at
                                ? new Date(roll.created_at).toLocaleDateString("en-ZA", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
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
                <p className="text-slate-600">Batch: {selectedRoll.batch_no || "—"}</p>
                <p className="text-slate-600">Grade: {selectedRoll.grade || "—"}</p>
                <p className="text-slate-600">Colour: {selectedRoll.color || "—"}</p>
                <p className="text-slate-600">
                  GSM: {selectedRoll.gsm ? selectedRoll.gsm.toString() : "—"}
                </p>
                <p className="text-slate-600">Type: {selectedRoll.coating_type || "—"}</p>
                <p className="text-slate-600">Length: {selectedRoll.length_m.toFixed(3)} m</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/toolbox/qr/print?rollIds=${selectedRoll.id}&type=finished_fabric`}
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
