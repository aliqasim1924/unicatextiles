"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface OrderDetail {
  id: string;
  order_no: string | null;
  status: string;
  loom_no: string | null;
  planned_qty_m: number;
  estimated_completion_at: string | null;
  actual_start_at: string | null;
  actual_completion_at: string | null;
  notes: string | null;
  base_fabric_items: {
    name: string;
    construction: string | null;
    gsm: number | null;
  };
}

interface Roll {
  id: string;
  roll_no: string | null;
  length_m: number;
  cut_at: string;
  notes: string | null;
}

export default function BaseFabricOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [rollForm, setRollForm] = useState({
    length_m: "",
    notes: "",
  });
  const [completionNote, setCompletionNote] = useState("");
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      fetchOrderData();
    }
  }, [orderId]);

  async function fetchOrderData() {
    try {
      setIsLoading(true);

      // Fetch order
      const { data: orderData, error: orderError } = await supabaseBrowserClient
        .from("base_fabric_orders")
        .select(
          `
          id,
          order_no,
          status,
          loom_no,
          planned_qty_m,
          estimated_completion_at,
          actual_start_at,
          actual_completion_at,
          notes,
          base_fabric_items:base_fabric_item_id ( name, construction, gsm )
        `
        )
        .eq("id", orderId)
        .single();

      if (orderError) throw orderError;

      const processedOrder = {
        ...orderData,
        base_fabric_items: Array.isArray(orderData.base_fabric_items)
          ? orderData.base_fabric_items[0]
          : orderData.base_fabric_items,
      } as OrderDetail;

      setOrder(processedOrder);
      setCompletionNote(processedOrder.notes || "");

      // Fetch rolls
      const { data: rollsData, error: rollsError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select("id, roll_no, length_m, cut_at, notes")
        .eq("base_fabric_order_id", orderId)
        .order("cut_at", { ascending: true });

      if (rollsError) throw rollsError;
      setRolls((rollsData as Roll[]) || []);
    } catch (err: any) {
      setError(err.message || "Failed to load order.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleRollFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setRollForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleAddRoll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!rollForm.length_m || Number(rollForm.length_m) <= 0) {
      setError("Roll length must be greater than zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: insertError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .insert({
          base_fabric_order_id: orderId,
          length_m: Number(rollForm.length_m),
          notes: rollForm.notes || null,
        });

      if (insertError) throw insertError;

      setSuccess("Roll added successfully.");
      setRollForm({ length_m: "", notes: "" });
      fetchOrderData();
    } catch (err: any) {
      setError(err.message || "Failed to add roll.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartOrder() {
    setIsSubmitting(true);
    try {
      const { error } = await supabaseBrowserClient
        .from("base_fabric_orders")
        .update({
          status: "RUNNING",
          actual_start_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;
      setSuccess("Order started.");
      fetchOrderData();
    } catch (err: any) {
      setError(err.message || "Failed to start order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompleteOrder() {
    if (!order) return;

    const totalProduced = rolls.reduce((sum, r) => sum + r.length_m, 0);
    const variance = totalProduced - order.planned_qty_m;
    const varianceAbs = Math.abs(variance);

    // Require note if variance is significant (more than 1% or more than 1 meter)
    const threshold = Math.max(order.planned_qty_m * 0.01, 1.0);
    if (varianceAbs > threshold && !completionNote.trim()) {
      setError(
        `Variance is ${varianceAbs.toFixed(2)}m. Please provide a note explaining the variance before completing.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabaseBrowserClient
        .from("base_fabric_orders")
        .update({
          status: "COMPLETED",
          actual_completion_at: new Date().toISOString(),
          notes: completionNote || order.notes || null,
        })
        .eq("id", orderId);

      if (error) throw error;
      setSuccess("Order completed.");
      setShowCompleteDialog(false);
      fetchOrderData();
    } catch (err: any) {
      setError(err.message || "Failed to complete order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function getStatusBadgeColor(status: string): string {
    switch (status) {
      case "PLANNED":
        return "bg-blue-100 text-blue-800";
      case "RUNNING":
        return "bg-yellow-100 text-yellow-800";
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "CANCELLED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading order...</p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error}</p>
          <Link href="/toolbox/base-fabric/orders">
            <Button variant="primary">Back to Orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const totalProduced = rolls.reduce((sum, r) => sum + r.length_m, 0);
  const variance = totalProduced - order.planned_qty_m;
  const progress = order.planned_qty_m > 0 ? (totalProduced / order.planned_qty_m) * 100 : 0;

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Order Detail</h1>
          <p className="mt-1 text-slate-600">Order No: {order.order_no || "N/A"}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.print()}
            className="print:hidden rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Print Production Report
          </button>
          <Link
            href="/toolbox/base-fabric/orders"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Orders
          </Link>
        </div>
      </div>

      {/* Production Report (Print Layout) */}
      <div className="print-page-shell print:min-h-0 hidden print:block">
        <div className="print-slip-container">
          <div className="print-slip-card">
            {/* Print Header */}
            <div className="print:flex print:justify-between print:items-start print:mb-6 print:pb-4 print:border-b print:border-slate-300">
              <div>
                <h2 className="print:text-2xl print:font-bold print:text-slate-900">
                  UNICA TEXTILE MILLS
                </h2>
              </div>
              <div className="print:w-24 print:h-24 print:border print:border-slate-300 print:flex print:items-center print:justify-center print:text-xs print:text-slate-500">
                LOGO
              </div>
            </div>

            {/* Print Title */}
            <h1 className="print:text-center print:text-xl print:font-bold print:text-slate-900 print:mb-6">
              Base Fabric Production Report
            </h1>

            {/* Print Order Info */}
            <div className="print:grid print:grid-cols-2 print:gap-4 print:mb-6 print:text-sm">
              <div>
                <span className="print:font-semibold print:text-slate-900">Order No:</span>{" "}
                <span className="print:text-slate-700">{order.order_no || "N/A"}</span>
              </div>
              <div>
                <span className="print:font-semibold print:text-slate-900">Base Fabric:</span>{" "}
                <span className="print:text-slate-700">
                  {order.base_fabric_items?.name || "N/A"}
                  {order.base_fabric_items?.gsm && ` (${order.base_fabric_items.gsm} GSM)`}
                  {order.base_fabric_items?.construction &&
                    ` - ${order.base_fabric_items.construction}`}
                </span>
              </div>
              <div>
                <span className="print:font-semibold print:text-slate-900">Loom:</span>{" "}
                <span className="print:text-slate-700">{order.loom_no || "-"}</span>
              </div>
              <div>
                <span className="print:font-semibold print:text-slate-900">Status:</span>{" "}
                <span className="print:text-slate-700">{order.status}</span>
              </div>
              <div>
                <span className="print:font-semibold print:text-slate-900">Planned Quantity:</span>{" "}
                <span className="print:text-slate-700">{order.planned_qty_m.toFixed(2)} m</span>
              </div>
              <div>
                <span className="print:font-semibold print:text-slate-900">Produced Quantity:</span>{" "}
                <span className="print:text-slate-700">{totalProduced.toFixed(2)} m</span>
              </div>
              <div>
                <span className="print:font-semibold print:text-slate-900">Variance:</span>{" "}
                <span className="print:text-slate-700">
                  {variance >= 0 ? "+" : ""}
                  {variance.toFixed(2)} m
                </span>
              </div>
              {order.estimated_completion_at && (
                <div>
                  <span className="print:font-semibold print:text-slate-900">
                    Estimated Completion:
                  </span>{" "}
                  <span className="print:text-slate-700">
                    {new Date(order.estimated_completion_at).toLocaleString("en-ZA")}
                  </span>
                </div>
              )}
              {order.actual_completion_at && (
                <div>
                  <span className="print:font-semibold print:text-slate-900">
                    Actual Completion:
                  </span>{" "}
                  <span className="print:text-slate-700">
                    {new Date(order.actual_completion_at).toLocaleString("en-ZA")}
                  </span>
                </div>
              )}
            </div>

            {/* Print Rolls Table */}
            {rolls.length > 0 && (
              <div className="print:mb-6">
                <h3 className="print:text-sm print:font-bold print:text-slate-900 print:mb-2">
                  Rolls ({rolls.length} total)
                </h3>
                <table className="print:w-full print:text-xs print:border print:border-slate-300">
                  <thead>
                    <tr className="print:bg-slate-100">
                      <th className="print:px-2 print:py-2 print:text-left print:font-semibold print:text-slate-900 print:border print:border-slate-300">
                        Roll No
                      </th>
                      <th className="print:px-2 print:py-2 print:text-right print:font-semibold print:text-slate-900 print:border print:border-slate-300">
                        Length (m)
                      </th>
                      <th className="print:px-2 print:py-2 print:text-left print:font-semibold print:text-slate-900 print:border print:border-slate-300">
                        Cut Time
                      </th>
                      <th className="print:px-2 print:py-2 print:text-left print:font-semibold print:text-slate-900 print:border print:border-slate-300">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolls.map((roll) => (
                      <tr key={roll.id}>
                        <td className="print:px-2 print:py-2 print:text-slate-900 print:border print:border-slate-300">
                          {roll.roll_no || "-"}
                        </td>
                        <td className="print:px-2 print:py-2 print:text-right print:text-slate-900 print:border print:border-slate-300">
                          {roll.length_m.toFixed(2)}
                        </td>
                        <td className="print:px-2 print:py-2 print:text-slate-700 print:border print:border-slate-300">
                          {new Date(roll.cut_at).toLocaleString("en-ZA", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="print:px-2 print:py-2 print:text-slate-700 print:border print:border-slate-300">
                          {roll.notes || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Print Footer */}
            <div className="print:flex print:justify-between print:items-center print:mt-6 print:pt-4 print:border-t print:border-slate-300 print:text-xs print:text-slate-600">
              <div>Document Number: UTM-WEAV-PROD-FT-001</div>
              <div>Page 1 of 1</div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Summary (Screen View) */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-semibold text-slate-600">Base Fabric</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {order.base_fabric_items?.name || "N/A"}
            </p>
            {order.base_fabric_items?.construction && (
              <p className="text-sm text-slate-600">{order.base_fabric_items.construction}</p>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Loom</p>
            <p className="mt-1 text-lg text-slate-900">{order.loom_no || "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Status</p>
            <p className="mt-1">
              <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${getStatusBadgeColor(
                  order.status
                )}`}
              >
                {order.status}
              </span>
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Progress</p>
            <p className="mt-1 text-lg font-semibold text-teal-700">
              {progress.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-slate-600">Planned Quantity</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {order.planned_qty_m.toFixed(2)} m
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Produced</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {totalProduced.toFixed(2)} m
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Variance</p>
            <p
              className={`mt-1 text-lg font-semibold ${
                variance === 0
                  ? "text-slate-900"
                  : variance > 0
                    ? "text-green-700"
                    : "text-red-700"
              }`}
            >
              {variance >= 0 ? "+" : ""}
              {variance.toFixed(2)} m
            </p>
          </div>
        </div>

        {order.estimated_completion_at && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-600">Estimated Completion</p>
            <p className="mt-1 text-sm text-slate-900">
              {new Date(order.estimated_completion_at).toLocaleString("en-ZA")}
            </p>
          </div>
        )}

        {order.actual_completion_at && (
          <div className="mt-2">
            <p className="text-sm font-semibold text-slate-600">Actual Completion</p>
            <p className="mt-1 text-sm text-slate-900">
              {new Date(order.actual_completion_at).toLocaleString("en-ZA")}
            </p>
          </div>
        )}
      </motion.section>

      {/* Status Actions */}
      {order.status === "PLANNED" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
        >
          <Button variant="primary" onClick={handleStartOrder} disabled={isSubmitting}>
            {isSubmitting ? "Starting..." : "Start Order"}
          </Button>
        </motion.section>
      )}

      {order.status === "RUNNING" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
        >
          {!showCompleteDialog ? (
            <Button variant="primary" onClick={() => setShowCompleteDialog(true)}>
              Complete Order
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-lg font-semibold text-slate-900">
                  Complete Order Confirmation
                </h3>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Planned:</span>
                    <span className="font-medium text-slate-900">
                      {order.planned_qty_m.toFixed(2)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Produced:</span>
                    <span className="font-medium text-slate-900">
                      {totalProduced.toFixed(2)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Variance:</span>
                    <span
                      className={`font-medium ${
                        variance === 0
                          ? "text-slate-900"
                          : variance > 0
                            ? "text-green-700"
                            : "text-red-700"
                      }`}
                    >
                      {variance >= 0 ? "+" : ""}
                      {variance.toFixed(2)} m
                    </span>
                  </div>
                </div>
                {Math.abs(variance) > Math.max(order.planned_qty_m * 0.01, 1.0) && (
                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Variance Note <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      value={completionNote}
                      onChange={(e) => setCompletionNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                      placeholder="Explain the variance..."
                      required
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCompleteDialog(false);
                    setCompletionNote(order.notes || "");
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleCompleteOrder} disabled={isSubmitting}>
                  {isSubmitting ? "Completing..." : "Confirm Completion"}
                </Button>
              </div>
            </div>
          )}
        </motion.section>
      )}

      {/* Add Roll Form */}
      {order.status === "RUNNING" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
        >
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Add Roll</h2>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mb-3 text-sm text-green-700">{success}</p>}

          <form onSubmit={handleAddRoll} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Length (m) <span className="text-red-600">*</span>
              </label>
              <input
                name="length_m"
                type="number"
                min="0"
                step="0.01"
                value={rollForm.length_m}
                onChange={handleRollFormChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="e.g. 50.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
              <input
                name="notes"
                value={rollForm.notes}
                onChange={handleRollFormChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Roll"}
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-slate-600">
            Roll number will be auto-generated (e.g. BFR-000001)
          </p>
        </motion.section>
      )}

      {/* Rolls Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Rolls ({rolls.length} total, {totalProduced.toFixed(2)} m)
        </h2>

        {rolls.length === 0 ? (
          <p className="text-sm text-slate-600">No rolls recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Cut Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rolls.map((roll) => (
                  <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {roll.roll_no || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {roll.length_m.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(roll.cut_at).toLocaleString("en-ZA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{roll.notes || "-"}</td>
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

