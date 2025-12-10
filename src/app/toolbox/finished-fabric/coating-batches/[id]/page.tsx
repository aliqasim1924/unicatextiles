"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface CoatingBatch {
  id: string;
  batch_no: string | null;
  batch_date: string;
  coating_type: string;
  width_mm: number | null;
  planned_meters: number | null;
  color: string | null;
  gsm: number | null;
  actual_coated_meters: number | null;
  status: string;
  notes: string | null;
}

interface BaseRoll {
  id: string;
  base_fabric_roll_id: string;
  input_length_m: number;
  base_fabric_rolls: {
    roll_no: string | null;
    qr_code: string | null;
    length_m: number;
    base_fabric_orders: {
      order_no: string | null;
      base_fabric_items: {
        name: string;
      };
    } | null;
  };
}

interface ChemicalRow {
  id?: string;
  chemical_name: string;
  quantity: number | null;
  uom: string;
}

export default function CoatingBatchDetailPage() {
  const router = useRouter();
  const params = useParams();
  const batchId = params.id as string;
  const [batch, setBatch] = useState<CoatingBatch | null>(null);
  const [baseRolls, setBaseRolls] = useState<BaseRoll[]>([]);
  const [chemicals, setChemicals] = useState<ChemicalRow[]>([]);
  const [coatedMetersInput, setCoatedMetersInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (batchId) {
      fetchBatchData();
    }
  }, [batchId]);

  async function fetchBatchData() {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch batch
      const { data: batchData, error: batchError } = await supabaseBrowserClient
        .from("coating_batches")
        .select("*")
        .eq("id", batchId)
        .single();

      if (batchError) throw batchError;
      setBatch(batchData);
      setCoatedMetersInput(batchData.actual_coated_meters ? String(batchData.actual_coated_meters) : "");

      // Fetch base rolls
      const { data: rollsData, error: rollsError } = await supabaseBrowserClient
        .from("coating_batch_base_rolls")
        .select(
          `
          id,
          base_fabric_roll_id,
          input_length_m,
          base_fabric_rolls:base_fabric_roll_id (
            roll_no,
            qr_code,
            length_m,
            base_fabric_orders:base_fabric_order_id (
              order_no,
              base_fabric_items:base_fabric_item_id (
                name
              )
            )
          )
        `
        )
        .eq("batch_id", batchId);

      if (rollsError) throw rollsError;

      const mapped =
        (rollsData || []).map((row: any) => {
          const roll = Array.isArray(row.base_fabric_rolls)
            ? row.base_fabric_rolls[0]
            : row.base_fabric_rolls;
          const order = roll?.base_fabric_orders
            ? Array.isArray(roll.base_fabric_orders)
              ? roll.base_fabric_orders[0]
              : roll.base_fabric_orders
            : null;
          const item = order?.base_fabric_items
            ? Array.isArray(order.base_fabric_items)
              ? order.base_fabric_items[0]
              : order.base_fabric_items
            : null;

          return {
            id: row.id,
            base_fabric_roll_id: row.base_fabric_roll_id,
            input_length_m: row.input_length_m,
            base_fabric_rolls: {
              roll_no: roll?.roll_no ?? null,
              qr_code: roll?.qr_code ?? null,
              length_m: roll?.length_m ?? 0,
              base_fabric_orders: order
                ? {
                    order_no: order.order_no ?? null,
                    base_fabric_items: item ? { name: item.name } : null,
                  }
                : null,
            },
          };
        }) || [];

      setBaseRolls(mapped);

      // Fetch chemicals
      const { data: chemData, error: chemError } = await supabaseBrowserClient
        .from("coating_batch_chemicals")
        .select("id, chemical_name, quantity, uom")
        .eq("batch_id", batchId);

      if (chemError) throw chemError;

      const chemRows: ChemicalRow[] =
        (chemData || []).map((row: any) => ({
          id: row.id,
          chemical_name: row.chemical_name || "",
          quantity: row.quantity !== null ? Number(row.quantity) : null,
          uom: row.uom || "kg",
        })) || [];

      setChemicals(chemRows.length > 0 ? chemRows : []);
    } catch (err: any) {
      setError(err.message || "Failed to load batch details");
      console.error("Error fetching batch:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function formatDate(dateString: string) {
    try {
      return new Date(dateString).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  }

  function getStatusBadgeColor(status: string) {
    switch (status) {
      case "PLANNED":
        return "bg-blue-100 text-blue-800";
      case "RUNNING":
        return "bg-yellow-100 text-yellow-800";
      case "COATED":
        return "bg-green-100 text-green-800";
      case "ROLLED":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  }

  const totalInputLength = baseRolls.reduce((sum, r) => sum + r.input_length_m, 0);
  const actualCoatedMeters =
    batch?.actual_coated_meters !== null && batch?.actual_coated_meters !== undefined
      ? batch.actual_coated_meters
      : null;
  const difference =
    actualCoatedMeters !== null ? totalInputLength - actualCoatedMeters : null;
  const yieldPct =
    actualCoatedMeters !== null && totalInputLength > 0
      ? (actualCoatedMeters / totalInputLength) * 100
      : null;

  function handleAddChemical() {
    setChemicals((prev) => [...prev, { chemical_name: "", quantity: null, uom: "kg" }]);
  }

  function handleRemoveChemical(index: number) {
    setChemicals((prev) => prev.filter((_, i) => i !== index));
  }

  function handleChemicalChange(index: number, field: keyof ChemicalRow, value: string) {
    setChemicals((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (field === "quantity") {
        row.quantity = value === "" ? null : Number(value);
      } else {
        // chemical_name or uom
        (row as any)[field] = value;
      }
      next[index] = row;
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      const trimmed = coatedMetersInput.trim();
      const parsed = trimmed === "" ? null : parseFloat(trimmed);
      const coatedMeters = Number.isNaN(parsed) ? null : parsed;
      const nextStatus =
        coatedMeters !== null ? "COATED" : batch?.status ? batch.status : "PLANNED";

      // Update coated meters
      const { error: updateBatchError } = await supabaseBrowserClient
        .from("coating_batches")
        .update({ actual_coated_meters: coatedMeters, status: nextStatus })
        .eq("id", batchId);

      console.log("Saving coated meters", { batchId, coatedMeters, updateBatchError });

      if (updateBatchError) {
        throw updateBatchError;
      }

      // Replace chemicals: delete then insert
      const { error: deleteChemError } = await supabaseBrowserClient
        .from("coating_batch_chemicals")
        .delete()
        .eq("batch_id", batchId);
      if (deleteChemError) throw deleteChemError;

      const rowsToInsert = chemicals
        .filter((row) => row.chemical_name && row.quantity !== null)
        .map((row) => ({
          batch_id: batchId,
          chemical_name: row.chemical_name,
          quantity: row.quantity,
          uom: row.uom || "kg",
        }));

      if (rowsToInsert.length > 0) {
        const { error: insertChemError } = await supabaseBrowserClient
          .from("coating_batch_chemicals")
          .insert(rowsToInsert);
        if (insertChemError) throw insertChemError;
      }

      setSuccess("Saved coated meters and chemicals.");
      setBatch((prev) =>
        prev ? { ...prev, actual_coated_meters: coatedMeters, status: nextStatus } : prev
      );
      await fetchBatchData();
    } catch (err: any) {
      setError(err.message || "Failed to save coated meters and chemicals.");
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          Loading batch details...
        </div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <BackButton href="/toolbox/finished-fabric/coating-batches" />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error || "Batch not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <BackButton href="/toolbox/finished-fabric/coating-batches" />
      <h1 className="text-3xl font-semibold text-slate-900">Coating Batch: {batch.batch_no}</h1>

      {/* Batch Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Batch No
            </label>
            <p className="mt-1 text-lg font-semibold text-slate-900">{batch.batch_no ?? "-"}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Date
            </label>
            <p className="mt-1 text-lg text-slate-900">{formatDate(batch.batch_date)}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Status
            </label>
            <p className="mt-1">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getStatusBadgeColor(batch.status)}`}
              >
                {batch.status}
              </span>
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Coating Type
            </label>
            <p className="mt-1 text-lg text-slate-900">{batch.coating_type}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Colour
            </label>
            <p className="mt-1 text-lg text-slate-900">{batch.color ?? "-"}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              GSM
            </label>
            <p className="mt-1 text-lg text-slate-900">{batch.gsm ?? "-"}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Width (mm)
            </label>
            <p className="mt-1 text-lg text-slate-900">{batch.width_mm ?? "-"}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Planned Meters
            </label>
            <p className="mt-1 text-lg text-slate-900">
              {batch.planned_meters ? `${batch.planned_meters.toFixed(2)} m` : "-"}
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Actual Coated Meters
            </label>
            <p className="mt-1 text-lg text-slate-900">
              {batch.actual_coated_meters
                ? `${batch.actual_coated_meters.toFixed(2)} m`
                : "Not recorded yet"}
            </p>
          </div>
          {batch.notes && (
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Notes
              </label>
              <p className="mt-1 text-slate-900">{batch.notes}</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Input Base Fabric Rolls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Input Base Fabric Rolls</h2>
          <p className="mt-1 text-sm text-slate-600">
            Total input length: {totalInputLength.toFixed(2)} m
          </p>
        </div>
        {baseRolls.length === 0 ? (
          <div className="p-8 text-center text-slate-600">No base rolls linked to this batch.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Roll No
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    QR
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {baseRolls.map((roll) => (
                  <tr key={roll.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                      {roll.base_fabric_rolls.roll_no ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {roll.base_fabric_rolls.qr_code ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {roll.base_fabric_rolls.base_fabric_orders?.order_no ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {roll.base_fabric_rolls.base_fabric_orders?.base_fabric_items?.name ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                      {roll.input_length_m.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Summary & Coated meters / chemicals */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900">Coated Meters &amp; Chemicals</h3>
            <p className="text-sm text-slate-600">
              Record actual coated meters and note batch-level chemical usage (no stock impact).
            </p>
          </div>
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
              {success}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Summary card */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total Input (m)
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{totalInputLength.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Actual Coated (m)
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {actualCoatedMeters !== null ? actualCoatedMeters.toFixed(2) : "Not recorded yet"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Difference (Input - Coated)
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {difference !== null ? difference.toFixed(2) : "-"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Yield %</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {yieldPct !== null ? `${yieldPct.toFixed(1)}%` : "-"}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Actual Coated Meters</label>
              <input
                type="number"
                step="0.01"
                value={coatedMetersInput}
                onChange={(e) => setCoatedMetersInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter coated meters"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Chemicals Used (optional)</h4>
                <p className="text-xs text-slate-600">
                  Batch-level usage only; does not impact stock.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={handleAddChemical}>
                Add Chemical
              </Button>
            </div>

            {chemicals.length === 0 ? (
              <div className="p-4 text-sm text-slate-600">No chemicals added.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Chemical
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                        UOM
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {chemicals.map((row, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.chemical_name}
                            onChange={(e) => handleChemicalChange(index, "chemical_name", e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Chemical code/name"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.001"
                            value={row.quantity ?? ""}
                            onChange={(e) => handleChemicalChange(index, "quantity", e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Quantity"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.uom}
                            onChange={(e) => handleChemicalChange(index, "uom", e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="kg"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveChemical(index)}
                            className="text-sm text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => router.refresh()} disabled={isSaving}>
              Reset
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Save Coated Meters &amp; Chemicals
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

