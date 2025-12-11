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
  chemical_item_id?: string;
  chemical_name: string;
  quantity: number | null;
  uom: string;
  query?: string;
}

interface AvailableChemical {
  chemical_item_id: string;
  item_name: string | null;
  remaining_for_batches: number;
}

interface FinishedRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  notes: string | null;
  produced_at: string | null;
  created_at: string | null;
}

export default function CoatingBatchDetailPage() {
  const router = useRouter();
  const params = useParams();
  const batchId = params.id as string;
  const [batch, setBatch] = useState<CoatingBatch | null>(null);
  const [baseRolls, setBaseRolls] = useState<BaseRoll[]>([]);
  const [chemicals, setChemicals] = useState<ChemicalRow[]>([]);
  const [availableChemicals, setAvailableChemicals] = useState<AvailableChemical[]>([]);
  const [openChemDropdown, setOpenChemDropdown] = useState<number | null>(null);
  const [finishedRolls, setFinishedRolls] = useState<FinishedRoll[]>([]);
  const [newRollLength, setNewRollLength] = useState<string>("50");
  const [newRollGrade, setNewRollGrade] = useState<string>("A");
  const [newRollNotes, setNewRollNotes] = useState<string>("");
  const [coatedMetersInput, setCoatedMetersInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
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

      // Fetch available chemicals issued to Coating with remaining quantity
      const { data: availableChemData, error: availableChemError } = await supabaseBrowserClient
        .from("chemicals_available_for_coating")
        .select("chemical_item_id, item_name, remaining_for_batches");

      if (availableChemError) throw availableChemError;
      const availableList: AvailableChemical[] =
        (availableChemData || [])
          .map((row: any) => ({
            chemical_item_id: row.chemical_item_id,
            item_name: row.item_name ?? null,
            remaining_for_batches: Number(row.remaining_for_batches ?? 0),
          }))
          .filter((row) => row.remaining_for_batches > 0) || [];
      setAvailableChemicals(availableList);

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
        .select("id, chemical_item_id, chemical_name, quantity, uom")
        .eq("batch_id", batchId);

      if (chemError) throw chemError;

      const chemRows: ChemicalRow[] =
        (chemData || []).map((row: any) => {
          return {
            id: row.id,
            chemical_item_id: row.chemical_item_id ?? undefined,
            chemical_name: row.chemical_name || "",
            quantity: row.quantity !== null ? Number(row.quantity) : null,
            uom: row.uom || "kg",
            query: row.chemical_name || "",
          };
        }) || [];

      setChemicals(chemRows.length > 0 ? chemRows : []);

      // Fetch finished rolls
      const { data: finishedData, error: finishedError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, length_m, grade, notes, produced_at, created_at")
        .eq("batch_id", batchId)
        .order("produced_at", { ascending: true });

      if (finishedError) throw finishedError;

      const finishedRows: FinishedRoll[] =
        (finishedData || []).map((row: any) => ({
          id: row.id,
          roll_no: row.roll_no ?? null,
          length_m: Number(row.length_m || 0),
          grade: row.grade ?? null,
          notes: row.notes ?? null,
          produced_at: row.produced_at ?? null,
          created_at: row.created_at ?? null,
        })) || [];
      setFinishedRolls(finishedRows);
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

  const isCompleted = batch?.status === "COMPLETED";
  const totalFinished = finishedRolls.reduce((sum, r) => sum + (r.length_m || 0), 0);
  const gradeSum = (grade: string) =>
    finishedRolls
      .filter((r) => r.grade === grade)
      .reduce((sum, r) => sum + (r.length_m || 0), 0);
  const aMeters = gradeSum("A");
  const bMeters = gradeSum("B");
  const cMeters = gradeSum("C");
  const scrapMeters = gradeSum("SCRAP");

  const percentOfCoated = (val: number) =>
    actualCoatedMeters && actualCoatedMeters > 0 ? (val / actualCoatedMeters) * 100 : null;
  const yieldVsCoated = percentOfCoated(totalFinished);
  const bPercent = percentOfCoated(bMeters);
  const cPercent = percentOfCoated(cMeters);
  const scrapPercent = percentOfCoated(scrapMeters);
  async function handleCompleteRolling() {
    if (!batch) return;
    setError(null);
    setSuccess(null);
    const actualCoated = batch.actual_coated_meters || 0;
    if (actualCoated <= 0) {
      setError("Cannot complete: coated meters not recorded.");
      return;
    }
    if (finishedRolls.length === 0) {
      setError("Cannot complete: no finished rolls recorded.");
      return;
    }
    const diff = Math.abs(totalFinished - actualCoated);
    const tolerance = Math.max(5, 0.02 * actualCoated);
    if (diff > tolerance) {
      const proceed = window.confirm(
        `Total finished meters differ from coated meters by ${diff.toFixed(
          2
        )} m. Are you sure you want to complete this batch?`
      );
      if (!proceed) return;
    }

    setIsCompleting(true);
    try {
      const { error: updateError } = await supabaseBrowserClient
        .from("coating_batches")
        .update({ status: "COMPLETED" })
        .eq("id", batchId);
      if (updateError) throw updateError;
      setBatch((prev) => (prev ? { ...prev, status: "COMPLETED" } : prev));
      setSuccess("Rolling completed for this batch.");
    } catch (err: any) {
      setError(err.message || "Failed to complete rolling.");
    } finally {
      setIsCompleting(false);
    }
  }

  function handleAddChemical() {
    if (isCompleted) return;
    setChemicals((prev) => [
      ...prev,
      { chemical_item_id: undefined, chemical_name: "", quantity: null, uom: "kg", query: "" },
    ]);
  }

  function handleRemoveChemical(index: number) {
    if (isCompleted) return;
    setChemicals((prev) => prev.filter((_, i) => i !== index));
  }

  function handleChemicalChange(index: number, field: keyof ChemicalRow, value: string) {
    if (isCompleted) return;
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

  function handleChemicalSelect(index: number, chemicalItemId: string) {
    if (isCompleted) return;
    const selected = availableChemicals.find((c) => c.chemical_item_id === chemicalItemId);
    setChemicals((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      row.chemical_item_id = chemicalItemId;
      row.chemical_name = selected?.item_name || "";
      row.uom = row.uom || "kg";
      row.query = row.chemical_name;
      next[index] = row;
      return next;
    });
    setOpenChemDropdown(null);
  }

  async function handleAddFinishedRoll(e: React.FormEvent) {
    if (isCompleted) {
      setError("This batch is completed; no further changes are allowed.");
      return;
    }
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const lengthVal = parseFloat(newRollLength);
    if (Number.isNaN(lengthVal) || lengthVal <= 0) {
      setError("Length must be greater than zero.");
      return;
    }
    if (!newRollGrade) {
      setError("Please select a grade.");
      return;
    }

    const actualCoated = batch?.actual_coated_meters || 0;
    const existingTotal = finishedRolls.reduce((sum, r) => sum + Number(r.length_m || 0), 0);
    const projected = existingTotal + lengthVal;
    if (actualCoated > 0 && projected > actualCoated + 0.001) {
      setError("Cannot add this roll. Total rolled meters would exceed coated meters.");
      return;
    }

    try {
      const { data: inserted, error: insertError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .insert({
          batch_id: batchId,
          length_m: lengthVal,
          grade: newRollGrade,
          notes: newRollNotes || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setFinishedRolls((prev) => [
        ...prev,
        {
          id: inserted.id,
          roll_no: inserted.roll_no ?? null,
          length_m: Number(inserted.length_m || 0),
          grade: inserted.grade ?? null,
          notes: inserted.notes ?? null,
          produced_at: inserted.produced_at ?? null,
          created_at: inserted.created_at ?? null,
        },
      ]);

      // Update batch status to ROLLED if not already
      if (batch && batch.status !== "ROLLED") {
        const { error: statusError } = await supabaseBrowserClient
          .from("coating_batches")
          .update({ status: "ROLLED" })
          .eq("id", batchId);
        if (!statusError) {
          setBatch((prev) => (prev ? { ...prev, status: "ROLLED" } : prev));
        }
      }

      setNewRollLength("50");
      setNewRollGrade("A");
      setNewRollNotes("");
      setSuccess("Finished roll added.");
    } catch (err: any) {
      setError(err.message || "Failed to add finished roll.");
    }
  }

  async function handleSave(e: React.FormEvent) {
    if (isCompleted) {
      setError("This batch is completed; no further changes are allowed.");
      return;
    }
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

      // Insert only new chemicals (id undefined)
      const newRows = chemicals.filter(
        (row) => !row.id && row.chemical_item_id && row.chemical_name && row.quantity !== null
      );

      // Validate new chemical rows against remaining availability
      const existingAllocatedByChem = new Map<string, number>();
      chemicals.forEach((row) => {
        if (row.id && row.chemical_item_id && row.quantity !== null) {
          existingAllocatedByChem.set(
            row.chemical_item_id,
            (existingAllocatedByChem.get(row.chemical_item_id) || 0) + Number(row.quantity || 0)
          );
        }
      });

      const availableMap = new Map(
        availableChemicals.map((c) => [c.chemical_item_id, c])
      );
      const pendingByChem = new Map<string, number>();
      newRows.forEach((row) => {
        const key = row.chemical_item_id as string;
        pendingByChem.set(key, (pendingByChem.get(key) || 0) + Number(row.quantity || 0));
      });

      for (const [chemId, pendingQty] of pendingByChem.entries()) {
        const available = availableMap.get(chemId);
        const remaining = available?.remaining_for_batches ?? 0;
        if (!available || remaining <= 0) {
          setError(
            "No remaining stock for this chemical has been issued to Coating. Please issue stock first."
          );
          setIsSaving(false);
          return;
        }
        if (pendingQty > remaining + 0.0001) {
          const name = available.item_name || "this chemical";
          setError(
            `You are trying to use more ${name} than has been issued to Coating. Remaining available: ${remaining}.`
          );
          setIsSaving(false);
          return;
        }
      }

      let insertedRows: any[] = [];
      if (newRows.length > 0) {
        const rowsToInsert = newRows.map((row) => ({
          batch_id: batchId,
          chemical_item_id: row.chemical_item_id,
          chemical_name: row.chemical_name,
          quantity: row.quantity,
          uom: row.uom || "kg",
        }));

        const { data: inserted, error: insertChemError } = await supabaseBrowserClient
          .from("coating_batch_chemicals")
          .insert(rowsToInsert)
          .select();
        if (insertChemError) throw insertChemError;
        insertedRows = inserted || [];
      }

      if (trimmed === (batch?.actual_coated_meters?.toString() ?? "") && newRows.length === 0) {
        setSuccess("Nothing to save.");
        setIsSaving(false);
        return;
      }

      setSuccess("Saved coated meters and chemicals.");
      setBatch((prev) =>
        prev ? { ...prev, actual_coated_meters: coatedMeters, status: nextStatus } : prev
      );
      if (insertedRows.length > 0) {
        setChemicals((prev) => [
          ...prev,
          ...insertedRows.map((row: any) => ({
            id: row.id,
            chemical_item_id: row.chemical_item_id ?? undefined,
            chemical_name: row.chemical_name || "",
            quantity: row.quantity !== null ? Number(row.quantity) : null,
            uom: row.uom || "kg",
            query: row.chemical_name || "",
          })),
        ]);
      }
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
      <div className="flex items-center justify-between">
        <BackButton href="/toolbox/finished-fabric/coating-batches" />
        <div className="flex gap-3 print:hidden">
          <Button
            variant="secondary"
            onClick={() =>
              router.push(`/toolbox/finished-fabric/coating-batches/${batch.id}/report`)
            }
          >
            Print Coating Batch Report
          </Button>
          {finishedRolls.length > 0 && (
            <Button
              variant="secondary"
              onClick={() =>
                router.push(`/toolbox/finished-fabric/coating-batches/${batch.id}/rolling-report`)
              }
            >
              Print Rolling Report
            </Button>
          )}
        </div>
      </div>
      <h1 className="text-3xl font-semibold text-slate-900">Coating Batch: {batch.batch_no}</h1>
      {isCompleted && (
        <p className="text-sm font-semibold text-green-700">
          This batch is completed; no further changes are allowed.
        </p>
      )}

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
              <Button type="button" variant="secondary" onClick={handleAddChemical} disabled={isCompleted}>
                Add Chemical
              </Button>
            </div>

            {chemicals.length === 0 ? (
              <div className="p-4 text-sm text-slate-600">No chemicals added.</div>
            ) : (
              <div>
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
                        <div className="relative">
                          <input
                            type="text"
                            value={row.query ?? row.chemical_name}
                            onChange={(e) => {
                              if (row.id || isCompleted) return; // existing rows are read-only
                              handleChemicalChange(index, "chemical_name", e.target.value);
                              setChemicals((prev) => {
                                const next = [...prev];
                                const r = { ...next[index] };
                                r.query = e.target.value;
                                if (e.target.value.trim() === "") {
                                  r.chemical_item_id = undefined;
                                  r.chemical_name = "";
                                }
                                next[index] = r;
                                return next;
                              });
                              setOpenChemDropdown(index);
                            }}
                            onFocus={() => !row.id && !isCompleted && setOpenChemDropdown(index)}
                            onBlur={() =>
                              setTimeout(
                                () => setOpenChemDropdown((curr) => (curr === index ? null : curr)),
                                150
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Chemical code/name"
                            autoComplete="off"
                            readOnly={!!row.id || isCompleted}
                          />
                          {openChemDropdown === index && (row.query ?? "").trim().length > 0 && !isCompleted && (
                            <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                              <ul className="max-h-48 overflow-auto text-sm text-slate-800">
                                {availableChemicals
                                  .filter((c) =>
                                    (c.item_name || "")
                                      .toLowerCase()
                                      .includes((row.query ?? "").toLowerCase())
                                  )
                                  .map((chem) => (
                                    <li
                                      key={chem.chemical_item_id}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        handleChemicalSelect(index, chem.chemical_item_id);
                                      }}
                                      className="cursor-pointer px-3 py-2 hover:bg-slate-100"
                                    >
                                      {chem.item_name || "Unnamed"} (Remaining: {chem.remaining_for_batches})
                                    </li>
                                  ))}
                                {availableChemicals.filter((c) =>
                                  (c.item_name || "")
                                    .toLowerCase()
                                    .includes((row.query ?? "").toLowerCase())
                                ).length === 0 && (
                                  <li className="px-3 py-2 text-slate-500">
                                    {availableChemicals.length === 0
                                      ? "No chemicals available for Coating"
                                      : "No matches"}
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.001"
                            value={row.quantity ?? ""}
                            onChange={(e) => handleChemicalChange(index, "quantity", e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Quantity"
                            readOnly={!!row.id || isCompleted}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.uom}
                            onChange={(e) => handleChemicalChange(index, "uom", e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="kg"
                            readOnly={!!row.id || isCompleted}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                  {!row.id && !isCompleted && (
                    <button
                      type="button"
                      onClick={() => handleRemoveChemical(index)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
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
            <Button type="submit" variant="primary" isLoading={isSaving} disabled={isCompleted}>
              Save Coated Meters &amp; Chemicals
            </Button>
          </div>
        </form>
      </motion.div>

      {/* Finished rolls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Finished Rolls (Rolling & Inspection)</h3>
            <p className="text-sm text-slate-600">
              Capture all 50m and short rolls for this coated batch, with grade.
            </p>
          </div>
          {batch && batch.status !== "COMPLETED" && (batch.status === "ROLLED" || batch.status === "COATED") && (
            <Button
              variant="primary"
              onClick={handleCompleteRolling}
              disabled={isCompleting || finishedRolls.length === 0 || !actualCoatedMeters}
            >
              {isCompleting ? "Completing..." : "Complete Rolling"}
            </Button>
          )}
        </div>

        {/* Summary */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total Finished (m)" value={totalFinished.toFixed(2)} />
          <SummaryCard
            label="Yield vs Coated"
            value={yieldVsCoated !== null ? `${yieldVsCoated.toFixed(1)}%` : "-"}
          />
          <SummaryCard
            label="B-Grade"
            value={`${bMeters.toFixed(2)} m${bPercent !== null ? ` (${bPercent.toFixed(1)}%)` : ""}`}
          />
          <SummaryCard
            label="C-Grade"
            value={`${cMeters.toFixed(2)} m${cPercent !== null ? ` (${cPercent.toFixed(1)}%)` : ""}`}
          />
          <SummaryCard
            label="Scrap"
            value={`${scrapMeters.toFixed(2)} m${scrapPercent !== null ? ` (${scrapPercent.toFixed(1)}%)` : ""}`}
          />
        </div>

        {/* Add roll form */}
        <form onSubmit={handleAddFinishedRoll} className="mt-6 grid gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Length (m)</label>
            <input
              type="number"
              step="0.01"
              value={newRollLength}
              onChange={(e) => setNewRollLength(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isCompleted}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Grade</label>
            <select
              value={newRollGrade}
              onChange={(e) => setNewRollGrade(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isCompleted}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="SCRAP">SCRAP</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</label>
            <input
              type="text"
              value={newRollNotes}
              onChange={(e) => setNewRollNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isCompleted}
              placeholder="Short roll, inspection notes..."
            />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <Button type="submit" variant="primary" disabled={isCompleted}>
              Add Roll
            </Button>
          </div>
        </form>

        {/* Rolls table */}
        <div className="mt-6 overflow-x-auto">
          {finishedRolls.length === 0 ? (
            <p className="text-sm text-slate-600">No finished rolls recorded yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <Th>Roll No</Th>
                  <Th>Length (m)</Th>
                  <Th>Grade</Th>
                  <Th>Notes</Th>
                  <Th>Produced At</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {finishedRolls.map((roll) => (
                  <tr key={roll.id}>
                    <Td>{roll.roll_no ?? "-"}</Td>
                    <Td>{roll.length_m?.toFixed(2)}</Td>
                    <Td>{roll.grade ?? "-"}</Td>
                    <Td>{roll.notes ?? "-"}</Td>
                    <Td>
                      {roll.produced_at
                        ? new Date(roll.produced_at).toLocaleString("en-ZA")
                        : roll.created_at
                        ? new Date(roll.created_at).toLocaleString("en-ZA")
                        : "-"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-sm text-slate-700">{children}</td>;
}

