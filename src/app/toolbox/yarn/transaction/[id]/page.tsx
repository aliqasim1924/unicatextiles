"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface TransactionDetail {
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
  unit_price_usd: number | null;
  unit_price_zar: number | null;
  exchange_rate: number | null;
  yarn_item_id: string;
  base_fabric_order_id: string | null;
  yarn_items: {
    name: string;
    denier: number | null;
    material: string | null;
    uom: string;
  };
  suppliers: {
    name: string;
  } | null;
  base_fabric_orders: {
    id: string;
    order_no?: string;
    status?: string;
  } | null;
}

export default function YarnTransactionDetailPage() {
  const params = useParams();
  const transactionId = params.id as string;
  const [transaction, setTransaction] = useState<TransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transactionId) {
      fetchTransactionDetail();
    }
  }, [transactionId]);

  async function fetchTransactionDetail() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseBrowserClient
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
          unit_price_usd,
          unit_price_zar,
          exchange_rate,
          yarn_item_id,
          base_fabric_order_id,
          yarn_items:yarn_item_id (
            name,
            denier,
            material,
            uom
          ),
          suppliers:supplier_id (
            name
          ),
          base_fabric_orders:base_fabric_order_id (
            id,
            order_no,
            status
          )
        `
        )
        .eq("id", transactionId)
        .single();

      if (fetchError) throw fetchError;

      const processed = {
        ...data,
        yarn_items: Array.isArray(data.yarn_items) ? data.yarn_items[0] : data.yarn_items,
        suppliers: Array.isArray(data.suppliers) ? data.suppliers[0] : data.suppliers,
        base_fabric_orders: Array.isArray(data.base_fabric_orders) ? data.base_fabric_orders[0] : data.base_fabric_orders,
      } as TransactionDetail;

      setTransaction(processed);
    } catch (err: any) {
      setError(err.message || "Failed to load transaction detail.");
    } finally {
      setIsLoading(false);
    }
  }

  function getTypeBadgeColor(type: string): string {
    if (type === "RECEIPT" || type === "RETURN") {
      return "bg-green-100 text-green-800 border-green-200";
    } else if (type === "ISSUE" || type === "SCRAP") {
      return "bg-red-100 text-red-800 border-red-200";
    } else if (type === "DEPT_TO_ORDER") {
      return "bg-amber-100 text-amber-800 border-amber-200";
    }
    return "bg-blue-100 text-blue-800 border-blue-200";
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600 font-medium">Loading transaction detail...</p>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <p className="mb-4 text-red-600 font-medium">{error || "Transaction not found."}</p>
          <Link href="/toolbox/yarn/stock">
            <Button variant="primary">Back to Yarn Stock</Button>
          </Link>
        </div>
      </div>
    );
  }

  const ledgerLink = transaction.yarn_item_id
    ? `/toolbox/yarn/ledger/${transaction.yarn_item_id}`
    : "/toolbox/yarn/stock";

  const orderIdentifier = transaction.base_fabric_orders?.order_no || 
    transaction.base_fabric_order_id;

  // Clean up notes dynamically if they contain the raw UUID
  let displayNotes = transaction.notes;
  if (displayNotes && transaction.base_fabric_orders?.order_no) {
    // Replace any occurrence of the raw ID with the clean order number
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    displayNotes = displayNotes.replace(uuidRegex, transaction.base_fabric_orders.order_no);
  }

  return (
    <div className="grid gap-8 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Transaction Detail</h1>
          <p className="mt-1 text-slate-600">Complete audit log and movement details</p>
        </div>
        <Link
          href={ledgerLink}
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition flex items-center gap-1"
        >
          ← Back to Ledger
        </Link>
      </div>

      {/* Transaction Summary Card */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-600">Type:</span>
          <span
            className={`inline-block rounded-full border px-3.5 py-1 text-xs font-bold uppercase tracking-wider ${getTypeBadgeColor(
              transaction.transaction_type
            )}`}
          >
            {transaction.transaction_type}
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          {transaction.slip_no && (
            <div>
              <span className="font-semibold text-slate-700">Slip No:</span> {transaction.slip_no}
            </div>
          )}
          <div>
            <span className="font-semibold text-slate-700">Transaction ID:</span>{" "}
            <span className="font-mono text-xs text-slate-500">{transaction.id}</span>
          </div>
        </div>
      </motion.section>

      {/* Main Details Grid */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-6 text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3">
          Core Information
        </h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Date & Time</p>
            <p className="mt-1 text-base font-medium text-slate-900">
              {new Date(transaction.txn_time).toLocaleString("en-ZA", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Yarn Item</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {transaction.yarn_items?.name || "N/A"}
            </p>
            {transaction.yarn_items?.denier && (
              <p className="text-xs text-slate-500 mt-0.5">
                {transaction.yarn_items.denier}D
                {transaction.yarn_items.material && ` • ${transaction.yarn_items.material}`}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Quantity</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {transaction.quantity.toFixed(3)}{" "}
              <span className="text-sm font-normal text-slate-600">{transaction.uom}</span>
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Source</p>
            <p className="mt-1 text-base font-medium text-slate-900">{transaction.source || "—"}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Destination</p>
            <p className="mt-1 text-base font-medium text-slate-900">{transaction.destination || "—"}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Batch Number</p>
            <p className="mt-1 text-base font-medium text-slate-900">{transaction.batch_no || "—"}</p>
          </div>

          {transaction.suppliers && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Supplier</p>
              <p className="mt-1 text-base font-medium text-slate-900">{transaction.suppliers.name}</p>
            </div>
          )}

          {transaction.ref_document && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reference Document</p>
              <p className="mt-1 text-base font-medium text-slate-900">{transaction.ref_document}</p>
            </div>
          )}

          {/* Linked Order Section for DEPT_TO_ORDER */}
          {transaction.base_fabric_order_id && (
            <div className="sm:col-span-2 lg:col-span-3 rounded-lg bg-amber-50 border border-amber-200 p-4 mt-2">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1">Linked Production Order (BFO)</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-base font-semibold text-slate-900">
                    Order Ref: {orderIdentifier}
                  </span>
                  {transaction.base_fabric_orders?.status && (
                    <span className="ml-3 inline-block rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                      {transaction.base_fabric_orders.status}
                    </span>
                  )}
                </div>
                <Link
                  href={`/toolbox/bfo/${transaction.base_fabric_order_id}`}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  View Order Details →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Pricing Information */}
        {(transaction.unit_price_usd || transaction.unit_price_zar) && (
          <div className="mt-8 border-t border-slate-100 pt-6">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Pricing & Financials</h3>
            <div className="grid gap-4 sm:grid-cols-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
              {transaction.unit_price_usd && (
                <div>
                  <p className="text-xs font-semibold text-slate-500">Unit Price (USD)</p>
                  <p className="mt-1 text-base font-medium text-slate-900">
                    ${transaction.unit_price_usd.toFixed(4)}
                  </p>
                </div>
              )}
              {transaction.unit_price_zar && (
                <div>
                  <p className="text-xs font-semibold text-slate-500">Unit Price (ZAR)</p>
                  <p className="mt-1 text-base font-medium text-slate-900">
                    R {transaction.unit_price_zar.toFixed(4)}
                  </p>
                </div>
              )}
              {transaction.exchange_rate && (
                <div>
                  <p className="text-xs font-semibold text-slate-500">Exchange Rate</p>
                  <p className="mt-1 text-base font-medium text-slate-900">
                    {transaction.exchange_rate.toFixed(6)} ZAR/USD
                  </p>
                </div>
              )}
              <div className="sm:col-span-3 border-t border-slate-200 pt-3 mt-1 flex flex-wrap gap-6">
                {transaction.unit_price_usd && (
                  <p className="text-sm font-semibold text-slate-900">
                    Total Value (USD): <span className="text-teal-700">${(transaction.unit_price_usd * transaction.quantity).toFixed(2)}</span>
                  </p>
                )}
                {transaction.unit_price_zar && (
                  <p className="text-sm font-semibold text-slate-900">
                    Total Value (ZAR): <span className="text-teal-700">R {(transaction.unit_price_zar * transaction.quantity).toFixed(2)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {displayNotes && (
          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Notes / Remarks</p>
            <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{displayNotes}</p>
            </div>
          </div>
        )}
      </motion.section>

      {/* Issue Slip Action Button for ISSUE transactions */}
      {transaction.transaction_type === "ISSUE" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex items-center justify-between"
        >
          <div>
            <h3 className="text-base font-semibold text-slate-900">Yarn Issue Slip</h3>
            <p className="text-sm text-slate-600">Access printable slip documentation for this issue record</p>
          </div>
          <Link href={`/toolbox/yarn/issuing/slip/${transaction.id}`}>
            <Button variant="primary">View & Print Issue Slip</Button>
          </Link>
        </motion.section>
      )}
    </div>
  );
}