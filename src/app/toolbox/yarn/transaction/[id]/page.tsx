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
  yarn_items: {
    name: string;
    denier: number | null;
    material: string | null;
    uom: string;
  };
  suppliers: {
    name: string;
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
          yarn_items:yarn_item_id (
            name,
            denier,
            material,
            uom
          ),
          suppliers:supplier_id (
            name
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
      return "bg-green-100 text-green-800";
    } else if (type === "ISSUE" || type === "SCRAP") {
      return "bg-red-100 text-red-800";
    } else if (type === "DEPT_TO_ORDER") {
      return "bg-amber-100 text-amber-800";
    }
    return "bg-blue-100 text-blue-800";
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading transaction detail...</p>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error || "Transaction not found."}</p>
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

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Transaction Detail</h1>
          <p className="mt-1 text-slate-600">View complete transaction information</p>
        </div>
        <Link
          href={ledgerLink}
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Ledger
        </Link>
      </div>

      {/* Transaction Type Badge */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-600">Transaction Type:</span>
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${getTypeBadgeColor(
              transaction.transaction_type
            )}`}
          >
            {transaction.transaction_type}
          </span>
          {transaction.slip_no && (
            <span className="text-sm text-slate-600">Slip No: {transaction.slip_no}</span>
          )}
        </div>
      </motion.section>

      {/* Transaction Details */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Transaction Details</h2>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-600">Date/Time</p>
            <p className="mt-1 text-base text-slate-900">
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
            <p className="text-sm font-semibold text-slate-600">Yarn Item</p>
            <p className="mt-1 text-base font-medium text-slate-900">
              {transaction.yarn_items?.name || "N/A"}
            </p>
            {transaction.yarn_items?.denier && (
              <p className="text-sm text-slate-600">
                {transaction.yarn_items.denier}D
                {transaction.yarn_items.material && ` - ${transaction.yarn_items.material}`}
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-600">Quantity</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {transaction.quantity.toFixed(3)} {transaction.uom}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-600">Source</p>
            <p className="mt-1 text-base text-slate-900">{transaction.source || "-"}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-600">Destination</p>
            <p className="mt-1 text-base text-slate-900">{transaction.destination || "-"}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-600">Batch No</p>
            <p className="mt-1 text-base text-slate-900">{transaction.batch_no || "-"}</p>
          </div>

          {transaction.suppliers && (
            <div>
              <p className="text-sm font-semibold text-slate-600">Supplier</p>
              <p className="mt-1 text-base text-slate-900">{transaction.suppliers.name}</p>
            </div>
          )}

          {transaction.ref_document && (
            <div>
              <p className="text-sm font-semibold text-slate-600">Ref Document</p>
              <p className="mt-1 text-base text-slate-900">{transaction.ref_document}</p>
            </div>
          )}
        </div>

        {/* Pricing Information */}
        {(transaction.unit_price_usd || transaction.unit_price_zar) && (
          <div className="mt-6 border-t border-slate-200 pt-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Pricing Information</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {transaction.unit_price_usd && (
                <div>
                  <p className="text-sm font-semibold text-slate-600">Unit Price (USD)</p>
                  <p className="mt-1 text-base font-medium text-slate-900">
                    ${transaction.unit_price_usd.toFixed(4)}
                  </p>
                </div>
              )}
              {transaction.unit_price_zar && (
                <div>
                  <p className="text-sm font-semibold text-slate-600">Unit Price (ZAR)</p>
                  <p className="mt-1 text-base font-medium text-slate-900">
                    R{transaction.unit_price_zar.toFixed(4)}
                  </p>
                </div>
              )}
              {transaction.exchange_rate && (
                <div>
                  <p className="text-sm font-semibold text-slate-600">Exchange Rate</p>
                  <p className="mt-1 text-base font-medium text-slate-900">
                    {transaction.exchange_rate.toFixed(6)} ZAR/USD
                  </p>
                </div>
              )}
              {transaction.unit_price_usd && (
                <div className="sm:col-span-3">
                  <p className="text-sm font-semibold text-slate-600">Total Cost</p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {transaction.unit_price_usd && (
                      <p className="text-base font-medium text-slate-900">
                        USD: ${(transaction.unit_price_usd * transaction.quantity).toFixed(2)}
                      </p>
                    )}
                    {transaction.unit_price_zar && (
                      <p className="text-base font-medium text-slate-900">
                        ZAR: R{(transaction.unit_price_zar * transaction.quantity).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {transaction.notes && (
          <div className="mt-6 border-t border-slate-200 pt-6">
            <p className="text-sm font-semibold text-slate-600 mb-2">Notes</p>
            <p className="text-base text-slate-900 whitespace-pre-wrap">{transaction.notes}</p>
          </div>
        )}
      </motion.section>

      {/* Issue Slip Button for ISSUE transactions */}
      {transaction.transaction_type === "ISSUE" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Yarn Issue Slip</h3>
              <p className="mt-1 text-sm text-slate-600">
                View and print the issue slip for this transaction
              </p>
            </div>
            <Link href={`/toolbox/yarn/issuing/slip/${transaction.id}`}>
              <Button variant="primary">View & Print Issue Slip</Button>
            </Link>
          </div>
        </motion.section>
      )}
    </div>
  );
}

