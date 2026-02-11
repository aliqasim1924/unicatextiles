"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_COATING = "COATING";
const STATUS_READY_FOR_COATING = "READY_FOR_COATING";

interface AvailableRoll {
  id: string;
  qr_code: string | null;
  roll_no: string | null;
  length_m: number;
  cut_at: string;
  order_no: string | null;
  loom_no: string | null;
  fabric_name: string | null;
  total_allocated_to_batches: number;
  remaining_for_batches: number;
}

export default function NewCoatingBatchPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    fabric_type_id: "",
    gsm_option_id: "",
    color_option_id: "",
    width_option_id: "",
    planned_meters: "",
    notes: "",
  });
  const [availableRolls, setAvailableRolls] = useState<AvailableRoll[]>([]);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [allocatedLengths, setAllocatedLengths] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fabricTypes, setFabricTypes] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [gsmOptions, setGsmOptions] = useState<Record<string, Array<{ id: string; gsm: number }>>>({});
  const [colorOptions, setColorOptions] = useState<Record<string, Array<{ id: string; color_name: string }>>>({});
  const [widthOptions, setWidthOptions] = useState<Record<string, Array<{ id: string; width_mm: number }>>>({});

  useEffect(() => {
    fetchAvailableRolls();
    fetchCatalogData();
  }, []);

  async function fetchCatalogData() {
    try {
      // Fetch fabric types
      const { data: typesData, error: typesError } = await supabaseBrowserClient
        .from("fabric_types")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (typesError) throw typesError;
      setFabricTypes((typesData || []) as Array<{ id: string; code: string; name: string }>);

      // Fetch all GSM options grouped by fabric_type_id
      const { data: gsmData, error: gsmError } = await supabaseBrowserClient
        .from("fabric_type_gsm_options")
        .select("id, fabric_type_id, gsm")
        .eq("is_active", true)
        .order("gsm", { ascending: true });
      if (gsmError) throw gsmError;

      const gsmMap: Record<string, Array<{ id: string; gsm: number }>> = {};
      (gsmData || []).forEach((opt: any) => {
        if (!gsmMap[opt.fabric_type_id]) gsmMap[opt.fabric_type_id] = [];
        gsmMap[opt.fabric_type_id].push({ id: opt.id, gsm: opt.gsm });
      });
      setGsmOptions(gsmMap);

      // Fetch all color options grouped by fabric_type_id
      const { data: colorData, error: colorError } = await supabaseBrowserClient
        .from("fabric_type_color_options")
        .select("id, fabric_type_id, color_name")
        .eq("is_active", true)
        .order("color_name", { ascending: true });
      if (colorError) throw colorError;

      const colorMap: Record<string, Array<{ id: string; color_name: string }>> = {};
      (colorData || []).forEach((opt: any) => {
        if (!colorMap[opt.fabric_type_id]) colorMap[opt.fabric_type_id] = [];
        colorMap[opt.fabric_type_id].push({ id: opt.id, color_name: opt.color_name });
      });
      setColorOptions(colorMap);

      // Fetch all width options grouped by fabric_type_id
      const { data: widthData, error: widthError } = await supabaseBrowserClient
        .from("fabric_type_width_options")
        .select("id, fabric_type_id, width_mm")
        .eq("is_active", true)
        .order("width_mm", { ascending: true });
      if (widthError) throw widthError;

      const widthMap: Record<string, Array<{ id: string; width_mm: number }>> = {};
      (widthData || []).forEach((opt: any) => {
        if (!widthMap[opt.fabric_type_id]) widthMap[opt.fabric_type_id] = [];
        widthMap[opt.fabric_type_id].push({ id: opt.id, width_mm: opt.width_mm });
      });
      setWidthOptions(widthMap);
    } catch (err: any) {
      console.error("Failed to fetch catalog data", err);
      setError(err?.message || "Failed to load catalog data.");
    }
  }

  async function fetchAvailableRolls() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseBrowserClient
        .from("base_fabric_rolls_available_for_coating")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          cut_at,
          order_no,
          loom_no,
          fabric_name,
          total_allocated_to_batches,
          remaining_for_batches
        `
        )
        .eq("current_location", LOCATION_COATING)
        .eq("status", STATUS_READY_FOR_COATING)
        .gt("remaining_for_batches", 0)
        .order("cut_at", { ascending: true });

      if (fetchError) throw fetchError;

      const mapped =
        (data || []).map((row: any) => ({
          id: row.id as string,
          qr_code: row.qr_code ?? null,
          roll_no: row.roll_no ?? null,
          length_m: Number(row.length_m || 0),
          cut_at: row.cut_at,
          order_no: row.order_no ?? null,
          loom_no: row.loom_no ?? null,
          fabric_name: row.fabric_name ?? null,
          total_allocated_to_batches: Number(row.total_allocated_to_batches || 0),
          remaining_for_batches: Number(row.remaining_for_batches || 0),
        })) || [];

      setAvailableRolls(mapped);
      setAllocatedLengths({});
      setSelectedRollIds(new Set());
    } catch (err: any) {
      setError(err.message || "Failed to load available rolls");
      console.error("Error fetching rolls:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleRollSelection(rollId: string) {
    const newSelection = new Set(selectedRollIds);
    const newAllocated = { ...allocatedLengths };
    const roll = availableRolls.find((r) => r.id === rollId);

    if (newSelection.has(rollId)) {
      newSelection.delete(rollId);
      delete newAllocated[rollId];
    } else {
      newSelection.add(rollId);
      if (roll && !newAllocated[rollId]) {
        newAllocated[rollId] = roll.remaining_for_batches.toFixed(2);
      }
    }

    setSelectedRollIds(newSelection);
    setAllocatedLengths(newAllocated);
  }

  function toggleSelectAll() {
    if (selectedRollIds.size === availableRolls.length) {
      setSelectedRollIds(new Set());
      setAllocatedLengths({});
    } else {
      const allIds = availableRolls.map((r) => r.id);
      const newSelection = new Set(allIds);
      const newAllocated: Record<string, string> = {};
      availableRolls.forEach((roll) => {
        newAllocated[roll.id] = roll.remaining_for_batches.toFixed(2);
      });
      setSelectedRollIds(newSelection);
      setAllocatedLengths(newAllocated);
    }
  }

  function handleAllocatedLengthChange(roll: AvailableRoll, value: string) {
    const newAllocated = { ...allocatedLengths };
    newAllocated[roll.id] = value;

    const parsed = parseFloat(value);
    const newSelection = new Set(selectedRollIds);
    if (!value || isNaN(parsed) || parsed <= 0) {
      newSelection.delete(roll.id);
    } else {
      newSelection.add(roll.id);
    }

    setAllocatedLengths(newAllocated);
    setSelectedRollIds(newSelection);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!formData.fabric_type_id) {
      setError("Please select a fabric type");
      return;
    }
    if (!formData.color_option_id) {
      setError("Please select a colour");
      return;
    }

    if (selectedRollIds.size === 0) {
      setError("Please select at least one base fabric roll and allocation length.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const {
        data: { user },
      } = await supabaseBrowserClient.auth.getUser();

      // Resolve text values from catalog for backward compatibility
      const fabricType = fabricTypes.find((ft) => ft.id === formData.fabric_type_id);
      const colorOpt = colorOptions[formData.fabric_type_id]?.find((c) => c.id === formData.color_option_id);
      const gsmOpt = gsmOptions[formData.fabric_type_id]?.find((g) => g.id === formData.gsm_option_id);
      const widthOpt = widthOptions[formData.fabric_type_id]?.find((w) => w.id === formData.width_option_id);

      // Create coating batch
      const { data: batch, error: batchError } = await supabaseBrowserClient
        .from("coating_batches")
        .insert({
          fabric_type_id: formData.fabric_type_id || null,
          gsm_option_id: formData.gsm_option_id || null,
          color_option_id: formData.color_option_id || null,
          width_option_id: formData.width_option_id || null,
          // Backward compatibility: still store text fields
          coating_type: fabricType?.code || null,
          color: colorOpt?.color_name || null,
          gsm: gsmOpt?.gsm || null,
          width_mm: widthOpt?.width_mm || null,
          planned_meters: formData.planned_meters ? parseFloat(formData.planned_meters) : null,
          notes: formData.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (batchError) throw batchError;
      if (!batch) throw new Error("Failed to create batch");

      // Create batch base rolls entries with allocated lengths
      const selectedRolls = availableRolls.filter((r) => selectedRollIds.has(r.id));

      if (selectedRolls.length === 0) {
        throw new Error("No valid rolls selected. Please select rolls and enter allocated lengths.");
      }

      for (const roll of selectedRolls) {
        const value = allocatedLengths[roll.id];
        const allocated = parseFloat(value);

        if (!value || isNaN(allocated) || allocated <= 0) {
          throw new Error(
            `Please enter a valid allocated length for roll ${roll.roll_no || roll.id}.`
          );
        }

        if (allocated > roll.remaining_for_batches) {
          throw new Error(
            `Allocated length for roll ${roll.roll_no || roll.id} exceeds remaining available quantity.\n` +
              `Allocated: ${allocated.toFixed(2)} m, Remaining: ${roll.remaining_for_batches.toFixed(2)} m.`
          );
        }
      }

      const batchBaseRolls = selectedRolls.map((roll) => ({
        batch_id: batch.id,
        base_fabric_roll_id: roll.id,
        input_length_m: parseFloat(allocatedLengths[roll.id]),
      }));

      const { error: baseRollsError } = await supabaseBrowserClient
        .from("coating_batch_base_rolls")
        .insert(batchBaseRolls);

      if (baseRollsError) throw baseRollsError;

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
                Fabric Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.fabric_type_id}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    fabric_type_id: e.target.value,
                    gsm_option_id: "",
                    color_option_id: "",
                    width_option_id: "",
                  });
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="">Select fabric type</option>
                {fabricTypes.map((ft) => (
                  <option key={ft.id} value={ft.id}>
                    {ft.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Colour <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.color_option_id}
                onChange={(e) => setFormData({ ...formData, color_option_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
                disabled={!formData.fabric_type_id}
              >
                <option value="">Select colour</option>
                {formData.fabric_type_id &&
                  (colorOptions[formData.fabric_type_id] || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.color_name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">GSM</label>
              <select
                value={formData.gsm_option_id}
                onChange={(e) => setFormData({ ...formData, gsm_option_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={!formData.fabric_type_id}
              >
                <option value="">Select GSM</option>
                {formData.fabric_type_id &&
                  (gsmOptions[formData.fabric_type_id] || []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.gsm}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Width (mm)</label>
              <select
                value={formData.width_option_id}
                onChange={(e) => setFormData({ ...formData, width_option_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={!formData.fabric_type_id}
              >
                <option value="">Select width</option>
                {formData.fabric_type_id &&
                  (widthOptions[formData.fabric_type_id] || []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.width_mm} mm
                    </option>
                  ))}
              </select>
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
                      Roll No
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Loom No
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Base Fabric Name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Roll Length (m)
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Remaining (m)
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Allocate (m)
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
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                        {roll.roll_no ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {roll.loom_no ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {roll.fabric_name ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                        {roll.length_m.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                        {roll.remaining_for_batches.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          max={roll.remaining_for_batches}
                          value={allocatedLengths[roll.id] ?? ""}
                          onChange={(e) => handleAllocatedLengthChange(roll, e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
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

