"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_STORE = "FINISHED_STORE";
const STATUS_IN_STORE = "IN_STORE";
const LOCATION_DISPATCHED = "DISPATCHED";
const STATUS_ISSUED = "ISSUED";

type GradeFilter = "ALL" | "A" | "B" | "C" | "SCRAP";

interface StoreRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  color: string | null;
  coating_type: string | null;
  gsm: number | null;
  fabric_type_id: string | null;
  color_option_id: string | null;
  gsm_option_id: string | null;
  width_option_id: string | null;
}

interface OrderLine {
  id: string;
  fabric_type_id: string | null;
  color_option_id: string | null;
  gsm_option_id: string | null;
  width_option_id: string | null;
  coating_type: string;
  color: string;
  gsm: string | null;
  quantity_m: number;
}

interface OrderRequirement {
  key: string; // fabric_type_id + "|" + color_option_id + "|" + gsm_option_id + "|" + width_option_id
  fabric_type_id: string | null;
  color_option_id: string | null;
  gsm_option_id: string | null;
  width_option_id: string | null;
  coating_type: string; // For display
  color: string; // For display
  ordered_m: number;
  issued_m: number;
  selected_m: number;
  remaining_m: number;
  isLegacyMatch: boolean; // True if matched by text fallback
}

interface CustomerOrder {
  id: string;
  order_ref: string;
  status: string | null;
  customers?: {
    id: string;
    name: string;
  } | null;
}

export default function FinishedFabricStoreIssuePage() {
  const router = useRouter();
  const [stockRolls, setStockRolls] = useState<StoreRoll[]>([]);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [destination, setDestination] = useState("DISPATCH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [gatePassNo, setGatePassNo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [orderRequirements, setOrderRequirements] = useState<OrderRequirement[]>([]);
  const [showOnlyMatching, setShowOnlyMatching] = useState(false);

  useEffect(() => {
    fetchStock();
  }, []);

  useEffect(() => {
    if (destination === "CUSTOMER") {
      fetchOpenOrders();
    } else {
      setSelectedOrderId("");
      setOrderLines([]);
      setOrderRequirements([]);
    }
  }, [destination]);

  useEffect(() => {
    if (destination === "CUSTOMER" && selectedOrderId) {
      fetchOrderRequirements();
    } else {
      setOrderLines([]);
      setOrderRequirements([]);
    }
  }, [selectedOrderId, destination]);

  async function fetchStock() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, length_m, grade, color, coating_type, gsm, fabric_type_id, gsm_option_id, color_option_id, width_option_id, status, current_location")
        .eq("status", STATUS_IN_STORE)
        .eq("current_location", LOCATION_STORE)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: StoreRoll[] =
        (data || []).map((row: any) => ({
          id: row.id as string,
          roll_no: row.roll_no ?? null,
          length_m: Number(row.length_m || 0),
          grade: row.grade ?? null,
          color: row.color ?? null,
          coating_type: row.coating_type ?? null,
          gsm: row.gsm ? Number(row.gsm) : null,
          fabric_type_id: row.fabric_type_id ?? null,
          color_option_id: row.color_option_id ?? null,
          gsm_option_id: row.gsm_option_id ?? null,
          width_option_id: row.width_option_id ?? null,
        })) || [];

      setStockRolls(mapped);
      setSelectedRollIds(new Set());
    } catch (err: any) {
      console.error("Failed to load store stock", err);
      const message = err?.message || JSON.stringify(err) || "Failed to load store stock.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchOrderRequirements() {
    if (!selectedOrderId) return;

    try {
      // Fetch order lines with catalog IDs
      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("customer_order_lines")
        .select("id, fabric_type_id, color_option_id, gsm_option_id, width_option_id, coating_type, color, gsm, quantity_m")
        .eq("order_id", selectedOrderId);

      if (linesError) throw linesError;

      const mappedLines: OrderLine[] =
        (linesData || []).map((l: any) => ({
          id: l.id,
          fabric_type_id: l.fabric_type_id ?? null,
          color_option_id: l.color_option_id ?? null,
          gsm_option_id: l.gsm_option_id ?? null,
          width_option_id: l.width_option_id ?? null,
          coating_type: l.coating_type,
          color: l.color,
          gsm: l.gsm?.toString() || null,
          quantity_m: Number(l.quantity_m || 0),
        })) || [];

      setOrderLines(mappedLines);

      // Fetch already-issued meters with catalog IDs
      const { data: issuesData, error: issuesError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select(
          `
          id,
          finished_fabric_store_issue_items (
            roll_id,
            finished_fabric_rolls:roll_id (
              fabric_type_id,
              color_option_id,
              gsm_option_id,
              width_option_id,
              color,
              coating_type,
              gsm,
              length_m
            )
          )
        `
        )
        .eq("order_id", selectedOrderId)
        .eq("destination", "CUSTOMER");

      if (issuesError) throw issuesError;

      // Helper function to build match key from IDs
      const buildMatchKey = (line: OrderLine): string => {
        if (line.fabric_type_id && line.color_option_id) {
          const parts = [
            line.fabric_type_id,
            line.color_option_id,
            line.gsm_option_id || "",
            line.width_option_id || "",
          ];
          return parts.join("|");
        }
        // Fallback: use text matching for legacy data
        const normalizedCoating = (line.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
        const normalizedColor = (line.color || "").trim().toLowerCase().replace(/\s+/g, " ");
        const normalizedGsm = line.gsm ? line.gsm.trim().toLowerCase() : "";
        return `TEXT|${normalizedCoating}|${normalizedColor}|${normalizedGsm}`;
      };

      // Group by match key (use IDs for matching)
      const requiredMap: Record<
        string,
        {
          ordered_m: number;
          coating_type: string;
          color: string;
          fabric_type_id: string | null;
          color_option_id: string | null;
          gsm_option_id: string | null;
          width_option_id: string | null;
        }
      > = {};
      mappedLines.forEach((line) => {
        const key = buildMatchKey(line);
        if (!requiredMap[key]) {
          requiredMap[key] = {
            ordered_m: 0,
            coating_type: line.coating_type,
            color: line.color,
            fabric_type_id: line.fabric_type_id,
            color_option_id: line.color_option_id,
            gsm_option_id: line.gsm_option_id,
            width_option_id: line.width_option_id,
          };
        }
        requiredMap[key].ordered_m += line.quantity_m;
      });

      // Helper function to build match key from roll IDs
      const buildRollMatchKey = (roll: any): string | null => {
        if (roll.fabric_type_id && roll.color_option_id) {
          const parts = [
            roll.fabric_type_id,
            roll.color_option_id,
            roll.gsm_option_id || "",
            roll.width_option_id || "",
          ];
          return parts.join("|");
        }
        // Fallback: use text matching for legacy data
        if (roll.coating_type && roll.color) {
          const normalizedCoating = (roll.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
          const normalizedColor = (roll.color || "").trim().toLowerCase().replace(/\s+/g, " ");
          const normalizedGsm = roll.gsm ? roll.gsm.toString().trim().toLowerCase() : "";
          return `TEXT|${normalizedCoating}|${normalizedColor}|${normalizedGsm}`;
        }
        return null;
      };

      const issuedMap: Record<string, number> = {};
      (issuesData || []).forEach((issue: any) => {
        (issue.finished_fabric_store_issue_items || []).forEach((item: any) => {
          const roll = Array.isArray(item.finished_fabric_rolls)
            ? item.finished_fabric_rolls[0]
            : item.finished_fabric_rolls;
          if (roll) {
            const key = buildRollMatchKey(roll);
            if (key) {
              issuedMap[key] = (issuedMap[key] || 0) + Number(roll.length_m || 0);
            }
          }
        });
      });

      // Build requirements array
      const requirements: OrderRequirement[] = Object.entries(requiredMap).map(([key, data]) => {
        const isLegacyMatch = key.startsWith("TEXT|");
        const issued_m = issuedMap[key] || 0;
        return {
          key,
          fabric_type_id: data.fabric_type_id,
          color_option_id: data.color_option_id,
          gsm_option_id: data.gsm_option_id,
          width_option_id: data.width_option_id,
          coating_type: data.coating_type,
          color: data.color,
          ordered_m: data.ordered_m,
          issued_m,
          selected_m: 0, // Will be computed from selected rolls
          remaining_m: data.ordered_m - issued_m,
          isLegacyMatch,
        };
      });

      setOrderRequirements(requirements);
    } catch (err: any) {
      console.error("Failed to load order requirements", err);
      setError(err?.message || "Failed to load order requirements.");
    }
  }

  async function fetchOpenOrders() {
    try {
      const { data, error: orderError } = await supabaseBrowserClient
        .from("customer_orders")
        .select(
          `
          id,
          order_ref,
          status,
          customer_id,
          customers:customer_id (
            id,
            name
          )
        `
        )
        .in("status", ["OPEN", "PARTIALLY_FULFILLED"]);

      if (orderError) throw orderError;
      setCustomerOrders((orderError ? [] : (data as CustomerOrder[])) || []);
    } catch (err: any) {
      console.error("Failed to load customer orders", err);
      setError(err?.message || "Failed to load customer orders.");
    }
  }

  // Helper function to check if a roll matches a requirement
  const rollMatchesRequirement = (roll: StoreRoll, req: OrderRequirement): boolean => {
    // Primary matching: Use catalog IDs
    if (roll.fabric_type_id && roll.color_option_id && req.fabric_type_id && req.color_option_id) {
      // Must match fabric_type_id and color_option_id
      if (roll.fabric_type_id !== req.fabric_type_id || roll.color_option_id !== req.color_option_id) {
        return false;
      }
      // If gsm_option_id exists on both, they must match
      if (req.gsm_option_id && roll.gsm_option_id && roll.gsm_option_id !== req.gsm_option_id) {
        return false;
      }
      // If width_option_id exists on both, they must match
      if (req.width_option_id && roll.width_option_id && roll.width_option_id !== req.width_option_id) {
        return false;
      }
      return true;
    }

    // Fallback: Text matching for legacy data
    if (req.isLegacyMatch && roll.coating_type && roll.color) {
      const normalizedRollCoating = (roll.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedRollColor = (roll.color || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedRollGsm = roll.gsm ? roll.gsm.toString().trim().toLowerCase() : "";
      const normalizedReqCoating = (req.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedReqColor = (req.color || "").trim().toLowerCase().replace(/\s+/g, " ");

      return (
        normalizedRollCoating === normalizedReqCoating &&
        normalizedRollColor === normalizedReqColor &&
        (!req.gsm_option_id || normalizedRollGsm === (req.gsm || "").trim().toLowerCase())
      );
    }

    return false;
  };

  // Check if a roll matches any order requirement (must be defined before filteredRolls)
  const rollMatchesOrder = useMemo(() => {
    const matchMap: Record<string, { matches: boolean; isLegacy: boolean }> = {};
    stockRolls.forEach((roll) => {
      let matches = false;
      let isLegacy = false;
      for (const req of orderRequirements) {
        if (rollMatchesRequirement(roll, req)) {
          matches = true;
          isLegacy = req.isLegacyMatch;
          break;
        }
      }
      matchMap[roll.id] = { matches, isLegacy };
    });
    return matchMap;
  }, [stockRolls, orderRequirements]);

  const filteredRolls = useMemo(() => {
    return stockRolls.filter((roll) => {
      const matchesGrade = gradeFilter === "ALL" || roll.grade === gradeFilter;
      const matchesSearch =
        searchTerm.trim() === "" ||
        (roll.roll_no || "").toLowerCase().includes(searchTerm.trim().toLowerCase());
      const matchesOrder =
        !showOnlyMatching ||
        !selectedOrderId ||
        rollMatchesOrder[roll.id]?.matches === true;
      return matchesGrade && matchesSearch && matchesOrder;
    });
  }, [stockRolls, gradeFilter, searchTerm, showOnlyMatching, selectedOrderId, rollMatchesOrder]);

  const selectedRolls = useMemo(
    () => filteredRolls.filter((r) => selectedRollIds.has(r.id)),
    [filteredRolls, selectedRollIds]
  );

  // Helper function to build match key from roll
  const buildRollKey = (roll: StoreRoll): string | null => {
    if (roll.fabric_type_id && roll.color_option_id) {
      const parts = [
        roll.fabric_type_id,
        roll.color_option_id,
        roll.gsm_option_id || "",
        roll.width_option_id || "",
      ];
      return parts.join("|");
    }
    // Fallback for legacy data
    if (roll.coating_type && roll.color) {
      const normalizedCoating = (roll.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedColor = (roll.color || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedGsm = roll.gsm ? roll.gsm.toString().trim().toLowerCase() : "";
      return `TEXT|${normalizedCoating}|${normalizedColor}|${normalizedGsm}`;
    }
    return null;
  };

  // Compute selected meters per requirement key
  const selectedMetersByKey = useMemo(() => {
    const map: Record<string, number> = {};
    selectedRolls.forEach((roll) => {
      const key = buildRollKey(roll);
      if (key) {
        map[key] = (map[key] || 0) + roll.length_m;
      }
    });
    return map;
  }, [selectedRolls]);

  // Update order requirements with selected meters
  const requirementsWithSelected = useMemo(() => {
    return orderRequirements.map((req) => ({
      ...req,
      selected_m: selectedMetersByKey[req.key] || 0,
      remaining_m: req.ordered_m - req.issued_m - (selectedMetersByKey[req.key] || 0),
    }));
  }, [orderRequirements, selectedMetersByKey]);

  function toggleSelect(id: string) {
    const roll = filteredRolls.find((r) => r.id === id);
    if (!roll) return;

    // If already selected, just deselect
    if (selectedRollIds.has(id)) {
      setSelectedRollIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    // For customer orders, validate before selecting
    if (destination === "CUSTOMER" && selectedOrderId) {
      const key = buildRollKey(roll);

      if (key) {
        const requirement = requirementsWithSelected.find((req) => {
          return rollMatchesRequirement(roll, req);
        });

        if (requirement) {
          // Check if adding this roll would exceed remaining
          const requirementKey = requirement.key;
          const newSelected = (selectedMetersByKey[requirementKey] || 0) + roll.length_m;
          const newRemaining = requirement.ordered_m - requirement.issued_m - newSelected;

          if (newRemaining < 0) {
            setError(
              `Cannot select more than ordered for ${requirement.color} (${requirement.coating_type}). Remaining: ${requirement.remaining_m.toFixed(3)} m`
            );
            setTimeout(() => setError(null), 5000);
            return;
          }
        } else {
          // Roll doesn't match any order line - warn but allow
          const confirmed = window.confirm(
            `This roll (${roll.color || "Unknown"} ${roll.coating_type || "Unknown"}) does not match any order line. Continue?`
          );
          if (!confirmed) return;
        }
      }
    }

    setSelectedRollIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (selectedRollIds.size === 0) {
      setError("Select at least one roll to issue.");
      return;
    }

    if (destination === "CUSTOMER" && !selectedOrderId) {
      setError("Select a customer order to issue against.");
      return;
    }

    // Final validation for customer orders
    if (destination === "CUSTOMER" && selectedOrderId) {
      const invalidRequirements = requirementsWithSelected.filter((req) => req.remaining_m < 0);
      if (invalidRequirements.length > 0) {
        setError(
          `Cannot issue: Selected quantities exceed ordered amounts for: ${invalidRequirements.map((r) => `${r.color} (${r.coating_type})`).join(", ")}`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();

      const { data: issue, error: issueError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .insert({
          issued_by: userData?.user?.id || null,
          destination: destination || null,
          reference:
            destination === "CUSTOMER" && !reference
              ? customerOrders.find((o) => o.id === selectedOrderId)?.order_no || null
              : reference || null,
          notes: notes || null,
          order_id: destination === "CUSTOMER" ? selectedOrderId : null,
          invoice_no: destination === "CUSTOMER" ? invoiceNo || null : null,
          gate_pass_no: destination === "CUSTOMER" ? gatePassNo || null : null,
        })
        .select("id, issue_no")
        .single();

      if (issueError) throw issueError;

      const lineRows = selectedRolls.map((roll) => ({
        issue_id: issue.id,
        roll_id: roll.id,
        roll_no: roll.roll_no,
        length_m: roll.length_m,
        grade: roll.grade,
      }));

      const { error: lineError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_items")
        .insert(lineRows);
      if (lineError) throw lineError;

      const { error: updateError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .update({
          current_location: LOCATION_DISPATCHED,
          status: STATUS_ISSUED,
          issued_store_at: new Date().toISOString(),
          issued_store_by: userData?.user?.id || null,
        })
        .in("id", Array.from(selectedRollIds));
      if (updateError) throw updateError;

      if (destination === "CUSTOMER" && selectedOrderId) {
        await supabaseBrowserClient
          .from("customer_orders")
          .update({
            status: "PARTIALLY_FULFILLED",
          })
          .eq("id", selectedOrderId)
          .in("status", ["OPEN", "PARTIALLY_FULFILLED"]);
      }

      setSuccess("Store issue created.");
      router.push(`/toolbox/finished-fabric/store/issues/${issue.id}`);
    } catch (err: any) {
      console.error("Failed to create store issue", err);
      setError(err.message || "Failed to create store issue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Issue from Finished Store</h1>
          <p className="mt-1 text-slate-600">
            Select rolls in store to issue for dispatch or internal use.
          </p>
        </div>
        <BackButton href="/toolbox/finished-fabric/store" label="Back to Store" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {success}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Destination</label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              >
                <option value="DISPATCH">Dispatch</option>
                <option value="CUSTOMER">Customer</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Reference</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional dispatch/customer ref"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional notes"
              />
            </div>
          </div>

          {destination === "CUSTOMER" && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Customer Order
                  </label>
                  <select
                    value={selectedOrderId}
                    onChange={(e) => {
                      setSelectedOrderId(e.target.value);
                      setSelectedRollIds(new Set()); // Clear selection when order changes
                    }}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                    required
                  >
                    <option value="">Select order</option>
                    {customerOrders.map((o) => {
                      const label =
                        o.order_ref || (o.id ? o.id.slice(0, 8) : "Order");
                      const customerLabel = o.customers?.name ? ` — ${o.customers.name}` : "";
                      const statusLabel = o.status ? ` (${o.status})` : "";
                      return (
                        <option key={o.id} value={o.id}>
                          {label}
                          {customerLabel}
                          {statusLabel}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Only OPEN or PARTIALLY_FULFILLED orders are listed.
                  </p>
                </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="Optional invoice number"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Gate Pass Number
                </label>
                <input
                  type="text"
                  value={gatePassNo}
                  onChange={(e) => setGatePassNo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="Optional (can be left blank)"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Leave blank for security to write it on the printed document.
                </p>
              </div>
            </div>

              {/* Order Requirements Panel */}
              {selectedOrderId && requirementsWithSelected.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-teal-200 bg-teal-50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Order Requirements</h3>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={showOnlyMatching}
                        onChange={(e) => setShowOnlyMatching(e.target.checked)}
                        className="h-3 w-3 rounded border-slate-300"
                      />
                      Show only matching rolls
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-teal-200">
                          <th className="px-2 py-1.5 text-left font-semibold text-slate-700">Type</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-slate-700">Colour</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-slate-700">Ordered (m)</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-slate-700">Issued (m)</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-slate-700">Selected (m)</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-slate-700">Remaining (m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirementsWithSelected.map((req) => {
                          const isOver = req.remaining_m < 0;
                          return (
                            <tr
                              key={req.key}
                              className={`border-b border-teal-100 ${isOver ? "bg-red-50" : ""}`}
                            >
                              <td className="px-2 py-1.5 text-slate-700">{req.coating_type}</td>
                              <td className="px-2 py-1.5 text-slate-700">{req.color}</td>
                              <td className="px-2 py-1.5 text-right text-slate-700">
                                {req.ordered_m.toFixed(3)}
                              </td>
                              <td className="px-2 py-1.5 text-right text-slate-600">
                                {req.issued_m.toFixed(3)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium text-slate-900">
                                {req.selected_m.toFixed(3)}
                              </td>
                              <td
                                className={`px-2 py-1.5 text-right font-semibold ${
                                  isOver ? "text-red-700" : req.remaining_m < req.ordered_m * 0.1 ? "text-orange-600" : "text-teal-700"
                                }`}
                              >
                                {req.remaining_m.toFixed(3)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Grade</label>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value as GradeFilter)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                >
                  <option value="ALL">All</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="SCRAP">Scrap</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Search Roll</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="Roll No..."
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || filteredRolls.length === 0}
            >
              Create Store Issue
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-600">Loading store stock...</p>
          ) : filteredRolls.length === 0 ? (
            <p className="text-sm text-slate-600">No rolls available in store.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedRollIds.size === filteredRolls.length && filteredRolls.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            // For customer orders, only select valid rolls
                            if (destination === "CUSTOMER" && selectedOrderId) {
                              const validIds = new Set<string>();
                              filteredRolls.forEach((roll) => {
                                const requirement = requirementsWithSelected.find((req) =>
                                  rollMatchesRequirement(roll, req)
                                );
                                if (requirement) {
                                  const requirementKey = requirement.key;
                                  const currentSelected = selectedMetersByKey[requirementKey] || 0;
                                  const newSelected = currentSelected + roll.length_m;
                                  const newRemaining = requirement.ordered_m - requirement.issued_m - newSelected;
                                  if (newRemaining >= 0) {
                                    validIds.add(roll.id);
                                  }
                                } else if (rollMatchesOrder[roll.id]?.matches) {
                                  // Matches order but not in requirements (shouldn't happen, but safe)
                                  validIds.add(roll.id);
                                }
                              });
                              setSelectedRollIds(validIds);
                            } else {
                              setSelectedRollIds(new Set(filteredRolls.map((r) => r.id)));
                            }
                          } else {
                            setSelectedRollIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRolls.map((roll) => {
                    const matchInfo = rollMatchesOrder[roll.id];
                    const matchesOrder = matchInfo?.matches === true;
                    const isLegacyMatch = matchInfo?.isLegacy === true;
                    const isMismatch = destination === "CUSTOMER" && selectedOrderId && !matchesOrder;
                    return (
                      <tr
                        key={roll.id}
                        className={`border-b border-slate-100 hover:bg-slate-50 ${
                          isMismatch ? "bg-yellow-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRollIds.has(roll.id)}
                            onChange={() => toggleSelect(roll.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {roll.roll_no || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{roll.length_m.toFixed(3)}</td>
                        <td className="px-4 py-3 text-slate-900">{roll.grade || "—"}</td>
                        <td className="px-4 py-3 text-slate-900">
                          {roll.color || "—"}
                          {isMismatch && (
                            <span className="ml-2 rounded bg-yellow-200 px-1.5 py-0.5 text-xs text-yellow-800">
                              No match
                            </span>
                          )}
                          {isLegacyMatch && matchesOrder && (
                            <span className="ml-2 rounded bg-orange-200 px-1.5 py-0.5 text-xs text-orange-800">
                              Legacy data
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{roll.coating_type || "—"}</td>
                        <td className="px-4 py-3 text-slate-900">
                          {roll.gsm ? roll.gsm.toString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </form>
      </motion.section>
    </div>
  );
}

