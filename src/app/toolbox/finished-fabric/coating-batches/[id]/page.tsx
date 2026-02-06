"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";
import { generateQRCode } from "@/lib/qr/generateQRCode";

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
  base_fabric_rolls: {
    roll_no: string | null;
    qr_code: string | null;
    length_m: number;
    base_fabric_orders: {
      order_no: string | null;
      base_fabric_items: {
        name: string | null;
      } | null;
    } | null;
  };
  input_length_m: number;
}

interface FinishedRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  notes: string | null;
  created_at: string;
}

interface BatchChemical {
  id: string;
  chemical_name: string | null;
  quantity: number | null;
  uom: string | null;
  chemical_item_id: string | null;
}

interface AvailableChemical {
  chemical_item_id: string;
  item_name: string;
  uom: string;
  total_issued_to_coating: number;
  total_allocated_to_batches: number;
  remaining_for_batches: number;
}

export default function CoatingBatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.id as string;

  const [batch, setBatch] = useState<CoatingBatch | null>(null);
  const [baseRolls, setBaseRolls] = useState<BaseRoll[]>([]);
  const [finishedRolls, setFinishedRolls] = useState<FinishedRoll[]>([]);
  const [batchChemicals, setBatchChemicals] = useState<BatchChemical[]>([]);
  const [availableChemicals, setAvailableChemicals] = useState<AvailableChemical[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add finished roll form state
  const [newRollLength, setNewRollLength] = useState("50");
  const [newRollGrade, setNewRollGrade] = useState("A");
  const [newRollNotes, setNewRollNotes] = useState("");
  const [isAddingRoll, setIsAddingRoll] = useState(false);

  // Add chemical form state
  const [newChemicalName, setNewChemicalName] = useState("");
  const [newChemicalQuantity, setNewChemicalQuantity] = useState("");
  const [newChemicalUom, setNewChemicalUom] = useState("kg");
  const [isAddingChemical, setIsAddingChemical] = useState(false);
  const [chemicalSearchQuery, setChemicalSearchQuery] = useState("");
  const [showChemicalSuggestions, setShowChemicalSuggestions] = useState(false);
  const [selectedChemicalItemId, setSelectedChemicalItemId] = useState<string | null>(null);
  const [actualCoatedMeters, setActualCoatedMeters] = useState("");
  const [isUpdatingCoatedMeters, setIsUpdatingCoatedMeters] = useState(false);
  const [shortageReason, setShortageReason] = useState("");
  const [showShortageModal, setShowShortageModal] = useState(false);
  const [pendingCoatedMeters, setPendingCoatedMeters] = useState<number | null>(null);

  useEffect(() => {
    if (batchId) {
      fetchData();
    }
  }, [batchId]);

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch batch
      const { data: batchData, error: batchError } = await supabaseBrowserClient
        .from("coating_batches")
        .select(
          "id, batch_no, batch_date, coating_type, width_mm, planned_meters, color, gsm, actual_coated_meters, status, notes, fabric_type_id, gsm_option_id, color_option_id, width_option_id"
        )
        .eq("id", batchId)
        .single();
      if (batchError) throw batchError;
      setBatch(batchData as CoatingBatch);
      setActualCoatedMeters(batchData.actual_coated_meters?.toString() || "");

      // Fetch base rolls
      const { data: baseRollsData, error: baseRollsError } = await supabaseBrowserClient
        .from("coating_batch_base_rolls")
        .select(
          `
          id,
          input_length_m,
          base_fabric_rolls (
            roll_no,
            qr_code,
            length_m,
            base_fabric_orders (
              order_no,
              base_fabric_items (
                name
              )
            )
          )
        `
        )
        .eq("batch_id", batchId);

      if (baseRollsError) throw baseRollsError;
      
      // Map the data to handle Supabase's array returns for relations
      const mappedBaseRolls: BaseRoll[] = (baseRollsData || []).map((row: any) => {
        const roll = Array.isArray(row.base_fabric_rolls) 
          ? row.base_fabric_rolls[0] 
          : row.base_fabric_rolls;
        const order = roll?.base_fabric_orders 
          ? (Array.isArray(roll.base_fabric_orders) ? roll.base_fabric_orders[0] : roll.base_fabric_orders)
          : null;
        const item = order?.base_fabric_items
          ? (Array.isArray(order.base_fabric_items) ? order.base_fabric_items[0] : order.base_fabric_items)
          : null;
        
        return {
          id: row.id,
          input_length_m: Number(row.input_length_m || 0),
          base_fabric_rolls: {
            roll_no: roll?.roll_no ?? null,
            qr_code: roll?.qr_code ?? null,
            length_m: Number(roll?.length_m || 0),
            base_fabric_orders: order ? {
              order_no: order.order_no ?? null,
              base_fabric_items: item ? {
                name: item.name ?? null,
              } : null,
            } : null,
          },
        };
      });
      
      setBaseRolls(mappedBaseRolls);

      // Fetch finished rolls
      const { data: rollsData, error: rollsError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, length_m, grade, notes, created_at")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false });

      if (rollsError) throw rollsError;
      setFinishedRolls(
        (rollsData || []).map((row: any) => ({
          id: row.id,
          roll_no: row.roll_no ?? null,
          length_m: Number(row.length_m || 0),
          grade: row.grade ?? null,
          notes: row.notes ?? null,
          created_at: row.created_at,
        })) as FinishedRoll[]
      );

      // Fetch batch chemicals
      const { data: chemData, error: chemError } = await supabaseBrowserClient
        .from("coating_batch_chemicals")
        .select("id, chemical_name, quantity, uom, chemical_item_id")
        .eq("batch_id", batchId);

      if (chemError) throw chemError;
      setBatchChemicals(
        (chemData || []).map((row: any) => ({
          id: row.id,
          chemical_name: row.chemical_name ?? null,
          quantity: row.quantity !== null ? Number(row.quantity) : null,
          uom: row.uom ?? null,
          chemical_item_id: row.chemical_item_id ?? null,
        })) as BatchChemical[]
      );

      // Fetch available chemicals (issued to coating) with UOM from dye_items
      const { data: availChemData, error: availChemError } = await supabaseBrowserClient
        .from("chemicals_available_for_coating")
        .select("chemical_item_id, item_name, total_issued_to_coating, total_allocated_to_batches, remaining_for_batches")
        .gt("remaining_for_batches", 0)
        .order("item_name", { ascending: true });

      if (availChemError) throw availChemError;

      // Fetch UOM for each chemical from dye_items
      const chemicalIds = (availChemData || []).map((row: any) => row.chemical_item_id).filter(Boolean);
      let uomMap: Record<string, string> = {};
      
      if (chemicalIds.length > 0) {
        const { data: dyeItemsData, error: dyeItemsError } = await supabaseBrowserClient
          .from("dye_items")
          .select("id, uom")
          .in("id", chemicalIds);

        if (!dyeItemsError && dyeItemsData) {
          dyeItemsData.forEach((item: any) => {
            uomMap[item.id] = item.uom || "kg";
          });
        }
      }

      setAvailableChemicals(
        (availChemData || []).map((row: any) => ({
          chemical_item_id: row.chemical_item_id,
          item_name: row.item_name ?? "",
          uom: uomMap[row.chemical_item_id] || "kg",
          total_issued_to_coating: Number(row.total_issued_to_coating || 0),
          total_allocated_to_batches: Number(row.total_allocated_to_batches || 0),
          remaining_for_batches: Number(row.remaining_for_batches || 0),
        })) as AvailableChemical[]
      );
    } catch (err: any) {
      console.error("Failed to load batch", err);
      setError(err.message || "Failed to load batch.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddFinishedRoll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const lengthVal = parseFloat(newRollLength);
    if (!newRollLength || isNaN(lengthVal) || lengthVal <= 0) {
      setError("Please enter a valid length (m)");
      return;
    }

    // Check if rolling is complete
    if (isRollingComplete) {
      setError("Rolling is complete. Total rolled quantity matches coated quantity. Please complete production.");
      return;
    }

    // Check if adding this roll would exceed coated quantity
    const actualCoated = batch?.actual_coated_meters ?? null;
    if (actualCoated !== null && totalFinishedLength + lengthVal > actualCoated) {
      const remaining = actualCoated - totalFinishedLength;
      setError(
        `Cannot add roll. Total rolled would exceed coated quantity. Remaining: ${remaining.toFixed(2)} m`
      );
      return;
    }

    setIsAddingRoll(true);
    try {
      // Generate QR code for the new finished roll
      const qrCode = generateQRCode("finished_fabric");

      const { data: inserted, error: insertError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .insert({
          batch_id: batchId,
          length_m: lengthVal,
          grade: newRollGrade || null,
          notes: newRollNotes || null,
          qr_code: qrCode,
          // Use catalog IDs from batch
          fabric_type_id: (batch as any)?.fabric_type_id || null,
          gsm_option_id: (batch as any)?.gsm_option_id || null,
          color_option_id: (batch as any)?.color_option_id || null,
          width_option_id: (batch as any)?.width_option_id || null,
          // Backward compatibility: still store text fields
          color: batch?.color || null,
          gsm: batch?.gsm || null,
          coating_type: batch?.coating_type || null,
          status: "AWAITING_RECEIPT",
          current_location: "COATING",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to local state without refreshing
      const newRoll: FinishedRoll = {
        id: inserted.id,
        roll_no: inserted.roll_no ?? null,
        length_m: Number(inserted.length_m || 0),
        grade: inserted.grade ?? null,
        notes: inserted.notes ?? null,
        created_at: inserted.created_at || new Date().toISOString(),
      };
      setFinishedRolls([newRoll, ...finishedRolls]);

      setSuccess("Finished roll added successfully.");
      setNewRollLength("50");
      setNewRollGrade("A");
      setNewRollNotes("");
    } catch (err: any) {
      console.error("Failed to add finished roll", err);
      setError(err.message || "Failed to add finished roll.");
    } finally {
      setIsAddingRoll(false);
    }
  }

  async function handleUpdateStatus(newStatus: string) {
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabaseBrowserClient
        .from("coating_batches")
        .update({ status: newStatus })
        .eq("id", batchId);

      if (updateError) throw updateError;

      setSuccess(`Batch status updated to ${newStatus}.`);
      await fetchData();
    } catch (err: any) {
      console.error("Failed to update status", err);
      setError(err.message || "Failed to update status.");
    }
  }

  async function handleCompleteProduction() {
    if (!isRollingComplete) {
      setError("Cannot complete production. Rolling quantity must match coated quantity.");
      return;
    }

    if (!confirm("Are you sure you want to complete production? This will close the batch and make it read-only.")) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabaseBrowserClient
        .from("coating_batches")
        .update({ status: "COMPLETED" })
        .eq("id", batchId);

      if (updateError) throw updateError;

      setSuccess("Production completed successfully. Batch is now read-only.");
      await fetchData();
    } catch (err: any) {
      console.error("Failed to complete production", err);
      setError(err.message || "Failed to complete production.");
    }
  }

  async function handleAddChemical(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newChemicalName.trim()) {
      setError("Please enter a chemical name");
      return;
    }

    const quantityVal = parseFloat(newChemicalQuantity);
    if (!newChemicalQuantity || isNaN(quantityVal) || quantityVal <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    setIsAddingChemical(true);
    try {
      const { data: inserted, error: insertError } = await supabaseBrowserClient
        .from("coating_batch_chemicals")
        .insert({
          batch_id: batchId,
          chemical_name: newChemicalName.trim(),
          quantity: quantityVal,
          uom: newChemicalUom || "kg",
          chemical_item_id: selectedChemicalItemId || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to local state without refreshing
      const newChemical: BatchChemical = {
        id: inserted.id,
        chemical_name: inserted.chemical_name,
        quantity: inserted.quantity !== null ? Number(inserted.quantity) : null,
        uom: inserted.uom,
        chemical_item_id: inserted.chemical_item_id,
      };
      setBatchChemicals([...batchChemicals, newChemical]);

      // Update available chemicals - reduce remaining quantity
      if (selectedChemicalItemId) {
        setAvailableChemicals((prev) =>
          prev.map((chem) => {
            if (chem.chemical_item_id === selectedChemicalItemId) {
              return {
                ...chem,
                total_allocated_to_batches: chem.total_allocated_to_batches + quantityVal,
                remaining_for_batches: chem.remaining_for_batches - quantityVal,
              };
            }
            return chem;
          })
        );
      }

      setSuccess("Chemical added successfully.");
      setNewChemicalName("");
      setNewChemicalQuantity("");
      setNewChemicalUom("kg");
      setSelectedChemicalItemId(null);
      setChemicalSearchQuery("");
      setShowChemicalSuggestions(false);
    } catch (err: any) {
      console.error("Failed to add chemical", err);
      setError(err.message || "Failed to add chemical.");
    } finally {
      setIsAddingChemical(false);
    }
  }

  function handlePullFromIssued(chemical: AvailableChemical) {
    setNewChemicalName(chemical.item_name);
    setNewChemicalQuantity(chemical.remaining_for_batches.toString());
    setNewChemicalUom(chemical.uom);
    setSelectedChemicalItemId(chemical.chemical_item_id);
    setChemicalSearchQuery("");
    setShowChemicalSuggestions(false);
  }

  // Filter available chemicals based on search query
  const filteredChemicals = availableChemicals.filter((chem) =>
    chem.item_name.toLowerCase().includes(chemicalSearchQuery.toLowerCase())
  );

  function handleChemicalNameChange(value: string) {
    setNewChemicalName(value);
    setChemicalSearchQuery(value);
    setShowChemicalSuggestions(value.length > 0 && filteredChemicals.length > 0);
    // Clear selected item ID if user is typing manually
    if (!filteredChemicals.some((c) => c.item_name === value)) {
      setSelectedChemicalItemId(null);
    }
  }

  function handleChemicalNameFocus() {
    if (chemicalSearchQuery.length > 0 && filteredChemicals.length > 0) {
      setShowChemicalSuggestions(true);
    }
  }

  function handleChemicalNameBlur() {
    // Delay hiding suggestions to allow click events
    setTimeout(() => setShowChemicalSuggestions(false), 200);
  }

  async function handleUpdateActualCoatedMeters() {
    const metersVal = parseFloat(actualCoatedMeters);
    if (isNaN(metersVal) || metersVal < 0) {
      setError("Please enter a valid meters value");
      return;
    }

    // Check for shortage
    if (metersVal < totalInputLength) {
      const shortage = totalInputLength - metersVal;
      setPendingCoatedMeters(metersVal);
      setShowShortageModal(true);
      return;
    }

    await saveActualCoatedMeters(metersVal, null);
  }

  async function saveActualCoatedMeters(metersVal: number, shortageReasonText: string | null) {
    setIsUpdatingCoatedMeters(true);
    setError(null);
    setSuccess(null);

    try {
      const updateData: any = { actual_coated_meters: metersVal };
      if (shortageReasonText) {
        updateData.notes = batch?.notes
          ? `${batch.notes}\n\nShortage Reason: ${shortageReasonText}`
          : `Shortage Reason: ${shortageReasonText}`;
      }

      const { error: updateError } = await supabaseBrowserClient
        .from("coating_batches")
        .update(updateData)
        .eq("id", batchId);

      if (updateError) throw updateError;

      setSuccess("Actual coated meters updated successfully.");
      setShowShortageModal(false);
      setShortageReason("");
      setPendingCoatedMeters(null);
      await fetchData();
    } catch (err: any) {
      console.error("Failed to update actual coated meters", err);
      setError(err.message || "Failed to update actual coated meters.");
    } finally {
      setIsUpdatingCoatedMeters(false);
    }
  }

  async function handleConfirmShortage() {
    if (!shortageReason.trim()) {
      setError("Please enter a reason for the shortage");
      return;
    }

    if (pendingCoatedMeters !== null) {
      await saveActualCoatedMeters(pendingCoatedMeters, shortageReason.trim());
    }
  }

  async function handleDeleteChemical(chemicalId: string) {
    if (!confirm("Are you sure you want to remove this chemical from the batch?")) {
      return;
    }

    setError(null);
    setSuccess(null);

    // Find the chemical to get its details for restoring available quantity
    const chemicalToDelete = batchChemicals.find((c) => c.id === chemicalId);
    const chemicalItemId = chemicalToDelete?.chemical_item_id;
    const quantityToRestore = chemicalToDelete?.quantity || 0;

    try {
      const { error: deleteError } = await supabaseBrowserClient
        .from("coating_batch_chemicals")
        .delete()
        .eq("id", chemicalId);

      if (deleteError) throw deleteError;

      // Remove from local state
      setBatchChemicals(batchChemicals.filter((c) => c.id !== chemicalId));

      // Restore available quantity if it was linked to a chemical item
      if (chemicalItemId) {
        setAvailableChemicals((prev) =>
          prev.map((chem) => {
            if (chem.chemical_item_id === chemicalItemId) {
              return {
                ...chem,
                total_allocated_to_batches: chem.total_allocated_to_batches - quantityToRestore,
                remaining_for_batches: chem.remaining_for_batches + quantityToRestore,
              };
            }
            return chem;
          })
        );
      }

      setSuccess("Chemical removed successfully.");
    } catch (err: any) {
      console.error("Failed to delete chemical", err);
      setError(err.message || "Failed to delete chemical.");
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
      case "COMPLETED":
        return "bg-teal-100 text-teal-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          Loading batch...
        </div>
      </div>
    );
  }

  if (error && !batch) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <BackButton href="/toolbox/finished-fabric/coating-batches" />
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!batch) return null;

  const totalInputLength = baseRolls.reduce((sum, r) => sum + (r.input_length_m || 0), 0);
  const totalFinishedLength = finishedRolls.reduce((sum, r) => sum + r.length_m, 0);
  const actualCoated = batch.actual_coated_meters ?? null;

  // Calculate grade quantities
  const gradeSum = (grade: string) =>
    finishedRolls.filter((r) => r.grade === grade).reduce((sum, r) => sum + r.length_m, 0);
  const aMeters = gradeSum("A");
  const bMeters = gradeSum("B");
  const cMeters = gradeSum("C");
  const scrapMeters = gradeSum("SCRAP");

  // Calculate yield: A grade vs (B + C + Scrap)
  const nonAGradeTotal = bMeters + cMeters + scrapMeters;
  const yieldPercent =
    nonAGradeTotal > 0 && aMeters > 0
      ? (aMeters / (aMeters + nonAGradeTotal)) * 100
      : nonAGradeTotal === 0 && aMeters > 0
        ? 100
        : null;

  // Calculate percentages of coated
  const percentOfCoated = (val: number) =>
    actualCoated !== null && actualCoated > 0 ? (val / actualCoated) * 100 : null;
  const aPercent = percentOfCoated(aMeters);
  const bPercent = percentOfCoated(bMeters);
  const cPercent = percentOfCoated(cMeters);
  const scrapPercent = percentOfCoated(scrapMeters);

  // Check if rolling is complete
  const isRollingComplete = actualCoated !== null && totalFinishedLength >= actualCoated;
  const canAddMoreRolls = !isRollingComplete && batch.status !== "COMPLETED";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <BackButton href="/toolbox/finished-fabric/coating-batches" />
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">
            Coating Batch: {batch.batch_no ?? "N/A"}
          </h1>
          <p className="mt-2 text-slate-600">Batch Date: {formatDate(batch.batch_date)}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/toolbox/finished-fabric/coating-batches/${batchId}/report`}>
            <Button variant="secondary">View Report</Button>
          </Link>
          <Link href={`/toolbox/finished-fabric/coating-batches/${batchId}/rolling-report`}>
            <Button variant="secondary">Rolling Report</Button>
          </Link>
        </div>
      </div>

      {batch.status === "COMPLETED" && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-teal-800">
          <p className="font-semibold">Production Completed</p>
          <p className="text-sm">This batch is now read-only. Reports can be accessed via the buttons above.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          {success}
        </div>
      )}

      {/* Batch Info */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Batch Information</h2>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getStatusBadgeColor(batch.status)}`}
          >
            {batch.status}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Coating Type</p>
            <p className="text-slate-900">{batch.coating_type}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Colour</p>
            <p className="text-slate-900">{batch.color ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">GSM</p>
            <p className="text-slate-900">{batch.gsm ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Width (mm)</p>
            <p className="text-slate-900">{batch.width_mm ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Planned Meters</p>
            <p className="text-slate-900">{batch.planned_meters?.toFixed(2) ?? "-"}</p>
          </div>
        </div>
        
        {/* Actual Coated Meters Input */}
        {batch.status !== "COMPLETED" && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Actual Coated Meters (before rolling) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={actualCoatedMeters}
                  onChange={(e) => setActualCoatedMeters(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="e.g. 500.00"
                />
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={handleUpdateActualCoatedMeters}
                disabled={isUpdatingCoatedMeters}
              >
                {isUpdatingCoatedMeters ? "Updating..." : "Update"}
              </Button>
            </div>
            {batch.actual_coated_meters !== null && (
              <p className="mt-2 text-xs text-slate-600">
                Current: {batch.actual_coated_meters.toFixed(2)} m
              </p>
            )}
          </div>
        )}
        {batch.status === "COMPLETED" && batch.actual_coated_meters !== null && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-700">Actual Coated Meters</p>
            <p className="text-slate-900">{batch.actual_coated_meters.toFixed(2)} m</p>
          </div>
        )}
        {batch.notes && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-700">Notes</p>
            <p className="text-slate-900">{batch.notes}</p>
          </div>
        )}

        {/* Status Update Buttons */}
        <div className="mt-6 flex flex-wrap gap-2">
          {batch.status === "PLANNED" && (
            <Button variant="primary" onClick={() => handleUpdateStatus("RUNNING")}>
              Start Batch
            </Button>
          )}
          {batch.status === "ROLLED" && (
            <Button variant="primary" onClick={() => handleUpdateStatus("COMPLETED")}>
              Mark as Completed
            </Button>
          )}
        </div>
      </motion.section>

      {/* Calculated Fields - Rolling Summary */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Rolling Summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">A Grade</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{aMeters.toFixed(2)} m</p>
            {aPercent !== null ? (
              <p className="mt-1 text-sm text-slate-600">{aPercent.toFixed(2)}% of coated</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Enter actual coated meters</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">B Grade</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{bMeters.toFixed(2)} m</p>
            {bPercent !== null ? (
              <p className="mt-1 text-sm text-slate-600">{bPercent.toFixed(2)}% of coated</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Enter actual coated meters</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">C Grade</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{cMeters.toFixed(2)} m</p>
            {cPercent !== null ? (
              <p className="mt-1 text-sm text-slate-600">{cPercent.toFixed(2)}% of coated</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Enter actual coated meters</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Scrap</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{scrapMeters.toFixed(2)} m</p>
            {scrapPercent !== null ? (
              <p className="mt-1 text-sm text-slate-600">{scrapPercent.toFixed(2)}% of coated</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Enter actual coated meters</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Total Finished</p>
            <p className="mt-1 text-2xl font-bold text-teal-900">{totalFinishedLength.toFixed(2)} m</p>
          </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Yield (A Grade)</p>
              {yieldPercent !== null ? (
                <>
                  <p className="mt-1 text-2xl font-bold text-blue-900">{yieldPercent.toFixed(2)}%</p>
                  <p className="mt-1 text-xs text-slate-600">
                    A: {aMeters.toFixed(2)} m / Total: {(aMeters + nonAGradeTotal).toFixed(2)} m
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-600">Add finished rolls to calculate yield</p>
              )}
            </div>
        </div>
      </motion.section>

      {/* Base Rolls */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Base Fabric Rolls ({baseRolls.length})
        </h2>
        {baseRolls.length === 0 ? (
          <p className="text-slate-600">No base rolls added to this batch.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Roll No
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    QR Code
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Input Length (m)
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Order
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Fabric
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {baseRolls.map((br) => (
                  <tr key={br.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-900">
                      {br.base_fabric_rolls.roll_no ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">
                      {br.base_fabric_rolls.qr_code ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-600">
                      {br.input_length_m.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">
                      {br.base_fabric_rolls.base_fabric_orders?.order_no ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">
                      {br.base_fabric_rolls.base_fabric_orders?.base_fabric_items?.name ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-slate-900">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-slate-900">
                    {totalInputLength.toFixed(2)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </motion.section>

      {/* Finished Rolls */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Finished Fabric Rolls ({finishedRolls.length})
          </h2>
          {finishedRolls.length > 0 && (
            <Link
              href={`/toolbox/qr/print?rollIds=${finishedRolls.map((r) => r.id).join(",")}&type=finished_fabric`}
              target="_blank"
            >
              <Button variant="primary">Print QR Codes</Button>
            </Link>
          )}
        </div>
        {finishedRolls.length === 0 ? (
          <p className="text-slate-600">No finished rolls created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Roll No
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Length (m)
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Grade
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Notes
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {finishedRolls.map((roll) => (
                  <tr key={roll.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-slate-900">
                      {roll.roll_no ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-600">
                      {roll.length_m.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">
                      {roll.grade ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-600">{roll.notes ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">
                      {formatDate(roll.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  <td className="px-4 py-2 text-sm font-semibold text-slate-900">Total</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-slate-900">
                    {totalFinishedLength.toFixed(2)}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Add Finished Roll Form */}
        {batch.status !== "COMPLETED" && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Add Finished Roll</h3>
              {isRollingComplete && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2">
                  <p className="text-sm font-semibold text-green-800">
                    Rolling Complete: {totalFinishedLength.toFixed(2)} m / {actualCoated?.toFixed(2)} m
                  </p>
                </div>
              )}
            </div>
            {!canAddMoreRolls && !isRollingComplete && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <p className="text-sm text-yellow-800">
                  Please enter actual coated meters before adding rolls.
                </p>
              </div>
            )}
            {isRollingComplete && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm text-blue-800">
                  Rolling is complete. Click "Complete Production" to finalize the batch.
                </p>
              </div>
            )}
            <form onSubmit={handleAddFinishedRoll} className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Length (m) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newRollLength}
                  onChange={(e) => setNewRollLength(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="e.g. 50.00"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Grade</label>
                <select
                  value={newRollGrade}
                  onChange={(e) => setNewRollGrade(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                >
                  <option value="">Select Grade</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="SCRAP">SCRAP</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Notes</label>
                <input
                  type="text"
                  value={newRollNotes}
                  onChange={(e) => setNewRollNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="Optional"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end gap-2">
                <Button type="submit" variant="primary" disabled={isAddingRoll || !canAddMoreRolls}>
                  {isAddingRoll ? "Adding..." : "Add Roll"}
                </Button>
                {isRollingComplete && batch.status !== "COMPLETED" && (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleCompleteProduction}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Complete Production
                  </Button>
                )}
              </div>
            </form>
          </div>
        )}
      </motion.section>

      {/* Chemicals */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Chemicals ({batchChemicals.length})
        </h2>
        {batchChemicals.length === 0 ? (
          <p className="text-slate-600">No chemicals added to this batch.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Chemical Name
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Quantity
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    UOM
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {batchChemicals.map((chem) => (
                  <tr key={chem.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-900">
                      {chem.chemical_name ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-600">
                      {chem.quantity !== null ? chem.quantity.toFixed(3) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">
                      {chem.uom ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <button
                        onClick={() => handleDeleteChemical(chem.id)}
                        className="text-red-600 hover:text-red-800"
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

        {/* Add Chemical Form */}
        {batch.status !== "COMPLETED" && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Add Chemical</h3>

            <form onSubmit={handleAddChemical} className="grid gap-4 sm:grid-cols-3">
              <div className="relative">
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Chemical Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={newChemicalName}
                  onChange={(e) => handleChemicalNameChange(e.target.value)}
                  onFocus={handleChemicalNameFocus}
                  onBlur={handleChemicalNameBlur}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="Type to search issued chemicals..."
                  required
                />
                    {showChemicalSuggestions && filteredChemicals.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg">
                    {filteredChemicals.map((chem) => (
                      <button
                        key={chem.chemical_item_id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent input blur
                          handlePullFromIssued(chem);
                        }}
                        className="w-full border-b border-slate-200 p-3 text-left text-sm hover:bg-slate-50 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">{chem.item_name}</span>
                          <span className="text-slate-600">
                            Available: {chem.remaining_for_batches.toFixed(3)} {chem.uom}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {chemicalSearchQuery.length > 0 && filteredChemicals.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    No matching issued chemicals found. You can still enter a custom name.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Quantity <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={newChemicalQuantity}
                  onChange={(e) => setNewChemicalQuantity(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="e.g. 10.000"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">UOM</label>
                <select
                  value={newChemicalUom}
                  onChange={(e) => setNewChemicalUom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                >
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <Button type="submit" variant="primary" disabled={isAddingChemical}>
                  {isAddingChemical ? "Adding..." : "Add Chemical"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </motion.section>

      {/* Shortage Modal */}
      {showShortageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-xl font-semibold text-slate-900">Coating Shortage Detected</h3>
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-800">Shortage Details:</p>
              <p className="mt-1 text-sm text-yellow-700">
                Base Fabric Input: {totalInputLength.toFixed(2)} m
              </p>
              <p className="text-sm text-yellow-700">
                Actual Coated: {pendingCoatedMeters?.toFixed(2)} m
              </p>
              <p className="mt-2 text-sm font-semibold text-yellow-800">
                Shortage: {(totalInputLength - (pendingCoatedMeters || 0)).toFixed(2)} m
              </p>
            </div>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Reason for Shortage <span className="text-red-600">*</span>
              </label>
              <textarea
                value={shortageReason}
                onChange={(e) => setShortageReason(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="e.g. Fabric shrinkage during coating process..."
                rows={4}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowShortageModal(false);
                  setShortageReason("");
                  setPendingCoatedMeters(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmShortage}
                disabled={!shortageReason.trim() || isUpdatingCoatedMeters}
              >
                {isUpdatingCoatedMeters ? "Saving..." : "Confirm & Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

