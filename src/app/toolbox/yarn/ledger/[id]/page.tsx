"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { DateRangeFilter, isDateInRange } from "@/components/ui/DateRangeFilter";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface YarnItem {
  id: string;
  name: string;
  denier: number | null;
  material: string | null;
  uom: string;
}

interface YarnTransaction {
  id: string;
  txn_time: string;
  transaction_type: string;
  quantity: number;
  uom: string;
  source: string | null;
  destination: string | null;
  batch_no: string | null;
  ref_document: string | null;
  notes: string | null;
  slip_no: string | null;
  base_fabric_order_id?: string | null;
  base_fabric_orders?: {
    order_no: string | null;
    status?: string | null;
  } | null;
  isVirtualReturn?: boolean;
}

interface LedgerData {
  yarnItem: YarnItem | null;
  currentStock: number;
  transactions: YarnTransaction[];
}

interface BatchSummaryRow {
  batch_no: string;
  qty: number;
}

export default function YarnLedgerPage() {
  const params = useParams();
  const yarnItemId = params.id as string;
  const router = useRouter();
  const [ledgerData, setLedgerData] = useState<LedgerData>({
    yarnItem: null,
    currentStock: 0,
    transactions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (yarnItemId) {
      fetchLedgerData();
    }
  }, [yarnItemId]);

  async function fetchLedgerData() {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch yarn item
      const { data: yarnItemData, error: yarnItemError } = await supabaseBrowserClient
        .from("yarn_items")
        .select("id, name, denier, material, uom")
        .eq("id", yarnItemId)
        .single();

      if (yarnItemError) throw yarnItemError;

      // Fetch current stock
      const { data: stockData, error: stockError } = await supabaseBrowserClient
        .from("yarn_stock")
        .select("stock_qty")
        .eq("yarn_item_id", yarnItemId)
        .single();

      const currentStock = stockData?.stock_qty || 0;

      // Fetch transactions, beam consumption, and weft consumption simultaneously
      const [transactionsResult, beamsResult, weftResult] = await Promise.all([
        supabaseBrowserClient
          .from("yarn_transactions")
          .select(
            `
            id,
            txn_time,
            transaction_type,
            quantity,
            uom,
            source,
            destination,
            batch_no,
            ref_document,
            notes,
            slip_no,
            base_fabric_order_id,
            base_fabric_orders:base_fabric_order_id ( order_no, status )
          `
          )
          .eq("yarn_item_id", yarnItemId)
          .order("txn_time", { ascending: true }),
        supabaseBrowserClient
          .from("base_fabric_order_beams")
          .select("base_fabric_order_id, yarn_item_id, weight_ready_kg, weaving_beams:beam_id(tare_weight_kg)")
          .eq("yarn_item_id", yarnItemId),
        supabaseBrowserClient
          .from("base_fabric_order_weft")
          .select("base_fabric_order_id, yarn_item_id, kg_start, kg_end")
          .eq("yarn_item_id", yarnItemId)
          .not("kg_end", "is", null),
      ]);

      if (transactionsResult.error) throw transactionsResult.error;

      const normalisedTransactions = ((transactionsResult.data || []) as any[]).map((txn) => ({
        ...txn,
        base_fabric_orders: Array.isArray(txn.base_fabric_orders)
          ? txn.base_fabric_orders[0]
          : txn.base_fabric_orders,
      })) as YarnTransaction[];

      // Calculate total physical consumption grouped by BFO ID for this yarn item
      const consumptionByBfo = new Map<string, number>();
      
      (beamsResult.data || []).forEach((row: any) => {
        const tare = row.weaving_beams != null
          ? (Array.isArray(row.weaving_beams) ? row.weaving_beams[0]?.tare_weight_kg : row.weaving_beams?.tare_weight_kg)
          : 0;
        const kg = Number(row.weight_ready_kg || 0) - Number(tare || 0);
        if (kg > 0 && row.base_fabric_order_id) {
          consumptionByBfo.set(
            row.base_fabric_order_id,
            (consumptionByBfo.get(row.base_fabric_order_id) || 0) + kg
          );
        }
      });

      (weftResult.data || []).forEach((row: any) => {
        const kg = Number(row.kg_start || 0) - Number(row.kg_end || 0);
        if (kg > 0 && row.base_fabric_order_id) {
          consumptionByBfo.set(
            row.base_fabric_order_id,
            (consumptionByBfo.get(row.base_fabric_order_id) || 0) + kg
          );
        }
      });

      // Track total allocated/issued per finished BFO to calculate net unused variance safely
      const orderTotals = new Map<string, { totalAllocated: number; lastTxn: YarnTransaction; consumed: number }>();

      normalisedTransactions.forEach((txn) => {
        const bfoId = txn.base_fabric_order_id;
        const bfoStatus = txn.base_fabric_orders?.status;
        const isFinished = bfoStatus === "COMPLETED" || bfoStatus === "CLOSED" || bfoStatus === "CANCELLED";

        if (bfoId && isFinished && (txn.transaction_type === "DEPT_TO_ORDER" || txn.transaction_type === "ISSUE")) {
          const current = orderTotals.get(bfoId) || { totalAllocated: 0, lastTxn: txn, consumed: consumptionByBfo.get(bfoId) || 0 };
          current.totalAllocated += Number(txn.quantity || 0);
          current.lastTxn = txn;
          orderTotals.set(bfoId, current);
        }
      });

      // Build expanded transactions list including virtual returns for any finished BFO with unused yarn
      const expandedTransactions: YarnTransaction[] = [];
      const processedBfosWithReturn = new Set<string>();

      normalisedTransactions.forEach((txn) => {
        expandedTransactions.push(txn);

        const bfoId = txn.base_fabric_order_id;
        if (bfoId && !processedBfosWithReturn.has(bfoId)) {
          const orderData = orderTotals.get(bfoId);
          if (orderData) {
            processedBfosWithReturn.add(bfoId);
            const unusedQty = orderData.totalAllocated - orderData.consumed;

            if (unusedQty > 0.0009) {
              const returnDate = new Date(new Date(orderData.lastTxn.txn_time).getTime() + 1000).toISOString();
              expandedTransactions.push({
                id: `${bfoId}-virtual-return`,
                txn_time: returnDate,
                transaction_type: "RETURN",
                quantity: unusedQty,
                uom: txn.uom,
                source: "DEPARTMENT",
                destination: "DEPARTMENT/UNALLOCATED",
                batch_no: txn.batch_no,
                ref_document: txn.ref_document,
                notes: `Auto-returned unused portion from finished ${txn.base_fabric_orders?.order_no || "BFO"}`,
                slip_no: orderData.lastTxn.slip_no ? `${orderData.lastTxn.slip_no}-RET` : null,
                base_fabric_order_id: bfoId,
                base_fabric_orders: txn.base_fabric_orders,
                isVirtualReturn: true,
              });
            }
          }
        }
      });

      // Ensure strict chronological sorting
      expandedTransactions.sort((a, b) => new Date(a.txn_time).getTime() - new Date(b.txn_time).getTime());

      setLedgerData({
        yarnItem: yarnItemData as YarnItem,
        currentStock,
        transactions: expandedTransactions,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load ledger data.");
    } finally {
      setIsLoading(false);
    }
  }

  // Compute signed quantity for store balance
  function getSignedQuantity(txn: YarnTransaction): number {
    if (txn.isVirtualReturn) {
      return 0; // Does not affect main store stock balance
    }
    if (txn.transaction_type === "RECEIPT" || txn.transaction_type === "RETURN") {
      return txn.quantity;
    } else if (txn.transaction_type === "ISSUE" || txn.transaction_type === "SCRAP") {
      return -txn.quantity;
    } else if (txn.transaction_type === "ADJUSTMENT") {
      return txn.quantity; 
    }
    return 0;
  }

  // Compute running balances & department on-hand balances
  const transactionsWithBalance = useMemo(() => {
    if (!ledgerData.transactions) return [];

    let runningBalance = 0;
    let deptRunningBalance = 0;
    return ledgerData.transactions.map((txn) => {
      const signedQty = getSignedQuantity(txn);
      runningBalance += signedQty;

      if (txn.transaction_type === "ISSUE") {
        deptRunningBalance += txn.quantity;
      } else if (txn.transaction_type === "DEPT_TO_ORDER") {
        deptRunningBalance -= txn.quantity;
      } else if (txn.transaction_type === "RETURN" && txn.isVirtualReturn) {
        deptRunningBalance += txn.quantity;
      }

      return {
        ...txn,
        signedQuantity: signedQty,
        runningBalance,
        deptRunningBalance,
      };
    });
  }, [ledgerData.transactions]);

  // Filter transactions by date range
  const transactionsInDateRange = useMemo(() => {
    if (!dateFrom && !dateTo) return transactionsWithBalance;
    return transactionsWithBalance.filter((t) =>
      isDateInRange(t.txn_time, dateFrom, dateTo)
    );
  }, [transactionsWithBalance, dateFrom, dateTo]);

  // Filter transactions by type
  const filteredTransactions = useMemo(() => {
    if (typeFilter === "ALL") return transactionsInDateRange;
    return transactionsInDateRange.filter((txn) => txn.transaction_type === typeFilter);
  }, [transactionsInDateRange, typeFilter]);

  type LedgerRow =
    | {
        kind: "monthHeader";
        id: string;
        monthLabel: string;
        openingBalance: number;
      }
    | {
        kind: "transaction";
        id: string;
        txn: (typeof transactionsWithBalance)[number];
      }
    | {
        kind: "monthFooter";
        id: string;
        monthLabel: string;
        closingBalance: number;
        hadAdjustment: boolean;
      };

  const ledgerRows: LedgerRow[] = useMemo(() => {
    if (typeFilter !== "ALL") {
      return filteredTransactions.map((txn) => ({
        kind: "transaction" as const,
        id: txn.id,
        txn,
      }));
    }

    if (!transactionsInDateRange.length) return [];

    const rows: LedgerRow[] = [];
    let currentMonthKey: string | null = null;
    let prevRunningBalance = 0;
    let monthHadAdjustment = false;

    const formatMonth = (dateStr: string) =>
      new Date(dateStr).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
      });

    const pushFooter = (monthKey: string | null) => {
      if (!monthKey) return;
      const anyTxnInMonth = transactionsInDateRange.find((t) => {
        const d = new Date(t.txn_time);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === monthKey;
      });
      if (!anyTxnInMonth) return;

      const monthLabel = formatMonth(anyTxnInMonth.txn_time);
      rows.push({
        kind: "monthFooter",
        id: `${monthKey}-footer`,
        monthLabel,
        closingBalance: prevRunningBalance,
        hadAdjustment: monthHadAdjustment,
      });
    };

    transactionsInDateRange.forEach((txn, index) => {
      const d = new Date(txn.txn_time);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      if (monthKey !== currentMonthKey) {
        if (currentMonthKey !== null) {
          pushFooter(currentMonthKey);
        }

        const monthLabel = formatMonth(txn.txn_time);
        rows.push({
          kind: "monthHeader",
          id: `${monthKey}-header`,
          monthLabel,
          openingBalance: prevRunningBalance,
        });

        currentMonthKey = monthKey;
        monthHadAdjustment = false;
      }

      if (txn.transaction_type === "ADJUSTMENT") {
        monthHadAdjustment = true;
      }

      rows.push({
        kind: "transaction",
        id: txn.id,
        txn,
      });

      prevRunningBalance = txn.runningBalance;

      const isLast = index === transactionsWithBalance.length - 1;
      if (isLast) {
        pushFooter(currentMonthKey);
      }
    });

    return rows;
  }, [transactionsInDateRange, filteredTransactions, typeFilter]);

  const batchSummaryRows = useMemo<BatchSummaryRow[]>(() => {
    const map = new Map<string, number>();
    transactionsWithBalance.forEach((txn) => {
      const batch = (txn.batch_no || "").trim();
      if (!batch) return;
      const current = map.get(batch) || 0;
      map.set(batch, current + txn.signedQuantity);
    });
    return Array.from(map.entries())
      .map(([batch_no, qty]) => ({ batch_no, qty }))
      .filter((row) => Math.abs(row.qty) > 0.000001)
      .sort((a, b) => a.batch_no.localeCompare(b.batch_no));
  }, [transactionsWithBalance]);

  async function generatePdf() {
    if (!ledgerData.yarnItem) return;
    setIsGeneratingPdf(true);
    try {
      // Overhauled to LANDSCAPE layout for a clean, non-cramped table printout
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 12;
      const marginRight = 12;
      const marginTop = 12;
      const marginBottom = 15;

      const title = "Yarn Transaction Ledger";

      // Header Branding
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(15, 118, 110);
      doc.text(title, marginLeft, marginTop + 4);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      const generatedAt = new Date().toLocaleString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      doc.text(`Generated: ${generatedAt}`, pageWidth - marginRight, marginTop + 4, { align: "right" });

      // Item Meta Box
      let infoY = marginTop + 10;
      doc.setDrawColor(220, 225, 230);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginLeft, infoY, pageWidth - marginLeft - marginRight, 14, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(`Item: ${ledgerData.yarnItem.name}`, marginLeft + 4, infoY + 9);

      let metaX = marginLeft + 90;
      if (ledgerData.yarnItem.denier) {
        doc.setFont("helvetica", "normal");
        doc.text(`Denier: ${ledgerData.yarnItem.denier}D`, metaX, infoY + 9);
        metaX += 45;
      }
      if (ledgerData.yarnItem.material) {
        doc.setFont("helvetica", "normal");
        doc.text(`Material: ${ledgerData.yarnItem.material}`, metaX, infoY + 9);
        metaX += 50;
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 118, 110);
      doc.text(
        `Current Stock: ${ledgerData.currentStock.toFixed(3)} ${ledgerData.yarnItem.uom}`,
        pageWidth - marginRight - 6,
        infoY + 9,
        { align: "right" }
      );

      if (dateFrom || dateTo) {
        infoY += 4;
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Filter Date Range: ${dateFrom || "…"} to ${dateTo || "…"}`, marginLeft + 4, infoY + 14);
      }

      // Map Transactions to PDF table body rows
      const body = transactionsInDateRange.map((txn) => {
        const displayQty =
          txn.transaction_type === "DEPT_TO_ORDER"
            ? -txn.quantity
            : txn.isVirtualReturn
              ? txn.quantity
              : txn.signedQuantity;
        const isPositive = displayQty >= 0;

        const dateStr = new Date(txn.txn_time).toLocaleString("en-ZA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const typeStr = txn.isVirtualReturn ? "AUTO-RETURN" : txn.transaction_type;
        const qtyStr = `${isPositive ? "+" : ""}${displayQty.toFixed(3)} ${txn.uom}`;
        const bfoOrderText = txn.base_fabric_orders?.order_no 
          ? `${txn.base_fabric_orders.order_no} (${txn.base_fabric_orders.status || "CLOSED"})`
          : "-";

        return [
          dateStr,
          typeStr,
          qtyStr,
          txn.source || "-",
          txn.destination || "-",
          txn.batch_no || "-",
          bfoOrderText,
          `${(txn as any).deptRunningBalance.toFixed(3)} ${ledgerData.yarnItem?.uom || "kg"}`,
          `${txn.runningBalance.toFixed(3)} ${ledgerData.yarnItem?.uom || "kg"}`,
        ];
      });

      autoTable(doc, {
        head: [
          [
            "Date / Time",
            "Type",
            "Quantity",
            "Source",
            "Destination",
            "Batch No",
            "BFO Order",
            "Dept on Hand",
            "Store Balance",
          ],
        ],
        body,
        startY: infoY + 18,
        margin: {
          left: marginLeft,
          right: marginRight,
          top: marginTop,
          bottom: marginBottom,
        },
        styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "left",
        },
        columnStyles: {
          2: { halign: "right", fontStyle: "bold" },
          7: { halign: "right" },
          8: { halign: "right", fontStyle: "bold" },
        },
        didDrawPage: (data: any) => {
          const pageNumber = data.pageNumber;
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(`Page ${pageNumber}`, marginLeft, pageHeight - 8);
          doc.text(
            `Unica Textiles System — Yarn Ledger Report (${ledgerData.yarnItem?.name})`,
            pageWidth - marginRight,
            pageHeight - 8,
            { align: "right" }
          );
        },
      });

      doc.save(
        `yarn-ledger-${ledgerData.yarnItem.name.replace(/\s+/g, "-").toLowerCase()}-${new Date()
          .toISOString()
          .split("T")[0]}.pdf`,
      );
    } catch (err) {
      console.error("Failed to generate yarn ledger PDF", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading ledger...</p>
      </div>
    );
  }

  if (error || !ledgerData.yarnItem) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error || "Yarn item not found."}</p>
          <Link href="/toolbox/yarn/stock">
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800">
              Back to Yarn Stock
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Transaction Ledger</h1>
          <p className="mt-1 text-slate-600">
            Complete transaction history for {ledgerData.yarnItem?.name ?? "Unknown Item"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={generatePdf}
            disabled={isGeneratingPdf || isLoading}
          >
            {isGeneratingPdf ? "Generating PDF..." : "Print Ledger (PDF)"}
          </Button>
          <Link
            href="/toolbox/yarn/stock"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Yarn Stock
          </Link>
        </div>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-semibold text-slate-600">Yarn Name</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {ledgerData.yarnItem?.name ?? "—"}
            </p>
          </div>
          {ledgerData.yarnItem?.denier && (
            <div>
              <p className="text-sm font-semibold text-slate-600">Denier</p>
              <p className="mt-1 text-lg text-slate-900">
                {ledgerData.yarnItem.denier}D
              </p>
            </div>
          )}
          {ledgerData.yarnItem?.material && (
            <div>
              <p className="text-sm font-semibold text-slate-600">Material</p>
              <p className="mt-1 text-lg text-slate-900">
                {ledgerData.yarnItem.material}
              </p>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-600">Current Stock</p>
            <p className="mt-1 text-lg font-semibold text-teal-700">
              {ledgerData.currentStock.toFixed(3)} {ledgerData.yarnItem?.uom ?? "—"}
            </p>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end lg:gap-6">
            <div className="min-w-[180px]">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Filter by Transaction Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent transition"
              >
                <option value="ALL">All Types</option>
                <option value="RECEIPT">Receipt</option>
                <option value="ISSUE">Issue</option>
                <option value="DEPT_TO_ORDER">Allocated from dept</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="RETURN">Return</option>
                <option value="SCRAP">Scrap</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onFromChange={setDateFrom}
              onToChange={setDateTo}
              label="Date range (list & PDF)"
              showAllHint={true}
              className="min-w-0 flex-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              disabled={!dateFrom && !dateTo}
            >
              Clear dates
            </Button>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Lot / Batch Summary</h2>
        {batchSummaryRows.length === 0 ? (
          <p className="text-sm text-slate-600">No batch-tagged balances available.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-900">Batch No</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-900">
                  On Hand ({ledgerData.yarnItem?.uom || "kg"})
                </th>
              </tr>
            </thead>
            <tbody>
              {batchSummaryRows.map((row) => (
                <tr key={row.batch_no} className="border-b border-slate-100">
                  <td className="px-3 py-2.5 text-slate-900 font-medium">{row.batch_no}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{row.qty.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Transaction History</h2>
        {(dateFrom || dateTo) && (
          <p className="text-sm text-slate-600 mb-3">
            Showing transactions from {dateFrom || "…"} to {dateTo || "…"}
            {transactionsInDateRange.length > 0 && (
              <span className="ml-2">({transactionsInDateRange.length} transaction{transactionsInDateRange.length !== 1 ? "s" : ""})</span>
            )}
          </p>
        )}

        {filteredTransactions.length === 0 ? (
          <p className="text-sm text-slate-600">
            {dateFrom || dateTo
              ? "No transactions in the selected date range."
              : typeFilter === "ALL"
                ? "No transactions found for this yarn item."
                : `No ${typeFilter} transactions found.`}
          </p>
        ) : (
          <div className="w-full">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Date/Time</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Type</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Quantity</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Source</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Destination</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Batch No</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">BFO Order</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Dept on hand</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => {
                  if (row.kind === "monthHeader") {
                    return (
                      <tr key={row.id} className="bg-slate-50">
                        <td
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
                          colSpan={9}
                        >
                          Opening balance for {row.monthLabel}:{" "}
                          <span className="font-bold text-slate-900">
                            {row.openingBalance.toFixed(3)} {ledgerData.yarnItem?.uom ?? "kg"}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  if (row.kind === "monthFooter") {
                    return (
                      <tr key={row.id} className="bg-slate-50 border-t border-slate-200">
                        <td
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 text-right"
                          colSpan={9}
                        >
                          Closing balance for {row.monthLabel}:{" "}
                          <span className="font-bold text-slate-900">
                            {row.closingBalance.toFixed(3)} {ledgerData.yarnItem?.uom ?? "kg"}
                          </span>
                          {row.hadAdjustment && (
                            <span className="ml-2 text-[11px] font-normal text-amber-700">
                              (includes adjustments)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  const txn = row.txn as typeof transactionsWithBalance[number];
                  const displayQuantity =
                    txn.transaction_type === "DEPT_TO_ORDER"
                      ? -txn.quantity
                      : txn.isVirtualReturn
                        ? txn.quantity
                        : txn.signedQuantity;
                  const isPositive = displayQuantity >= 0;
                  const isFinishedBfo = 
                    (txn.transaction_type === "DEPT_TO_ORDER" || txn.transaction_type === "ISSUE") &&
                    (txn.base_fabric_orders?.status === "COMPLETED" || 
                     txn.base_fabric_orders?.status === "CLOSED" || 
                     txn.base_fabric_orders?.status === "CANCELLED");

                  return (
                    <tr
                      key={row.id}
                      onClick={() => !txn.isVirtualReturn && router.push(`/toolbox/yarn/transaction/${txn.id}`)}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${txn.isVirtualReturn ? "bg-emerald-50/40" : "cursor-pointer"}`}
                    >
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                        {new Date(txn.txn_time).toLocaleString("en-ZA", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            txn.transaction_type === "RECEIPT" || txn.transaction_type === "RETURN"
                              ? "bg-green-100 text-green-800"
                              : txn.transaction_type === "ISSUE" || txn.transaction_type === "SCRAP"
                                ? "bg-red-100 text-red-800"
                                : txn.transaction_type === "DEPT_TO_ORDER"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {txn.isVirtualReturn ? "AUTO-RETURN" : txn.transaction_type}
                        </span>
                        {txn.slip_no && (
                          <span className="ml-1 text-[11px] text-slate-500">({txn.slip_no})</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-medium whitespace-nowrap ${
                          isPositive ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {isPositive ? "+" : "-"}
                        {Math.abs(displayQuantity).toFixed(3)} {txn.uom}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 truncate max-w-[100px]">{txn.source || "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate max-w-[100px]">{txn.destination || "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">{txn.batch_no || "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                        {txn.base_fabric_orders?.order_no || "-"}
                        {isFinishedBfo && !txn.isVirtualReturn && (
                          <span className="ml-1 text-[9px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded font-medium">
                            Closed
                          </span>
                        )}
                        {txn.isVirtualReturn && (
                          <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-medium">
                            Refund
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-900 whitespace-nowrap text-xs">
                        {(txn as any).deptRunningBalance !== undefined
                          ? (txn as any).deptRunningBalance.toFixed(3)
                          : "0.000"}{" "}
                        {ledgerData.yarnItem?.uom ?? txn.uom}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap text-xs">
                        {txn.runningBalance.toFixed(3)} {ledgerData.yarnItem?.uom ?? txn.uom}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}