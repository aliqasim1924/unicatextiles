"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";
import { generateQRCode } from "@/lib/qr/generateQRCode";

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
  beam_weft_not_required?: boolean;
  base_fabric_items: {
    name: string;
    construction: string | null;
    gsm: number | null;
  };
}

interface IssuedYarnOption {
  id: string;
  name: string;
}

interface OrderBeamRow {
  id: string;
  base_fabric_order_id: string;
  beam_id: string;
  yarn_item_id: string;
  weight_ready_kg: number;
  weaving_beams: { beam_no: string; tare_weight_kg: number } | null;
  yarn_items: { name: string } | null;
}

interface OrderWeftRow {
  id: string;
  base_fabric_order_id: string;
  yarn_item_id: string;
  cone_sequence: number | null;
  kg_start: number;
  kg_end: number | null;
  yarn_items: { name: string } | null;
}

interface BeamOption {
  id: string;
  beam_no: string;
  tare_weight_kg: number;
}

interface Roll {
  id: string;
  roll_no: string | null;
  qr_code: string | null;
  length_m: number;
  cut_at: string;
  notes: string | null;
}

interface YarnIssue {
  id: string;
  slip_no: string | null;
  txn_time: string;
  quantity: number;
  yarn_item_id: string;
  uom: string;
  unit_price_zar: number | null;
  yarn_items: {
    name: string;
  };
}

interface YarnPriceSample {
  yarn_item_id: string;
  quantity: number;
  unit_price_zar: number;
}

export default function BaseFabricOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [yarnIssues, setYarnIssues] = useState<YarnIssue[]>([]);
  const [yarnReceiptPrices, setYarnReceiptPrices] = useState<YarnPriceSample[]>([]);
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
  const [orderBeams, setOrderBeams] = useState<OrderBeamRow[]>([]);
  const [orderWeft, setOrderWeft] = useState<OrderWeftRow[]>([]);
  const [beams, setBeams] = useState<BeamOption[]>([]);
  const [beamForm, setBeamForm] = useState({ beam_id: "", yarn_item_id: "", weight_ready_kg: "" });
  const [weftForm, setWeftForm] = useState({ yarn_item_id: "", cone_sequence: "", kg_start: "", kg_end: "" });
  const [weftKgEndEdit, setWeftKgEndEdit] = useState<{ id: string; value: string } | null>(null);
  const [beamFormError, setBeamFormError] = useState<string | null>(null);
  const [weftFormError, setWeftFormError] = useState<string | null>(null);

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
          beam_weft_not_required,
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
        .select("id, roll_no, qr_code, length_m, cut_at, notes")
        .eq("base_fabric_order_id", orderId)
        .order("cut_at", { ascending: true });

      if (rollsError) throw rollsError;
      setRolls((rollsData as Roll[]) || []);

      // Fetch yarn issues linked to this order
      const { data: issuesData, error: issuesError } = await supabaseBrowserClient
        .from("yarn_transactions")
        .select(
          `
          id,
          yarn_item_id,
          slip_no,
          txn_time,
          quantity,
          uom,
          unit_price_zar,
          yarn_items:yarn_item_id ( name )
        `
        )
        .eq("base_fabric_order_id", orderId)
        .eq("transaction_type", "ISSUE")
        .order("txn_time", { ascending: true });

      if (issuesError) throw issuesError;

      setYarnIssues(
        (issuesData as any[]).map((row) => ({
          ...row,
          yarn_items: Array.isArray(row.yarn_items) ? row.yarn_items[0] : row.yarn_items,
        })) as YarnIssue[]
      );

      // Beam loadings and weft for this order
      const [beamsRes, orderBeamsRes, orderWeftRes] = await Promise.all([
        supabaseBrowserClient
          .from("weaving_beams")
          .select("id, beam_no, tare_weight_kg")
          .eq("is_active", true)
          .order("beam_no", { ascending: true }),
        supabaseBrowserClient
          .from("base_fabric_order_beams")
          .select(
            `
            id,
            base_fabric_order_id,
            beam_id,
            yarn_item_id,
            weight_ready_kg,
            weaving_beams:beam_id ( beam_no, tare_weight_kg ),
            yarn_items:yarn_item_id ( name )
          `
          )
          .eq("base_fabric_order_id", orderId),
        supabaseBrowserClient
          .from("base_fabric_order_weft")
          .select(
            `
            id,
            base_fabric_order_id,
            yarn_item_id,
            cone_sequence,
            kg_start,
            kg_end,
            yarn_items:yarn_item_id ( name )
          `
          )
          .eq("base_fabric_order_id", orderId),
      ]);

      if (beamsRes.data) {
        setBeams((beamsRes.data as BeamOption[]) || []);
      }
      const beamsData = orderBeamsRes.data as any[] | null;
      setOrderBeams(
        (beamsData || []).map((row) => ({
          ...row,
          weaving_beams: Array.isArray(row.weaving_beams) ? row.weaving_beams[0] : row.weaving_beams,
          yarn_items: Array.isArray(row.yarn_items) ? row.yarn_items[0] : row.yarn_items,
        })) as OrderBeamRow[]
      );
      const weftData = orderWeftRes.data as any[] | null;
      setOrderWeft(
        (weftData || []).map((row) => ({
          ...row,
          yarn_items: Array.isArray(row.yarn_items) ? row.yarn_items[0] : row.yarn_items,
        })) as OrderWeftRow[]
      );

      // Fetch receipt/return pricing samples for weighted average per yarn item
      const { data: receiptData, error: receiptError } = await supabaseBrowserClient
        .from("yarn_transactions")
        .select("yarn_item_id, quantity, unit_price_zar, transaction_type")
        .in("transaction_type", ["RECEIPT", "RETURN"])
        .not("unit_price_zar", "is", null);

      if (receiptError) throw receiptError;
      setYarnReceiptPrices(
        (receiptData as any[]).map((row) => ({
          yarn_item_id: row.yarn_item_id,
          quantity: row.quantity,
          unit_price_zar: row.unit_price_zar,
        })) as YarnPriceSample[]
      );
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
      // Generate QR code for the new roll
      const qrCode = generateQRCode("base_fabric");

      const { error: insertError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .insert({
          base_fabric_order_id: orderId,
          length_m: Number(rollForm.length_m),
          notes: rollForm.notes || null,
          qr_code: qrCode,
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

    // Require beam loading and weft usage for orders that are not grandfathered
    if (!order.beam_weft_not_required) {
      if (orderBeams.length < 1) {
        setError("Record at least one beam loading before completing.");
        return;
      }
      if (orderWeft.length < 1) {
        setError("Record at least one weft entry (cone) before completing.");
        return;
      }
    }

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

  const issuedYarnItems: IssuedYarnOption[] = useMemo(() => {
    const seen = new Set<string>();
    return yarnIssues
      .filter((i) => {
        if (seen.has(i.yarn_item_id)) return false;
        seen.add(i.yarn_item_id);
        return true;
      })
      .map((i) => ({ id: i.yarn_item_id, name: i.yarn_items?.name || "N/A" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [yarnIssues]);

  const issuedPerYarn: Map<string, number> = useMemo(() => {
    const m = new Map<string, number>();
    yarnIssues.forEach((i) => m.set(i.yarn_item_id, (m.get(i.yarn_item_id) || 0) + i.quantity));
    return m;
  }, [yarnIssues]);

  const consumedPerYarnCurrent: Map<string, number> = useMemo(() => {
    const m = new Map<string, number>();
    orderBeams.forEach((row) => {
      const tare = row.weaving_beams?.tare_weight_kg ?? 0;
      const kg = Number(row.weight_ready_kg) - Number(tare);
      if (kg > 0) m.set(row.yarn_item_id, (m.get(row.yarn_item_id) || 0) + kg);
    });
    orderWeft.forEach((row) => {
      if (row.kg_end != null) {
        const kg = Number(row.kg_start) - Number(row.kg_end);
        if (kg > 0) m.set(row.yarn_item_id, (m.get(row.yarn_item_id) || 0) + kg);
      }
    });
    return m;
  }, [orderBeams, orderWeft]);

  async function handleAddBeamLoading(e: React.FormEvent) {
    e.preventDefault();
    setBeamFormError(null);
    const beamId = beamForm.beam_id.trim();
    const yarnItemId = beamForm.yarn_item_id.trim();
    const weightReady = beamForm.weight_ready_kg ? parseFloat(beamForm.weight_ready_kg) : NaN;
    if (!beamId || !yarnItemId) {
      setBeamFormError("Select beam and yarn.");
      return;
    }
    if (isNaN(weightReady) || weightReady < 0) {
      setBeamFormError("Weight when ready (kg) must be a non-negative number.");
      return;
    }
    const beam = beams.find((b) => b.id === beamId);
    const tare = beam ? Number(beam.tare_weight_kg) : 0;
    const newBeamConsumption = weightReady - tare;
    if (newBeamConsumption > 0) {
      const issued = issuedPerYarn.get(yarnItemId) ?? 0;
      const currentConsumed = consumedPerYarnCurrent.get(yarnItemId) ?? 0;
      const totalAfter = currentConsumed + newBeamConsumption;
      if (totalAfter > issued) {
        setBeamFormError(
          `Consumed (beams + cones) cannot exceed issued for this yarn. Issued: ${issued.toFixed(3)} kg, already consumed: ${currentConsumed.toFixed(3)} kg, this beam would add ${newBeamConsumption.toFixed(3)} kg (total ${totalAfter.toFixed(3)} kg).`
        );
        return;
      }
    }
    try {
      const { error: err } = await supabaseBrowserClient
        .from("base_fabric_order_beams")
        .insert({
          base_fabric_order_id: orderId,
          beam_id: beamId,
          yarn_item_id: yarnItemId,
          weight_ready_kg: weightReady,
        });
      if (err) throw err;
      setBeamForm({ beam_id: "", yarn_item_id: "", weight_ready_kg: "" });
      fetchOrderData();
    } catch (err: any) {
      setBeamFormError(err.message || "Failed to add beam loading.");
    }
  }

  async function handleRemoveBeamLoading(id: string) {
    if (!window.confirm("Remove this beam loading entry?")) return;
    try {
      const { error } = await supabaseBrowserClient
        .from("base_fabric_order_beams")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchOrderData();
    } catch (err: any) {
      setError((err as Error).message || "Failed to remove.");
    }
  }

  async function handleAddWeftEntry(e: React.FormEvent) {
    e.preventDefault();
    setWeftFormError(null);
    const yarnItemId = weftForm.yarn_item_id.trim();
    const kgStart = weftForm.kg_start ? parseFloat(weftForm.kg_start) : NaN;
    const kgEndRaw = weftForm.kg_end ? parseFloat(weftForm.kg_end) : NaN;
    const kgEnd = !weftForm.kg_end || weftForm.kg_end.trim() === "" ? null : (isNaN(kgEndRaw) ? null : kgEndRaw);
    if (!yarnItemId) {
      setWeftFormError("Select yarn.");
      return;
    }
    if (isNaN(kgStart) || kgStart < 0) {
      setWeftFormError("Kg start must be a non-negative number.");
      return;
    }
    if (kgEnd !== null && (isNaN(kgEndRaw) || kgEndRaw < 0)) {
      setWeftFormError("Kg end must be a non-negative number when provided.");
      return;
    }
    const weftConsumption = kgEnd != null ? kgStart - kgEnd : 0;
    if (weftConsumption > 0) {
      const issued = issuedPerYarn.get(yarnItemId) ?? 0;
      const currentConsumed = consumedPerYarnCurrent.get(yarnItemId) ?? 0;
      const totalAfter = currentConsumed + weftConsumption;
      if (totalAfter > issued) {
        setWeftFormError(
          `Consumed (beams + cones) cannot exceed issued for this yarn. Issued: ${issued.toFixed(3)} kg, already consumed: ${currentConsumed.toFixed(3)} kg, this cone would add ${weftConsumption.toFixed(3)} kg (total ${totalAfter.toFixed(3)} kg).`
        );
        return;
      }
    }
    try {
      const { error: err } = await supabaseBrowserClient
        .from("base_fabric_order_weft")
        .insert({
          base_fabric_order_id: orderId,
          yarn_item_id: yarnItemId,
          cone_sequence: weftForm.cone_sequence ? parseInt(weftForm.cone_sequence, 10) : null,
          kg_start: kgStart,
          kg_end: kgEnd,
        });
      if (err) throw err;
      setWeftForm({ yarn_item_id: "", cone_sequence: "", kg_start: "", kg_end: "" });
      fetchOrderData();
    } catch (err: any) {
      setWeftFormError(err.message || "Failed to add weft entry.");
    }
  }

  async function handleUpdateWeftKgEnd(id: string, kgEndStr: string) {
    const kgEnd = kgEndStr.trim() === "" ? null : parseFloat(kgEndStr);
    if (kgEnd !== null && (isNaN(kgEnd) || kgEnd < 0)) {
      setWeftFormError("Kg end must be a non-negative number.");
      return;
    }
    setWeftFormError(null);
    const row = orderWeft.find((r) => r.id === id);
    if (row) {
      const newRowConsumption = row.kg_end != null
        ? Number(row.kg_start) - (kgEnd ?? 0)
        : (kgEnd != null ? Number(row.kg_start) - kgEnd : 0);
      if (newRowConsumption > 0) {
        const currentConsumed = consumedPerYarnCurrent.get(row.yarn_item_id) ?? 0;
        const previousRowConsumption = row.kg_end != null ? Number(row.kg_start) - Number(row.kg_end) : 0;
        const totalAfter = currentConsumed - previousRowConsumption + newRowConsumption;
        const issued = issuedPerYarn.get(row.yarn_item_id) ?? 0;
        if (totalAfter > issued) {
          setWeftFormError(
            `Consumed (beams + cones) cannot exceed issued for this yarn. Issued: ${issued.toFixed(3)} kg. Setting this kg end would bring total consumed to ${totalAfter.toFixed(3)} kg.`
          );
          return;
        }
      }
    }
    try {
      const { error } = await supabaseBrowserClient
        .from("base_fabric_order_weft")
        .update({ kg_end: kgEnd })
        .eq("id", id);
      if (error) throw error;
      setWeftKgEndEdit(null);
      fetchOrderData();
    } catch (err: any) {
      setWeftFormError(err.message || "Failed to update kg end.");
    }
  }

  async function handleRemoveWeftEntry(id: string) {
    if (!window.confirm("Remove this weft entry?")) return;
    try {
      const { error } = await supabaseBrowserClient
        .from("base_fabric_order_weft")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchOrderData();
    } catch (err: any) {
      setError((err as Error).message || "Failed to remove.");
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
  const shortfall = totalProduced < order.planned_qty_m ? order.planned_qty_m - totalProduced : null;
  const progress = order.planned_qty_m > 0 ? (totalProduced / order.planned_qty_m) * 100 : 0;
  const totalFabricM = totalProduced;

  // Weighted average price map from RECEIPT/RETURN
  const avgPriceMap = yarnReceiptPrices.reduce((map, sample) => {
    const existing = map.get(sample.yarn_item_id) || { qty: 0, cost: 0 };
    map.set(sample.yarn_item_id, {
      qty: existing.qty + sample.quantity,
      cost: existing.cost + sample.quantity * sample.unit_price_zar,
    });
    return map;
  }, new Map<string, { qty: number; cost: number }>());

  const avgUnitPriceByYarn = new Map<string, number>();
  avgPriceMap.forEach((val, key) => {
    if (val.qty > 0) {
      avgUnitPriceByYarn.set(key, val.cost / val.qty);
    }
  });

  const issueCosts = yarnIssues.map((issue) => {
    const avgPrice = avgUnitPriceByYarn.get(issue.yarn_item_id) || 0;
    const lineCost = issue.quantity * avgPrice;
    return {
      ...issue,
      avg_price_zar: avgPrice,
      line_cost_zar: lineCost,
    };
  });

  const totalIssuedKg = issueCosts.reduce((sum, issue) => sum + issue.quantity, 0);

  // Consumed = beam (warp) + weft cones; used for cost and "yarn used" in production
  const consumedByYarn = new Map<string, number>();
  orderBeams.forEach((row) => {
    const tare = row.weaving_beams?.tare_weight_kg ?? 0;
    const yarnKg = Number(row.weight_ready_kg) - Number(tare);
    if (yarnKg > 0) {
      const id = row.yarn_item_id;
      consumedByYarn.set(id, (consumedByYarn.get(id) || 0) + yarnKg);
    }
  });
  orderWeft.forEach((row) => {
    if (row.kg_end != null) {
      const yarnKg = Number(row.kg_start) - Number(row.kg_end);
      if (yarnKg > 0) {
        const id = row.yarn_item_id;
        consumedByYarn.set(id, (consumedByYarn.get(id) || 0) + yarnKg);
      }
    }
  });
  const totalConsumedKg = Array.from(consumedByYarn.values()).reduce((s, k) => s + k, 0);
  const withDepartmentKg = Math.max(0, totalIssuedKg - totalConsumedKg);

  // Cost based on consumed yarn (not issued)
  const totalYarnCostZar = Array.from(consumedByYarn.entries()).reduce((sum, [yarnItemId, kg]) => {
    const avgPrice = avgUnitPriceByYarn.get(yarnItemId) || 0;
    return sum + kg * avgPrice;
  }, 0);
  const yarnKgPerM = totalFabricM > 0 ? totalConsumedKg / totalFabricM : null;
  const yarnCostPerM = totalFabricM > 0 ? totalYarnCostZar / totalFabricM : null;

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
          <BackButton href="/toolbox/base-fabric/orders" label="Back to Orders" />
        </div>
      </div>

      {/* Production Report (Print Layout) - multi-page allowed */}
      <div className="print-production-report print-page-shell print:min-h-0 hidden print:block">
        <div className="print-slip-container">
          <div className="print-slip-card print-production-report-card flex flex-col min-h-0">
            {/* Print Header */}
            <div className="print:flex print:justify-between print:items-start print:mb-6 print:pb-4 print:border-b print:border-slate-300">
              <div>
                <h2 className="print:text-2xl print:font-bold print:text-slate-900">
                  UNICA TEXTILE MILLS
                </h2>
              </div>
              <div className="print:w-24 print:h-24 print:flex print:items-center print:justify-center print:overflow-hidden">
                <img src="/Logo.png" alt="Company Logo" className="print:h-full print:w-full print:object-contain" />
              </div>
            </div>

            {/* Print Title */}
            <h1 className="print:text-center print:text-xl print:font-bold print:text-slate-900 print:mb-6">
              Base Fabric Production Report
            </h1>

            {/* Print Order Info */}
            <div className="print:grid print:grid-cols-2 print:gap-4 print:mb-4 print:text-sm">
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

            {/* Production Summary */}
            <div className="print:mb-4 print:border print:border-slate-300 print:rounded print:p-3 print:bg-slate-50">
              <h3 className="print:text-sm print:font-bold print:text-slate-900 print:mb-2">
                Production Summary
              </h3>
              <div className="print:grid print:grid-cols-2 print:gap-3 print:text-sm">
                <div>
                  <span className="print:font-semibold print:text-slate-900">Planned (m):</span>{" "}
                  <span className="print:text-slate-700">{order.planned_qty_m.toFixed(2)}</span>
                </div>
                <div>
                  <span className="print:font-semibold print:text-slate-900">Actual (m):</span>{" "}
                  <span className="print:text-slate-700">{totalProduced.toFixed(2)}</span>
                </div>
                <div>
                  <span className="print:font-semibold print:text-slate-900">Variance (m):</span>{" "}
                  <span className="print:text-slate-700">
                    {variance >= 0 ? "+" : ""}
                    {variance.toFixed(2)}
                  </span>
                </div>
                {shortfall !== null && (
                  <div>
                    <span className="print:font-semibold print:text-slate-900">Shortfall (m):</span>{" "}
                    <span className="print:text-slate-700">{shortfall.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Reason for Shortfall/Overrun */}
            {(variance !== 0 || order.notes) && (
              <div className="print:mb-4 print:text-sm">
                <h3 className="print:text-sm print:font-bold print:text-slate-900 print:mb-1">
                  Reason for Shortfall/Overrun:
                </h3>
                <div className="print:border print:border-slate-300 print:rounded print:p-2 print:min-h-[2rem] print:text-slate-700">
                  {order.notes || completionNote || "—"}
                </div>
              </div>
            )}

            {/* Print Cost Summary (consumed = beams + cones; cost based on consumed) */}
            <div className="print:mb-4 print:text-sm print:text-slate-900 print:space-y-2">
              <div className="print:font-semibold print:text-slate-900">
                Production Cost (Yarn Only – based on consumed)
              </div>
              <div className="print:grid print:grid-cols-2 print:gap-3">
                <div className="print:space-y-1">
                  <div className="print:text-slate-700">
                    Yarn Issued: {totalIssuedKg.toFixed(3)} kg
                  </div>
                  <div className="print:text-slate-700">
                    Yarn Consumed (beams + cones): {totalConsumedKg.toFixed(3)} kg
                  </div>
                  <div className="print:text-slate-700">
                    With Department: {withDepartmentKg.toFixed(3)} kg
                  </div>
                  <div className="print:text-slate-700">
                    Total Yarn Cost: {totalYarnCostZar.toFixed(2)} ZAR
                  </div>
                  <div className="print:text-slate-700">
                    Fabric Produced: {totalFabricM.toFixed(2)} m
                  </div>
                </div>
                <div className="print:space-y-1">
                  <div className="print:font-semibold print:text-slate-900">Cost per Meter</div>
                  <div className="print:text-slate-700">
                    Yarn kg per meter: {yarnKgPerM !== null ? `${yarnKgPerM.toFixed(4)} kg/m` : "-"}
                  </div>
                  <div className="print:text-slate-700">
                    Base Fabric Cost (Yarn):{" "}
                    {yarnCostPerM !== null ? `${yarnCostPerM.toFixed(2)} ZAR/m` : "-"}
                  </div>
                </div>
              </div>
            </div>

            {/* Print Beam Loading (Warp) */}
            {orderBeams.length > 0 && (
              <div className="print:mb-4">
                <h3 className="print:text-sm print:font-bold print:text-slate-900 print:mb-2">
                  Beam Loading (Warp)
                </h3>
                <table className="print:w-full print:text-xs print:border print:border-slate-300">
                  <thead>
                    <tr className="print:bg-slate-100">
                      <th className="print:px-2 print:py-2 print:text-left print:font-semibold print:text-slate-900 print:border print:border-slate-300">Beam no</th>
                      <th className="print:px-2 print:py-2 print:text-left print:font-semibold print:text-slate-900 print:border print:border-slate-300">Yarn</th>
                      <th className="print:px-2 print:py-2 print:text-right print:font-semibold print:text-slate-900 print:border print:border-slate-300">Tare (kg)</th>
                      <th className="print:px-2 print:py-2 print:text-right print:font-semibold print:text-slate-900 print:border print:border-slate-300">Ready (kg)</th>
                      <th className="print:px-2 print:py-2 print:text-right print:font-semibold print:text-slate-900 print:border print:border-slate-300">Yarn loaded (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderBeams.map((row) => {
                      const tare = row.weaving_beams?.tare_weight_kg ?? 0;
                      const yarnLoaded = Number(row.weight_ready_kg) - Number(tare);
                      return (
                        <tr key={row.id}>
                          <td className="print:px-2 print:py-2 print:text-slate-900 print:border print:border-slate-300">{row.weaving_beams?.beam_no ?? "—"}</td>
                          <td className="print:px-2 print:py-2 print:text-slate-700 print:border print:border-slate-300">{row.yarn_items?.name ?? "—"}</td>
                          <td className="print:px-2 print:py-2 print:text-right print:text-slate-900 print:border print:border-slate-300">{Number(tare).toFixed(3)}</td>
                          <td className="print:px-2 print:py-2 print:text-right print:text-slate-900 print:border print:border-slate-300">{Number(row.weight_ready_kg).toFixed(3)}</td>
                          <td className="print:px-2 print:py-2 print:text-right print:text-slate-900 print:border print:border-slate-300">{yarnLoaded.toFixed(3)}</td>
                        </tr>
                      );
                    })}
                    <tr className="print:font-semibold">
                      <td className="print:px-2 print:py-2 print:border print:border-slate-300" colSpan={4}>Total warp yarn (kg)</td>
                      <td className="print:px-2 print:py-2 print:text-right print:border print:border-slate-300">
                        {orderBeams.reduce((sum, row) => {
                          const tare = row.weaving_beams?.tare_weight_kg ?? 0;
                          return sum + (Number(row.weight_ready_kg) - Number(tare));
                        }, 0).toFixed(3)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Print Weft Usage */}
            {orderWeft.length > 0 && (
              <div className="print:mb-4">
                <h3 className="print:text-sm print:font-bold print:text-slate-900 print:mb-2">
                  Weft Usage (Cones)
                </h3>
                <table className="print:w-full print:text-xs print:border print:border-slate-300">
                  <thead>
                    <tr className="print:bg-slate-100">
                      <th className="print:px-2 print:py-2 print:text-left print:font-semibold print:text-slate-900 print:border print:border-slate-300">Cone</th>
                      <th className="print:px-2 print:py-2 print:text-left print:font-semibold print:text-slate-900 print:border print:border-slate-300">Yarn</th>
                      <th className="print:px-2 print:py-2 print:text-right print:font-semibold print:text-slate-900 print:border print:border-slate-300">Kg start</th>
                      <th className="print:px-2 print:py-2 print:text-right print:font-semibold print:text-slate-900 print:border print:border-slate-300">Kg end</th>
                      <th className="print:px-2 print:py-2 print:text-right print:font-semibold print:text-slate-900 print:border print:border-slate-300">Consumption (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderWeft.map((row) => {
                      const kgEnd = row.kg_end != null ? Number(row.kg_end) : null;
                      const consumption = kgEnd != null ? Number(row.kg_start) - kgEnd : null;
                      return (
                        <tr key={row.id}>
                          <td className="print:px-2 print:py-2 print:text-slate-900 print:border print:border-slate-300">{row.cone_sequence ?? "—"}</td>
                          <td className="print:px-2 print:py-2 print:text-slate-700 print:border print:border-slate-300">{row.yarn_items?.name ?? "—"}</td>
                          <td className="print:px-2 print:py-2 print:text-right print:text-slate-900 print:border print:border-slate-300">{Number(row.kg_start).toFixed(3)}</td>
                          <td className="print:px-2 print:py-2 print:text-right print:text-slate-900 print:border print:border-slate-300">{kgEnd != null ? kgEnd.toFixed(3) : "—"}</td>
                          <td className="print:px-2 print:py-2 print:text-right print:text-slate-900 print:border print:border-slate-300">{consumption != null ? consumption.toFixed(3) : "—"}</td>
                        </tr>
                      );
                    })}
                    <tr className="print:font-semibold">
                      <td className="print:px-2 print:py-2 print:border print:border-slate-300" colSpan={4}>Total weft consumption (kg)</td>
                      <td className="print:px-2 print:py-2 print:text-right print:border print:border-slate-300">
                        {orderWeft.reduce((sum, row) => row.kg_end != null ? sum + (Number(row.kg_start) - Number(row.kg_end)) : sum, 0).toFixed(3)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

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

      {/* Yarn Consumption & Cost (consumed = beams + cones; cost based on consumed) */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Yarn Consumption &amp; Cost</h2>
          <p className="text-sm text-slate-600">
            Consumed = beam (warp) + cone (weft). Cost is based on consumed yarn.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-600">Yarn consumed (beams + cones)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {totalConsumedKg.toFixed(3)} kg
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-600">Total yarn cost (ZAR)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {totalYarnCostZar.toFixed(2)} ZAR
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-600">Fabric produced</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {totalFabricM.toFixed(2)} m
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-600">Yarn kg per meter</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {yarnKgPerM !== null ? `${yarnKgPerM.toFixed(4)} kg/m` : "N/A"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:col-span-2 lg:col-span-4">
            <p className="text-sm font-semibold text-slate-600">Base Fabric Cost (Yarn Only)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {yarnCostPerM !== null ? `${yarnCostPerM.toFixed(2)} ZAR/m` : "N/A"}
            </p>
          </div>
        </div>

        {/* Issued vs Consumed */}
        {totalIssuedKg > 0 || totalConsumedKg > 0 ? (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/50 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Issued vs Consumed</h3>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <span className="text-slate-600">Issued (to department):</span>{" "}
                <span className="font-semibold text-slate-900">{totalIssuedKg.toFixed(3)} kg</span>
              </div>
              <div>
                <span className="text-slate-600">Consumed (beams + cones):</span>{" "}
                <span className="font-semibold text-slate-900">{totalConsumedKg.toFixed(3)} kg</span>
              </div>
              <div>
                <span className="text-slate-600">With department (on cones/beams):</span>{" "}
                <span className="font-semibold text-slate-900">{withDepartmentKg.toFixed(3)} kg</span>
              </div>
            </div>
          </div>
        ) : null}

        {issueCosts.length > 0 || consumedByYarn.size > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Yarn</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Issued (kg)</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Consumed (kg)</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">With dept (kg)</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Avg Price (ZAR/kg)</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Cost (ZAR)</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const yarnIds = new Set([...issueCosts.map((i) => i.yarn_item_id), ...consumedByYarn.keys()]);
                  return Array.from(yarnIds).map((yarnItemId) => {
                    const issued = issueCosts.filter((i) => i.yarn_item_id === yarnItemId).reduce((s, i) => s + i.quantity, 0);
                    const consumed = consumedByYarn.get(yarnItemId) || 0;
                    const withDept = Math.max(0, issued - consumed);
                    const avgPrice = avgUnitPriceByYarn.get(yarnItemId) || 0;
                    const costZar = consumed * avgPrice;
                    const name = issueCosts.find((i) => i.yarn_item_id === yarnItemId)?.yarn_items?.name || "—";
                    return (
                      <tr key={yarnItemId} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{name}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{issued.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{consumed.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{withDept.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{avgPrice ? avgPrice.toFixed(2) : "0.00"}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{costZar.toFixed(2)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            No yarn issues linked to this order yet.
          </p>
        )}
      </motion.section>

      {/* Linked Yarn Issuings */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.07 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Linked Yarn Issuings</h2>
            <p className="text-sm text-slate-600">
              Yarn issuing slips linked to this production order.
            </p>
          </div>
        </div>

        {yarnIssues.length === 0 ? (
          <p className="text-sm text-slate-600">No yarn issuings linked to this order.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Slip No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Yarn</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Quantity</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Issued At</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {yarnIssues.map((issue) => (
                  <tr
                    key={issue.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => router.push(`/toolbox/yarn/issuing/slip/${issue.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {issue.slip_no || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {issue.yarn_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {issue.quantity.toFixed(3)} {issue.uom?.toLowerCase() === "kg" ? "kg" : issue.uom}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(issue.txn_time).toLocaleString("en-ZA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right text-teal-700">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/toolbox/yarn/issuing/slip/${issue.id}`);
                        }}
                        className="text-sm font-semibold hover:underline"
                      >
                        View slip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      {/* Beam loading (warp) – only issued yarn selectable */}
      {(order.status === "PLANNED" || order.status === "RUNNING" || orderBeams.length > 0) && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Beam loading (warp)</h2>
              <p className="text-sm text-slate-600">
                Record beam number and weight when ready to weave. You can only consume yarn that was issued to this order (issued = in stock in department).
              </p>
            </div>
          </div>
          {issuedYarnItems.length === 0 ? (
            <p className="text-sm text-amber-700">
              No yarn has been issued to this order. Issue yarn first before recording beam loading.
            </p>
          ) : (
            <>
              <form onSubmit={handleAddBeamLoading} className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(280px,1.2fr)_1fr_140px_auto]">
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Beam</label>
                  <select
                    value={beamForm.beam_id}
                    onChange={(e) => setBeamForm((p) => ({ ...p, beam_id: e.target.value }))}
                    className="w-full min-w-[260px] rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="">Select beam</option>
                    {beams.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.beam_no} (tare {Number(b.tare_weight_kg).toFixed(2)} kg)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Yarn issued to order</label>
                  <select
                    value={beamForm.yarn_item_id}
                    onChange={(e) => setBeamForm((p) => ({ ...p, yarn_item_id: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="">Select yarn</option>
                    {issuedYarnItems.map((y) => {
                      const issued = issuedPerYarn.get(y.id) ?? 0;
                      const consumed = consumedPerYarnCurrent.get(y.id) ?? 0;
                      const available = Math.max(0, issued - consumed);
                      return (
                        <option key={y.id} value={y.id}>
                          {y.name} — issued {issued.toFixed(1)} kg, {available.toFixed(1)} kg left to consume
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={beamForm.weight_ready_kg}
                    onChange={(e) => setBeamForm((p) => ({ ...p, weight_ready_kg: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="e.g. 120.5"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="primary">Add beam</Button>
                </div>
              </form>
              {beamFormError && <p className="mb-2 text-sm text-red-600">{beamFormError}</p>}
              {orderBeams.length === 0 ? (
                <p className="text-sm text-slate-600">No beam loadings recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">Beam no</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">Yarn</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Tare (kg)</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Ready (kg)</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Yarn loaded (kg)</th>
                        {(order.status === "PLANNED" || order.status === "RUNNING") && (
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {orderBeams.map((row) => {
                        const tare = row.weaving_beams?.tare_weight_kg ?? 0;
                        const yarnLoaded = Number(row.weight_ready_kg) - Number(tare);
                        return (
                          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{row.weaving_beams?.beam_no ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-900">{row.yarn_items?.name ?? "—"}</td>
                            <td className="px-4 py-3 text-right text-slate-900">{Number(tare).toFixed(3)}</td>
                            <td className="px-4 py-3 text-right text-slate-900">{Number(row.weight_ready_kg).toFixed(3)}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">{yarnLoaded.toFixed(3)}</td>
                            {(order.status === "PLANNED" || order.status === "RUNNING") && (
                              <td className="px-4 py-3">
                                <button type="button" onClick={() => handleRemoveBeamLoading(row.id)} className="text-sm font-semibold text-red-600 hover:text-red-700">Remove</button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {orderBeams.length > 0 && (
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  Total warp yarn (kg):{" "}
                  {orderBeams.reduce((sum, row) => {
                    const tare = row.weaving_beams?.tare_weight_kg ?? 0;
                    return sum + (Number(row.weight_ready_kg) - Number(tare));
                  }, 0).toFixed(3)}
                </p>
              )}
            </>
          )}
        </motion.section>
      )}

      {/* Weft usage (cones) – only issued yarn selectable */}
      {(order.status === "PLANNED" || order.status === "RUNNING" || orderWeft.length > 0) && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.09 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Weft usage (cones)</h2>
              <p className="text-sm text-slate-600">
                Record cone kg start (and kg end when cone or production run finishes). You can only consume yarn that was issued to this order (issued = in stock in department).
              </p>
            </div>
          </div>
          {issuedYarnItems.length === 0 ? (
            <p className="text-sm text-amber-700">
              No yarn has been issued to this order. Issue yarn first before recording weft usage.
            </p>
          ) : (
            <>
              <form onSubmit={handleAddWeftEntry} className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.2fr)_90px_110px_110px_auto]">
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Yarn (issued to order – consume only up to issued)</label>
                  <select
                    value={weftForm.yarn_item_id}
                    onChange={(e) => setWeftForm((p) => ({ ...p, yarn_item_id: e.target.value }))}
                    className="w-full min-w-[200px] rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="">Select yarn</option>
                    {issuedYarnItems.map((y) => {
                      const issued = issuedPerYarn.get(y.id) ?? 0;
                      const consumed = consumedPerYarnCurrent.get(y.id) ?? 0;
                      const available = Math.max(0, issued - consumed);
                      return (
                        <option key={y.id} value={y.id}>
                          {y.name} — issued {issued.toFixed(1)} kg, {available.toFixed(1)} kg left to consume
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Cone No</label>
                  <input
                    type="number"
                    min="1"
                    value={weftForm.cone_sequence}
                    onChange={(e) => setWeftForm((p) => ({ ...p, cone_sequence: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="1, 2, 3..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Kg Start</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={weftForm.kg_start}
                    onChange={(e) => setWeftForm((p) => ({ ...p, kg_start: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="e.g. 5.2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Kg End</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={weftForm.kg_end}
                    onChange={(e) => setWeftForm((p) => ({ ...p, kg_end: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="e.g. 1.1 or leave blank"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="primary">Add weft entry</Button>
                </div>
              </form>
              {weftFormError && <p className="mb-2 text-sm text-red-600">{weftFormError}</p>}
              {orderWeft.length === 0 ? (
                <p className="text-sm text-slate-600">No weft entries recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">Cone</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-900">Yarn</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Kg start</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Kg end</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-900">Consumption (kg)</th>
                        {(order.status === "PLANNED" || order.status === "RUNNING") && (
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {orderWeft.map((row) => {
                        const kgEnd = row.kg_end != null ? Number(row.kg_end) : null;
                        const consumption = kgEnd != null ? Number(row.kg_start) - kgEnd : null;
                        const isEditingKgEnd = weftKgEndEdit?.id === row.id;
                        return (
                          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-900">{row.cone_sequence ?? "—"}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.yarn_items?.name ?? "—"}</td>
                            <td className="px-4 py-3 text-right text-slate-900">{Number(row.kg_start).toFixed(3)}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditingKgEnd ? (
                                <span className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
                                    value={weftKgEndEdit.value}
                                    onChange={(e) => setWeftKgEndEdit((p) => p ? { ...p, value: e.target.value } : null)}
                                    autoFocus
                                  />
                                  <button type="button" onClick={() => handleUpdateWeftKgEnd(row.id, weftKgEndEdit.value)} className="text-xs font-semibold text-teal-700">Save</button>
                                  <button type="button" onClick={() => setWeftKgEndEdit(null)} className="text-xs text-slate-600">Cancel</button>
                                </span>
                              ) : kgEnd != null ? (
                                <span className="text-slate-900">{kgEnd.toFixed(3)}</span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {consumption != null ? consumption.toFixed(3) : "—"}
                            </td>
                            {(order.status === "PLANNED" || order.status === "RUNNING") && (
                              <td className="px-4 py-3">
                                {row.kg_end == null && !isEditingKgEnd ? (
                                  <button type="button" onClick={() => setWeftKgEndEdit({ id: row.id, value: "" })} className="text-sm font-semibold text-teal-700 hover:text-teal-800 mr-2">Set kg end</button>
                                ) : null}
                                <button type="button" onClick={() => handleRemoveWeftEntry(row.id)} className="text-sm font-semibold text-red-600 hover:text-red-700">Remove</button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {orderWeft.length > 0 && (
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  Total weft consumption (kg):{" "}
                  {orderWeft.reduce((sum, row) => row.kg_end != null ? sum + (Number(row.kg_start) - Number(row.kg_end)) : sum, 0).toFixed(3)}
                  {orderWeft.some((row) => row.kg_end == null) && (
                    <span className="ml-1 text-slate-600 font-normal">(pending: fill kg end for remaining cones)</span>
                  )}
                </p>
              )}
            </>
          )}
        </motion.section>
      )}

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
          {rolls.length >= 1 ? (
            !showCompleteDialog ? (
              <Button
                variant="primary"
                onClick={() => {
                  setError(null);
                  setShowCompleteDialog(true);
                }}
              >
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
            )
          ) : (
            <p className="text-sm text-slate-600">
              Add at least one roll before completing the order.
            </p>
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Rolls ({rolls.length} total, {totalProduced.toFixed(2)} m)
          </h2>
          {rolls.length > 0 && (
            <Link
              href={`/toolbox/qr/print?rollIds=${rolls.map((r) => r.id).join(",")}&type=base_fabric`}
              target="_blank"
            >
              <Button variant="primary">Print QR Codes</Button>
            </Link>
          )}
        </div>

        {rolls.length === 0 ? (
          <p className="text-sm text-slate-600">No rolls recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">QR Code</th>
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
                    <td className="px-4 py-3 text-slate-600">{roll.qr_code || "-"}</td>
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

