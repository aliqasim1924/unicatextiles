"use client";

import { useState, FormEvent, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { YarnItemSelect } from "@/components/yarn/YarnItemSelect";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { motion } from "framer-motion";

interface ReceiptTransaction {
  id: string;
  txn_time: string;
  yarn_items: {
    name: string;
  };
  quantity: number;
  batch_no: string | null;
  ref_document: string | null;
  unit_price_usd: number | null;
  unit_price_zar: number | null;
  suppliers: {
    name: string;
  } | null;
}

export default function YarnReceivingPage() {
  const [yarnItemId, setYarnItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [quantity, setQuantity] = useState("");
  const [uom, setUom] = useState("kg");
  const [source, setSource] = useState("SUPPLIER");
  const [destination, setDestination] = useState("STORE");
  const [refDocument, setRefDocument] = useState("");
  const [notes, setNotes] = useState("");
  const [unitPriceUsd, setUnitPriceUsd] = useState("");
  const [unitPriceZar, setUnitPriceZar] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptTransaction[]>([]);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(true);

  // Calculate exchange rate and totals
  const exchangeRate =
    unitPriceUsd && unitPriceZar && parseFloat(unitPriceUsd) > 0
      ? (parseFloat(unitPriceZar) / parseFloat(unitPriceUsd)).toFixed(6)
      : null;
  const totalUsd =
    quantity && unitPriceUsd
      ? (parseFloat(quantity) * parseFloat(unitPriceUsd)).toFixed(2)
      : null;
  const totalZar =
    quantity && unitPriceZar
      ? (parseFloat(quantity) * parseFloat(unitPriceZar)).toFixed(2)
      : null;

  useEffect(() => {
    fetchRecentReceipts();
  }, []);

  // Auto-fill supplier when yarn item is selected
  useEffect(() => {
    async function fetchYarnItemSupplier() {
      if (!yarnItemId) return;

      try {
        const { data, error } = await supabaseBrowserClient
          .from("yarn_items")
          .select("supplier_id")
          .eq("id", yarnItemId)
          .single();

        if (error) throw error;
        if (data?.supplier_id) {
          setSupplierId(data.supplier_id);
        }
      } catch (err) {
        console.error("Error fetching yarn item supplier:", err);
      }
    }

    fetchYarnItemSupplier();
  }, [yarnItemId]);

  async function fetchRecentReceipts() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("yarn_transactions")
        .select(
          `
          id,
          txn_time,
          quantity,
          batch_no,
          ref_document,
          unit_price_usd,
          unit_price_zar,
          yarn_items:yarn_item_id (
            name
          ),
          suppliers:supplier_id (
            name
          )
        `
        )
        .eq("transaction_type", "RECEIPT")
        .order("txn_time", { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentReceipts(
        (data as any[]).map((item) => ({
          ...item,
          yarn_items: Array.isArray(item.yarn_items) ? item.yarn_items[0] : item.yarn_items,
          suppliers: Array.isArray(item.suppliers) ? item.suppliers[0] : item.suppliers,
        })) as ReceiptTransaction[]
      );
    } catch (err) {
      console.error("Error fetching recent receipts:", err);
    } finally {
      setIsLoadingReceipts(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!yarnItemId || !quantity) {
      setErrorMessage("Yarn Item and Quantity are required.");
      return;
    }

    // If one price is entered, require the other
    if ((unitPriceUsd && !unitPriceZar) || (!unitPriceUsd && unitPriceZar)) {
      setErrorMessage("If entering pricing, both USD and ZAR prices are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const insertData: any = {
        yarn_item_id: yarnItemId,
        transaction_type: "RECEIPT",
        quantity: parseFloat(quantity),
        uom: uom,
        source: source || null,
        destination: destination || null,
        batch_no: batchNo || null,
        ref_document: refDocument || null,
        notes: notes || null,
        supplier_id: supplierId || null,
      };

      // Add pricing fields if provided
      if (unitPriceUsd && unitPriceZar) {
        insertData.unit_price_usd = parseFloat(unitPriceUsd);
        insertData.unit_price_zar = parseFloat(unitPriceZar);
        insertData.exchange_rate = parseFloat(exchangeRate!);
      }

      const { error } = await supabaseBrowserClient
        .from("yarn_transactions")
        .insert(insertData);

      if (error) throw error;

      setSuccessMessage("Yarn receipt recorded successfully!");

      // Reset form
      setYarnItemId("");
      setSupplierId("");
      setBatchNo("");
      setQuantity("");
      setUom("kg");
      setSource("SUPPLIER");
      setDestination("STORE");
      setRefDocument("");
      setNotes("");
      setUnitPriceUsd("");
      setUnitPriceZar("");

      // Refresh recent receipts
      await fetchRecentReceipts();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to record yarn receipt. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Receiving</h1>
          <p className="mt-1 text-slate-600">
            Record new yarn receipts from suppliers
          </p>
        </div>
        <Link
          href="/toolbox/yarn"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Yarn Control
        </Link>
      </div>

      {/* Form Card */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-6 text-xl font-semibold text-slate-900">
          Record New Receipt
        </h2>

        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-6">
          {/* Group 1: Yarn Item, Supplier, Lot/Batch */}
          <div className="grid gap-5 sm:grid-cols-2 border-b border-slate-200 pb-6">
            <div className="sm:col-span-2">
              <YarnItemSelect
                value={yarnItemId}
                onChange={setYarnItemId}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="sm:col-span-2">
              <SupplierSelect
                value={supplierId}
                onChange={setSupplierId}
                disabled={isSubmitting}
                allowNone={true}
              />
            </div>

            <div className="sm:col-span-2">
              <Input
                label="Lot / Batch No"
                type="text"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="Batch number"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Group 2: Quantity, UOM, Source, Destination */}
          <div className="grid gap-5 sm:grid-cols-2 border-b border-slate-200 pb-6">
            <Input
              label="Quantity"
              type="number"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.000"
              required
              disabled={isSubmitting}
            />

            <div className="w-full">
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                UoM
              </label>
              <select
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                disabled={isSubmitting}
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="lb">lb</option>
              </select>
            </div>

            <Input
              label="Source"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="SUPPLIER"
              disabled={isSubmitting}
            />

            <Input
              label="Destination"
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="STORE"
              disabled={isSubmitting}
            />
          </div>

          {/* Group 3: Pricing */}
          <div className="grid gap-5 sm:grid-cols-2 border-b border-slate-200 pb-6">
            <h3 className="sm:col-span-2 text-lg font-semibold text-slate-900">
              Pricing (Optional)
            </h3>

            <Input
              label="Unit Price (USD)"
              type="number"
              step="0.0001"
              value={unitPriceUsd}
              onChange={(e) => setUnitPriceUsd(e.target.value)}
              placeholder="0.0000"
              disabled={isSubmitting}
            />

            <Input
              label="Unit Price (ZAR)"
              type="number"
              step="0.0001"
              value={unitPriceZar}
              onChange={(e) => setUnitPriceZar(e.target.value)}
              placeholder="0.0000"
              disabled={isSubmitting}
            />

            {exchangeRate && (
              <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900 mb-2">
                  Exchange Rate: <span className="text-teal-700">{exchangeRate} ZAR/USD</span>
                </p>
                {totalUsd && totalZar && (
                  <div className="grid gap-2 sm:grid-cols-2 mt-2">
                    <p className="text-sm text-slate-600">
                      Total USD: <span className="font-semibold text-slate-900">${totalUsd}</span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Total ZAR: <span className="font-semibold text-slate-900">R{totalZar}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Group 4: Ref Document, Notes */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Ref Document"
              type="text"
              value={refDocument}
              onChange={(e) => setRefDocument(e.target.value)}
              placeholder="Document reference"
              disabled={isSubmitting}
            />

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent transition"
                placeholder="Additional notes (optional)"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              Record Receipt
            </Button>
          </div>
        </form>
      </motion.section>

      {/* Recent Receipts Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Recent Receipts
        </h2>

        {isLoadingReceipts ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : recentReceipts.length === 0 ? (
          <p className="text-sm text-slate-600">No receipts recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Date/Time
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Yarn Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Supplier
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Unit Price USD
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Unit Price ZAR
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Batch No
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Ref Document
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentReceipts.map((receipt) => (
                  <tr
                    key={receipt.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(receipt.txn_time).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {receipt.yarn_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {receipt.suppliers?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {receipt.quantity.toFixed(3)} kg
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {receipt.unit_price_usd ? `$${receipt.unit_price_usd.toFixed(4)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {receipt.unit_price_zar ? `R${receipt.unit_price_zar.toFixed(4)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {receipt.batch_no || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {receipt.ref_document || "-"}
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
