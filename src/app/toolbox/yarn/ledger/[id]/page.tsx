"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";

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
  const [ledgerData, setLedgerData] = useState<LedgerData>({
    yarnItem: null,
    currentStock: 0,
    transactions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

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

  // Compute signed quantity for a transaction
  function getSignedQuantity(txn: YarnTransaction): number {
    if (txn.transaction_type === "RECEIPT" || txn.transaction_type === "RETURN") {
      return txn.quantity;
    } else if (txn.transaction_type === "ISSUE" || txn.transaction_type === "SCRAP") {
      return -txn.quantity;
    } else if (txn.transaction_type === "ADJUSTMENT") {
      return txn.quantity; // Can be positive or negative
    }
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
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Transaction Ledger</h1>
          <p className="mt-1 text-slate-600">
            Complete transaction history for {ledgerData.yarnItem.name}
          </p>
        </div>
        <Link
          href="/toolbox/yarn/stock"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Yarn Stock
        </Link>
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
              {ledgerData.yarnItem.name}
            </p>
          </div>
          {ledgerData.yarnItem.denier && (
            <div>
              <p className="text-sm font-semibold text-slate-600">Denier</p>
              <p className="mt-1 text-lg text-slate-900">
                {ledgerData.yarnItem.denier}D
              </p>
            </div>
          )}
          {ledgerData.yarnItem.material && (
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
              {ledgerData.currentStock.toFixed(3)} {ledgerData.yarnItem.uom}
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

      {/* Ledger Table */}
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
              ? "No transactions found for this yarn item."
              : `No ${typeFilter} transactions found.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Ref Document
                  </th>
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
                    <td className="px-4 py-3 text-slate-600">{txn.ref_document || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {txn.runningBalance.toFixed(3)} {ledgerData.yarnItem.uom}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {txn.notes ? (
                        <span className="text-xs" title={txn.notes}>
                          {txn.notes.length > 30
                            ? `${txn.notes.substring(0, 30)}...`
                            : txn.notes}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/toolbox/yarn/transaction/${txn.id}`}
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

