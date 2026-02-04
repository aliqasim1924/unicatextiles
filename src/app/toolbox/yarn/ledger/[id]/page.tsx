"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
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
}

interface LedgerData {
  yarnItem: YarnItem | null;
  currentStock: number;
  transactions: YarnTransaction[];
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

      // Fetch all transactions
      const { data: transactionsData, error: transactionsError } =
        await supabaseBrowserClient
          .from("yarn_transactions")
          .select(
            "id, txn_time, transaction_type, quantity, uom, source, destination, batch_no, ref_document, notes, slip_no"
          )
          .eq("yarn_item_id", yarnItemId)
          .order("txn_time", { ascending: true });

      if (transactionsError) throw transactionsError;

      setLedgerData({
        yarnItem: yarnItemData as YarnItem,
        currentStock,
        transactions: (transactionsData as YarnTransaction[]) || [],
      });
    } catch (err: any) {
      setError(err.message || "Failed to load ledger data.");
    } finally {
      setIsLoading(false);
    }
  }

  // Compute signed quantity for a transaction (store balance; DEPT_TO_ORDER is internal allocation only)
  function getSignedQuantity(txn: YarnTransaction): number {
    if (txn.transaction_type === "RECEIPT" || txn.transaction_type === "RETURN") {
      return txn.quantity;
    } else if (txn.transaction_type === "ISSUE" || txn.transaction_type === "SCRAP") {
      return -txn.quantity;
    } else if (txn.transaction_type === "ADJUSTMENT") {
      return txn.quantity; // Can be positive or negative
    }
    // DEPT_TO_ORDER does not change store stock
    return 0;
  }

  // Compute running balance
  const transactionsWithBalance = useMemo(() => {
    if (!ledgerData.transactions) return [];

    let runningBalance = 0;
    return ledgerData.transactions.map((txn) => {
      const signedQty = getSignedQuantity(txn);
      runningBalance += signedQty;
      return {
        ...txn,
        signedQuantity: signedQty,
        runningBalance,
      };
    });
  }, [ledgerData.transactions]);

  // Filter transactions by type
  const filteredTransactions = useMemo(() => {
    if (typeFilter === "ALL") return transactionsWithBalance;
    return transactionsWithBalance.filter((txn) => txn.transaction_type === typeFilter);
  }, [transactionsWithBalance, typeFilter]);

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
    // When filtering by type, just show the filtered transactions without month summaries
    if (typeFilter !== "ALL") {
      return filteredTransactions.map((txn) => ({
        kind: "transaction" as const,
        id: txn.id,
        txn,
      }));
    }

    if (!transactionsWithBalance.length) return [];

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
      const anyTxnInMonth = transactionsWithBalance.find((t) => {
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

    transactionsWithBalance.forEach((txn, index) => {
      const d = new Date(txn.txn_time);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      if (monthKey !== currentMonthKey) {
        // Close previous month
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
  }, [transactionsWithBalance, filteredTransactions, typeFilter]);

  async function generatePdf() {
    if (!ledgerData.yarnItem) return;
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const marginLeft = 15;
      const marginRight = 15;
      const marginTop = 15;
      const marginBottom = 20;

      const title = "Yarn Transaction Ledger";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(title, pageWidth / 2, marginTop, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      const item = ledgerData.yarnItem;
      let infoY = marginTop + 8;

      doc.text(`Item: ${item.name}`, marginLeft, infoY);
      infoY += 5;
      if (item.denier) {
        doc.text(`Denier: ${item.denier}D`, marginLeft, infoY);
        infoY += 5;
      }
      if (item.material) {
        doc.text(`Material: ${item.material}`, marginLeft, infoY);
        infoY += 5;
      }
      doc.text(
        `Current Stock: ${ledgerData.currentStock.toFixed(3)} ${item.uom}`,
        marginLeft,
        infoY,
      );
      infoY += 6;

      const generatedAt = new Date().toLocaleString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      doc.setFontSize(9);
      doc.text(`Generated: ${generatedAt}`, marginLeft, infoY);

      const body = transactionsWithBalance.map((txn) => [
        new Date(txn.txn_time).toLocaleString("en-ZA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        txn.transaction_type,
        `${txn.signedQuantity >= 0 ? "+" : ""}${txn.signedQuantity.toFixed(3)} ${txn.uom}`,
        txn.source || "-",
        txn.destination || "-",
        txn.batch_no || "-",
        txn.slip_no || "-",
        `${txn.runningBalance.toFixed(3)} ${item.uom}`,
      ]);

      autoTable(doc, {
        head: [
          [
            "Date/Time",
            "Type",
            "Quantity",
            "Source",
            "Destination",
            "Batch",
            "Slip No",
            "Balance",
          ],
        ],
        body,
        startY: infoY + 4,
        margin: {
          left: marginLeft,
          right: marginRight,
          top: marginTop,
          bottom: marginBottom,
        },
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        columnStyles: {
          2: { halign: "right" },
          7: { halign: "right" },
        },
        didDrawPage: (data: any) => {
          const pageNumber = data.pageNumber;
          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(`Page ${pageNumber}`, marginLeft, pageHeight - 6);
          doc.text(title, pageWidth - marginRight, pageHeight - 6, { align: "right" });
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
      {/* Header */}
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

      {/* Yarn Item Info Card */}
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

      {/* Filters */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Filter by Transaction Type
        </label>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent transition sm:w-auto"
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
      </motion.section>

      {/* Ledger Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Transaction History</h2>

        {filteredTransactions.length === 0 ? (
          <p className="text-sm text-slate-600">
            {typeFilter === "ALL"
              ? "No transactions found for this yarn item."
              : `No ${typeFilter} transactions found.`}
          </p>
        ) : (
          <div className="min-w-full">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Date/Time
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Source</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Destination
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Batch No
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => {
                  if (row.kind === "monthHeader") {
                    return (
                      <tr key={row.id} className="bg-slate-50">
                        <td
                          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
                          colSpan={7}
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
                          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 text-right"
                          colSpan={7}
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

                  const txn = row.txn;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/toolbox/yarn/transaction/${txn.id}`)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(txn.txn_time).toLocaleString("en-ZA", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            txn.transaction_type === "RECEIPT" || txn.transaction_type === "RETURN"
                              ? "bg-green-100 text-green-800"
                              : txn.transaction_type === "ISSUE" || txn.transaction_type === "SCRAP"
                                ? "bg-red-100 text-red-800"
                                : txn.transaction_type === "DEPT_TO_ORDER"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {txn.transaction_type}
                        </span>
                        {txn.slip_no && (
                          <span className="ml-2 text-xs text-slate-500">({txn.slip_no})</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          txn.signedQuantity >= 0
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {txn.signedQuantity >= 0 ? "+" : ""}
                        {txn.signedQuantity.toFixed(3)} {txn.uom}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{txn.source || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{txn.destination || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{txn.batch_no || "-"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
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

