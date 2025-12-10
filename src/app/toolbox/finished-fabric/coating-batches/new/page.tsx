"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_COATING = "COATING";
const STATUS_READY_FOR_COATING = "READY_FOR_COATING";
const STATUS_COATING_IN_PROGRESS = "COATING_IN_PROGRESS";

interface AvailableRoll {
  id: string;
  qr_code: string | null;
  roll_no: string | null;
  length_m: number;
  cut_at: string;
  order_no: string | null;
  loom_no: string | null;
  fabric_name: string | null;
}

export default function NewCoatingBatchPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    coating_type: "",
    width_mm: "",
    planned_meters: "",
    color: "",
    gsm: "",
    notes: "",
  });
  const [availableRolls, setAvailableRolls] = useState<AvailableRoll[]>([]);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableRolls();
  }, []);

  async function fetchAvailableRolls() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          cut_at,
          current_location,
          status,
          base_fabric_orders:base_fabric_order_id (
            order_no,
            loom_no,
            base_fabric_items:base_fabric_item_id (
              name
            )
          )
        `
        )
        .eq("current_location", LOCATION_COATING)
        .eq("status", STATUS_READY_FOR_COATING)
        .order("cut_at", { ascending: true });

      if (fetchError) throw fetchError;

      const mapped =
        (data || []).map((row: any) => {
          const order = Array.isArray(row.base_fabric_orders)
            ? row.base_fabric_orders[0]
            : row.base_fabric_orders;
          const item = order?.base_fabric_items
            ? Array.isArray(order.base_fabric_items)
              ? order.base_fabric_items[0]
              : order.base_fabric_items
            : null;
          return {
            id: row.id as string,
            qr_code: row.qr_code ?? null,
            roll_no: row.roll_no ?? null,
            length_m: row.length_m,
            cut_at: row.cut_at,
            order_no: order?.order_no ?? null,
            loom_no: order?.loom_no ?? null,
            fabric_name: item?.name ?? null,
          };
        }) || [];

      setAvailableRolls(mapped);
    } catch (err: any) {
      setError(err.message || "Failed to load available rolls");
      console.error("Error fetching rolls:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleRollSelection(rollId: string) {
    const newSelection = new Set(selectedRollIds);
    if (newSelection.has(rollId)) {
      newSelection.delete(rollId);
    } else {
      newSelection.add(rollId);
    }
    setSelectedRollIds(newSelection);
  }

  function toggleSelectAll() {
    if (selectedRollIds.size === availableRolls.length) {
      setSelectedRollIds(new Set());
    } else {
      setSelectedRollIds(new Set(availableRolls.map((r) => r.id)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!formData.coating_type) {
      setError("Please select a coating type");
      return;
    }

    if (selectedRollIds.size === 0) {
      setError("Please select at least one base fabric roll");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const {
        data: { user },
      } = await supabaseBrowserClient.auth.getUser();

      // Create coating batch
      const { data: batch, error: batchError } = await supabaseBrowserClient
        .from("coating_batches")
        .insert({
          coating_type: formData.coating_type,
          width_mm: formData.width_mm ? parseInt(formData.width_mm) : null,
          planned_meters: formData.planned_meters ? parseFloat(formData.planned_meters) : null,
          color: formData.color || null,
          gsm: formData.gsm ? parseInt(formData.gsm) : null,
          notes: formData.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (batchError) throw batchError;
      if (!batch) throw new Error("Failed to create batch");

      // Create batch base rolls entries
      const selectedRolls = availableRolls.filter((r) => selectedRollIds.has(r.id));
      const batchBaseRolls = selectedRolls.map((roll) => ({
        batch_id: batch.id,
        base_fabric_roll_id: roll.id,
        input_length_m: roll.length_m,
      }));

      const { error: baseRollsError } = await supabaseBrowserClient
        .from("coating_batch_base_rolls")
        .insert(batchBaseRolls);

      if (baseRollsError) throw baseRollsError;

      // Update base fabric rolls status
      const { error: updateError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .update({ status: STATUS_COATING_IN_PROGRESS })
        .in("id", Array.from(selectedRollIds));

      if (updateError) throw updateError;

      setSuccess(`Batch ${batch.batch_no} created successfully`);
      setTimeout(() => {
        router.push(`/toolbox/finished-fabric/coating-batches/${batch.id}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Failed to create coating batch");
      console.error("Error creating batch:", err);
      setIsSubmitting(false);
    }
  }

  function formatDate(dateString: string) {
    try {
      return new Date(dateString).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <BackButton href="/toolbox/finished-fabric/coating-batches" />
      <h1 className="text-3xl font-semibold text-slate-900">New Coating Batch</h1>
      <p className="text-slate-600">Create a new coating batch and select base fabric rolls.</p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Batch Header Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Batch Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Coating Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.coating_type}
                onChange={(e) => setFormData({ ...formData, coating_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="">Select coating type</option>
                <option value="PVC">PVC</option>
                <option value="Acrylic Canvas">Acrylic Canvas</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Width (mm)</label>
              <input
                type="number"
                value={formData.width_mm}
                onChange={(e) => setFormData({ ...formData, width_mm: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. 1500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Planned Quantity (m)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.planned_meters}
                onChange={(e) => setFormData({ ...formData, planned_meters: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. 500.00"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Colour</label>
              <input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. White"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">GSM</label>
              <input
                type="number"
                value={formData.gsm}
                onChange={(e) => setFormData({ ...formData, gsm: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. 200"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Optional notes..."
              />
            </div>
          </div>
        </motion.div>

        {/* Available Rolls Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Available Base Fabric Rolls
              </h2>
              {availableRolls.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {selectedRollIds.size === availableRolls.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Select rolls with status: {STATUS_READY_FOR_COATING} at location: {LOCATION_COATING}
            </p>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-600">Loading rolls...</div>
          ) : availableRolls.length === 0 ? (
            <div className="p-8 text-center text-slate-600">
              No rolls available. Rolls must be in COATING location with READY_FOR_COATING status.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedRollIds.size === availableRolls.length && availableRolls.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      QR
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Roll No
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Order No
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Base Fabric Name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Length (m)
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Cut At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {availableRolls.map((roll) => (
                    <tr
                      key={roll.id}
                      className={selectedRollIds.has(roll.id) ? "bg-blue-50" : ""}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRollIds.has(roll.id)}
                          onChange={() => toggleRollSelection(roll.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {roll.qr_code ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                        {roll.roll_no ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {roll.order_no ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {roll.fabric_name ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                        {roll.length_m.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {formatDate(roll.cut_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting || isLoading}>
            {isSubmitting ? "Creating..." : "Create Batch"}
          </Button>
        </div>
      </form>
    </div>
  );
}

