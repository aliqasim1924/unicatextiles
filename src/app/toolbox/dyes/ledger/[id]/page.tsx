"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";

interface DyeItem {
  id: string;
  name: string;
  type: string | null;
  code: string | null;
  uom: string;
}

interface DyeTransaction {
  id: string;
  txn_time: string;
  transaction_type: string;
  quantity: number;
  uom: string;
  source: string | null;
  destination: string | null;
  batch_no: string | null;
  notes: string | null;
  slip_no: string | null;
}

interface LedgerData {
  dyeItem: DyeItem | null;
  currentStock: number;
  transactions: DyeTransaction[];
}

export default function DyesLedgerPage() {
  const params = useParams();
  const dyeItemId = params.id as string;
  const [ledgerData, setLedgerData] = useState<LedgerData>({
    dyeItem: null,
    currentStock: 0,
    transactions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  useEffect(() => {
    if (dyeItemId) {
      fetchLedgerData();
    }
  }, [dyeItemId]);

  async function fetchLedgerData() {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch dye item
      const { data: dyeItemData, error: dyeItemError } = await supabaseBrowserClient
        .from("dye_items")
        .select("id, name, type, code, uom")
        .eq("id", dyeItemId)
        .single();

      if (dyeItemError) throw dyeItemError;

      // Fetch current stock
      const { data: stockData, error: stockError } = await supabaseBrowserClient
        .from("dye_stock")
        .select("stock_qty")
        .eq("dye_item_id", dyeItemId)
        .single();

      const currentStock = stockData?.stock_qty || 0;

      // Fetch transactions
      const { data: transactionsData, error: transactionsError } = await supabaseBrowserClient
        .from("dye_transactions")
        .select(
          "id, txn_time, transaction_type, quantity, uom, source, destination, batch_no, notes, slip_no"
        )
        .eq("dye_item_id", dyeItemId)
        .order("txn_time", { ascending: true });

      if (transactionsError) throw transactionsError;

      setLedgerData({
        dyeItem: dyeItemData as DyeItem,
        currentStock,
        transactions: (transactionsData as DyeTransaction[]) || [],
      });
    } catch (err: any) {
      setError(err.message || "Failed to load ledger data.");
    } finally {
      setIsLoading(false);
    }
  }

  function getSignedQuantity(txn: DyeTransaction): number {
    if (txn.transaction_type === "RECEIPT" || txn.transaction_type === "RETURN") {
      return txn.quantity;
    } else if (txn.transaction_type === "ISSUE" || txn.transaction_type === "SCRAP") {
      return -txn.quantity;
    } else if (txn.transaction_type === "ADJUSTMENT") {
      return txn.quantity;
    }
    return 0;
  }

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

  const filteredTransactions = useMemo(() => {
    if (typeFilter === "ALL") return transactionsWithBalance;
    return transactionsWithBalance.filter((txn) => txn.transaction_type === typeFilter);
  }, [transactionsWithBalance, typeFilter]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading ledger...</p>
      </div>
    );
  }

  if (error || !ledgerData.dyeItem) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error || "Dye item not found."}</p>
          <Link href="/toolbox/dyes/stock">
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800">
              Back to Dyes Stock
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dyes &amp; Chemicals Ledger</h1>
          <p className="mt-1 text-slate-600">
            Complete transaction history for {ledgerData.dyeItem.name}
          </p>
        </div>
        <Link
          href="/toolbox/dyes/stock"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Dyes Stock
        </Link>
      </div>

      {/* Item info */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-semibold text-slate-600">Name</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{ledgerData.dyeItem.name}</p>
          </div>
          {ledgerData.dyeItem.type && (
            <div>
              <p className="text-sm font-semibold text-slate-600">Type</p>
              <p className="mt-1 text-lg text-slate-900">{ledgerData.dyeItem.type}</p>
            </div>
          )}
          {ledgerData.dyeItem.code && (
            <div>
              <p className="text-sm font-semibold text-slate-600">Code</p>
              <p className="mt-1 text-lg text-slate-900">{ledgerData.dyeItem.code}</p>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-600">Current Stock</p>
            <p className="mt-1 text-lg font-semibold text-teal-700">
              {ledgerData.currentStock.toFixed(3)} {ledgerData.dyeItem.uom}
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
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="RETURN">Return</option>
          <option value="SCRAP">Scrap</option>
          <option value="TRANSFER">Transfer</option>
        </select>
      </motion.section>

      {/* Ledger table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Transaction History</h2>

        {filteredTransactions.length === 0 ? (
          <p className="text-sm text-slate-600">
            {typeFilter === "ALL"
              ? "No transactions found for this item."
              : `No ${typeFilter} transactions found.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date/Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Quantity</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Source</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Destination</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Batch</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Slip No</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Balance</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Notes</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((txn) => (
                  <tr
                    key={txn.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
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
                        txn.signedQuantity >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {txn.signedQuantity >= 0 ? "+" : ""}
                      {txn.signedQuantity.toFixed(3)} {txn.uom}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{txn.source || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{txn.destination || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{txn.batch_no || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{txn.slip_no || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {txn.runningBalance.toFixed(3)} {ledgerData.dyeItem.uom}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {txn.notes ? (
                        <span className="text-xs" title={txn.notes}>
                          {txn.notes.length > 30 ? `${txn.notes.substring(0, 30)}...` : txn.notes}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/toolbox/dyes/transaction/${txn.id}`}
                        className="inline-block rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800"
                      >
                        View
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

