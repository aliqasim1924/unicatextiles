"use client";

import { useState, FormEvent, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { YarnItemSelect } from "@/components/yarn/YarnItemSelect";
import { motion } from "framer-motion";

interface IssueTransaction {
  id: string;
  txn_time: string;
  yarn_items: {
    name: string;
  };
  quantity: number;
  destination: string | null;
}

export default function YarnIssuingPage() {
  const router = useRouter();
  const [yarnItemId, setYarnItemId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [quantity, setQuantity] = useState("");
  const [uom, setUom] = useState("kg");
  const [source, setSource] = useState("STORE");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdIssueId, setCreatedIssueId] = useState<string | null>(null);
  const [createdSlipNo, setCreatedSlipNo] = useState<string | null>(null);
  const [recentIssues, setRecentIssues] = useState<IssueTransaction[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(true);
  
  // Stock tracking
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [isLoadingStock, setIsLoadingStock] = useState(true);

  useEffect(() => {
    fetchRecentIssues();
    fetchStockData();
  }, []);

  async function fetchStockData() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("yarn_stock")
        .select("yarn_item_id, stock_qty");

      if (error) throw error;

      const map = new Map<string, number>();
      (data || []).forEach((item) => {
        map.set(item.yarn_item_id, item.stock_qty || 0);
      });
      setStockMap(map);
    } catch (err) {
      console.error("Error fetching stock data:", err);
    } finally {
      setIsLoadingStock(false);
    }
  }

  async function fetchRecentIssues() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("yarn_transactions")
        .select(
          `
          id,
          txn_time,
          quantity,
          destination,
          yarn_items:yarn_item_id (
            name
          )
        `
        )
        .eq("transaction_type", "ISSUE")
        .order("txn_time", { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentIssues(
        (data as any[]).map((item) => ({
          ...item,
          yarn_items: Array.isArray(item.yarn_items) ? item.yarn_items[0] : item.yarn_items,
        })) as IssueTransaction[]
      );
    } catch (err) {
      console.error("Error fetching recent issues:", err);
    } finally {
      setIsLoadingIssues(false);
    }
  }

  // Get stock on hand for selected yarn item
  const stockOnHand = yarnItemId ? (stockMap.get(yarnItemId) ?? 0) : null;
  const quantityNum = quantity ? parseFloat(quantity) : null;
  const exceedsStock = quantityNum !== null && stockOnHand !== null && quantityNum > stockOnHand;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedIssueId(null);
    setCreatedSlipNo(null);

    if (!yarnItemId || !quantity) {
      setErrorMessage("Yarn Item and Quantity are required.");
      return;
    }

    // Stock validation
    const stock = stockMap.get(yarnItemId) ?? 0;
    const qty = parseFloat(quantity);
    
    if (qty > stock) {
      setErrorMessage(
        `Cannot issue ${qty.toFixed(3)} ${uom}. Available stock: ${stock.toFixed(3)} ${uom}.`
      );
      return;
    }

    if (stock === 0 && qty > 0) {
      setErrorMessage("Cannot issue yarn. Stock on hand is 0.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabaseBrowserClient
        .from("yarn_transactions")
        .insert({
          yarn_item_id: yarnItemId,
          transaction_type: "ISSUE",
          quantity: qty,
          uom: uom,
          source: source || null,
          destination: destination || null,
          batch_no: batchNo || null,
          notes: notes || null,
        })
        .select("id, slip_no")
        .single();

      if (error) throw error;

      setSuccessMessage(`Yarn issue recorded successfully. Slip No: ${data.slip_no || "N/A"}`);
      setCreatedIssueId(data.id);
      setCreatedSlipNo(data.slip_no);

      // Reset form
      setYarnItemId("");
      setBatchNo("");
      setQuantity("");
      setUom("kg");
      setSource("STORE");
      setDestination("");
      setNotes("");

      // Refresh recent issues and stock
      await Promise.all([fetchRecentIssues(), fetchStockData()]);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to record yarn issue. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Issuing</h1>
          <p className="mt-1 text-slate-600">
            Issue yarn to production or other departments
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
          Record New Issue
        </h2>

        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="mb-3 text-sm text-green-700 font-semibold">
              {successMessage}
            </p>
            {createdIssueId && (
              <Link href={`/toolbox/yarn/issuing/slip/${createdIssueId}`}>
                <Button variant="primary" className="w-full sm:w-auto">
                  View & Print Issue Slip
                </Button>
              </Link>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <YarnItemSelect
              value={yarnItemId}
              onChange={setYarnItemId}
              required
              disabled={isSubmitting}
            />
            
            {/* Stock on Hand Display */}
            {yarnItemId && !isLoadingStock && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm text-slate-900">
                  <span className="font-semibold">Stock on hand:</span>{" "}
                  <span className="text-teal-700">
                    {stockOnHand !== null ? `${stockOnHand.toFixed(3)} ${uom}` : "0.000 kg"}
                  </span>
                </p>
              </div>
            )}
            {yarnItemId && isLoadingStock && (
              <div className="mt-2 text-sm text-slate-600">Loading stock...</div>
            )}
            {!yarnItemId && (
              <div className="mt-2 text-sm text-slate-500 italic">
                Select a yarn item to see stock on hand
              </div>
            )}
          </div>

          <Input
            label="Lot / Batch No"
            type="text"
            value={batchNo}
            onChange={(e) => setBatchNo(e.target.value)}
            placeholder="Batch number (optional)"
            disabled={isSubmitting}
          />

          <div>
            <Input
              label="Quantity"
              type="number"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.000"
              required
              disabled={isSubmitting}
              error={
                exceedsStock
                  ? `Warning: quantity exceeds available stock (${stockOnHand?.toFixed(3) || 0} ${uom} on hand)`
                  : undefined
              }
            />
            {exceedsStock && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
                <p className="text-sm text-red-600">
                  ⚠️ Cannot issue more than available stock. Available:{" "}
                  <span className="font-semibold">
                    {stockOnHand?.toFixed(3) || 0} {uom}
                  </span>
                </p>
              </div>
            )}
          </div>

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
            placeholder="STORE"
            disabled={isSubmitting}
          />

          <Input
            label="Destination"
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g., WEAVING, LOOM-7"
            required
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

          <div className="sm:col-span-2">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || exceedsStock}
            >
              Record Issue
            </Button>
            {exceedsStock && (
              <p className="mt-2 text-sm text-red-600">
                Please adjust the quantity to match available stock before submitting.
              </p>
            )}
          </div>
        </form>
      </motion.section>

      {/* Recent Issues Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Recent Issues
        </h2>

        {isLoadingIssues ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : recentIssues.length === 0 ? (
          <p className="text-sm text-slate-600">No issues recorded yet.</p>
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
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Destination
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentIssues.map((issue) => (
                  <tr
                    key={issue.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(issue.txn_time).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {issue.yarn_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {issue.quantity.toFixed(3)} kg
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {issue.destination || "-"}
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
