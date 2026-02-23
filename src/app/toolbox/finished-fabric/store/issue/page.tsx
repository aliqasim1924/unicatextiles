"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  gsm: string | null; // For fallback text matching
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
  customer_id: string | null;
  invoice_no?: string | null;
  gate_pass_no?: string | null;
  customers?: {
    id: string;
    name: string;
  } | null;
}

export default function FinishedFabricStoreIssuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [overAllocationReason, setOverAllocationReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [orderRequirements, setOrderRequirements] = useState<OrderRequirement[]>([]);
  const [showOnlyMatching, setShowOnlyMatching] = useState(false);
  /** Roll IDs already issued for the currently selected order (so we hide them from stock list) */
  const [alreadyIssuedRollIdsForOrder, setAlreadyIssuedRollIdsForOrder] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchStock();
  }, []);

  useEffect(() => {
    const ref = searchParams.get("reference");
    if (ref) setReference(ref);
  }, [searchParams]);

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
      setAlreadyIssuedRollIdsForOrder(new Set());
    }
  }, [selectedOrderId, destination]);

  // Pre-fill invoice and gate pass from order when selecting an order (carry over from order section)
  useEffect(() => {
    if (destination === "CUSTOMER" && selectedOrderId && customerOrders.length > 0) {
      const sel = customerOrders.find((o) => o.id === selectedOrderId);
      if (sel) {
        setInvoiceNo(sel.invoice_no ?? "");
        setGatePassNo(sel.gate_pass_no ?? "");
      }
    }
  }, [destination, selectedOrderId, customerOrders]);

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
          gsm: string | null;
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
            gsm: line.gsm,
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
      const issuedRollIds = new Set<string>();
      (issuesData || []).forEach((issue: any) => {
        (issue.finished_fabric_store_issue_items || []).forEach((item: any) => {
          if (item.roll_id) issuedRollIds.add(item.roll_id);
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
      setAlreadyIssuedRollIdsForOrder(issuedRollIds);

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
          gsm: data.gsm,
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
          invoice_no,
          gate_pass_no,
          customers:customer_id (
            id,
            name
          )
        `
        )
        .in("status", ["OPEN", "PARTIALLY_FULFILLED"]);

      if (orderError) throw orderError;
      
      // Normalize customers from array to single object (Supabase may return array for foreign keys)
      const normalized = (data || []).map((item: any) => ({
        ...item,
        customers: Array.isArray(item.customers) 
          ? (item.customers[0] || null)
          : item.customers
      }));
      
      setCustomerOrders(normalized as CustomerOrder[]);
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
      // Don't show rolls already issued for the selected order (prevents accidental duplicate selection)
      if (destination === "CUSTOMER" && selectedOrderId && alreadyIssuedRollIdsForOrder.has(roll.id)) {
        return false;
      }
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
  }, [stockRolls, gradeFilter, searchTerm, showOnlyMatching, selectedOrderId, rollMatchesOrder, destination, alreadyIssuedRollIdsForOrder]);

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
          // Allow over-allocation (e.g. grace allowance 2–10 m per roll). User must provide a reason on submit.
          // No longer blocking selection when newRemaining < 0.
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

    // When over-allocated (grace allowance), require a reason
    if (destination === "CUSTOMER" && selectedOrderId) {
      const overAllocatedReqs = requirementsWithSelected.filter((req) => req.remaining_m < 0);
      if (overAllocatedReqs.length > 0) {
        const reasonTrimmed = (overAllocationReason || "").trim();
        if (!reasonTrimmed) {
          setError(
            "Selected quantity exceeds order for some lines (over-allocation). Please provide a reason for over-allocation (e.g. grace allowance meters per roll)."
          );
          return;
        }
      }
    }

    // Prevent double submission
    if (isSubmitting) {
      setError("Please wait, submission in progress...");
      return;
    }

    setIsSubmitting(true);
    let createdIssueId: string | null = null;

    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();

      // CRITICAL: Validate that selected rolls are still available in store before issuing
      const { data: rollStatusCheck, error: statusCheckError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, status, current_location")
        .in("id", Array.from(selectedRollIds));

      if (statusCheckError) throw statusCheckError;

      // Check for rolls that are no longer in store (already issued)
      const unavailableRolls = (rollStatusCheck || []).filter(
        (roll) => roll.status !== STATUS_IN_STORE || roll.current_location !== LOCATION_STORE
      );

      if (unavailableRolls.length > 0) {
        const unavailableRollNos = unavailableRolls.map((r) => r.roll_no || r.id.slice(0, 8)).join(", ");
        throw new Error(
          `Cannot issue: Some rolls are no longer available in store (may have been issued already): ${unavailableRollNos}. Please refresh and try again.`
        );
      }

      // CRITICAL: Check for duplicate issue items (same roll_id already issued for this order)
      // Use two-step query to avoid join filter issues: get issue IDs for order, then items for those issues
      if (destination === "CUSTOMER" && selectedOrderId) {
        const { data: orderIssues, error: orderIssuesError } = await supabaseBrowserClient
          .from("finished_fabric_store_issues")
          .select("id")
          .eq("order_id", selectedOrderId)
          .eq("destination", "CUSTOMER");

        if (orderIssuesError) throw orderIssuesError;

        if (orderIssues && orderIssues.length > 0) {
          const orderIssueIds = orderIssues.map((i: any) => i.id);
          const { data: existingItems, error: existingItemsError } = await supabaseBrowserClient
            .from("finished_fabric_store_issue_items")
            .select("roll_id")
            .in("issue_id", orderIssueIds)
            .in("roll_id", Array.from(selectedRollIds));

          if (existingItemsError) throw existingItemsError;

          if (existingItems && existingItems.length > 0) {
            const duplicateRollIds = [...new Set(existingItems.map((item: any) => item.roll_id))];
            const duplicateRolls = selectedRolls.filter((r) => duplicateRollIds.includes(r.id));
            const duplicateRollNos = duplicateRolls.map((r) => r.roll_no || r.id.slice(0, 8)).join(", ");
            throw new Error(
              `Cannot issue: Some rolls have already been issued for this order: ${duplicateRollNos}. Please refresh and try again.`
            );
          }
        }
      }

      // Create the issue header
      const { data: issue, error: issueError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .insert({
          issued_by: userData?.user?.id || null,
          destination: destination || null,
          reference:
            destination === "CUSTOMER" && !reference
              ? customerOrders.find((o) => o.id === selectedOrderId)?.order_ref || null
              : reference || null,
          notes:
            (notes || "") +
            (destination === "CUSTOMER" &&
            selectedOrderId &&
            requirementsWithSelected.some((r) => r.remaining_m < 0) &&
            (overAllocationReason || "").trim()
              ? "\nOver-allocation reason: " + (overAllocationReason || "").trim()
              : ""),
          order_id: destination === "CUSTOMER" ? selectedOrderId : null,
          invoice_no: destination === "CUSTOMER" ? invoiceNo || null : null,
          gate_pass_no: destination === "CUSTOMER" ? gatePassNo || null : null,
        })
        .select("id, issue_no")
        .single();

      if (issueError) throw issueError;
      createdIssueId = issue.id;

      // Last-moment duplicate check (catches race: another tab or request issued same rolls for this order)
      if (destination === "CUSTOMER" && selectedOrderId) {
        const { data: orderIssues2, error: orderIssues2Error } = await supabaseBrowserClient
          .from("finished_fabric_store_issues")
          .select("id")
          .eq("order_id", selectedOrderId)
          .eq("destination", "CUSTOMER")
          .neq("id", issue.id);

        if (!orderIssues2Error && orderIssues2 && orderIssues2.length > 0) {
          const orderIssueIds2 = orderIssues2.map((i: any) => i.id);
          const { data: existingItems2 } = await supabaseBrowserClient
            .from("finished_fabric_store_issue_items")
            .select("roll_id")
            .in("issue_id", orderIssueIds2)
            .in("roll_id", Array.from(selectedRollIds));

          if (existingItems2 && existingItems2.length > 0) {
            await supabaseBrowserClient.from("finished_fabric_store_issues").delete().eq("id", issue.id);
            throw new Error(
              "Some of these rolls were just issued for this order (e.g. by another tab). Please refresh and try again."
            );
          }
        }
      }

      const rollIdsToIssue = Array.from(selectedRollIds);
      const lineRows = selectedRolls
        .filter((roll) => rollIdsToIssue.includes(roll.id))
        .map((roll) => ({
          issue_id: issue.id,
          roll_id: roll.id,
          roll_no: roll.roll_no,
          length_m: roll.length_m,
          grade: roll.grade,
        }));

      if (lineRows.length === 0) {
        // No valid rolls to issue - delete the issue header we just created
        await supabaseBrowserClient.from("finished_fabric_store_issues").delete().eq("id", issue.id);
        throw new Error("No valid rolls to issue. Some rolls may have been issued by another user.");
      }

      const { error: lineError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_items")
        .insert(lineRows);
      if (lineError) {
        // Rollback: delete the issue header if items insert fails
        await supabaseBrowserClient.from("finished_fabric_store_issues").delete().eq("id", issue.id);
        throw lineError;
      }

      // Update roll statuses - only update rolls that are still in store
      const { error: updateError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .update({
          current_location: LOCATION_DISPATCHED,
          status: STATUS_ISSUED,
          issued_store_at: new Date().toISOString(),
          issued_store_by: userData?.user?.id || null,
        })
        .in("id", rollIdsToIssue)
        .eq("status", STATUS_IN_STORE)
        .eq("current_location", LOCATION_STORE);

      if (updateError) {
        // Rollback: delete issue items and header if roll update fails
        await supabaseBrowserClient.from("finished_fabric_store_issue_items").delete().eq("issue_id", issue.id);
        await supabaseBrowserClient.from("finished_fabric_store_issues").delete().eq("id", issue.id);
        throw updateError;
      }

      // Carry invoice and gate pass to the customer order so they appear on the order section
      if (destination === "CUSTOMER" && selectedOrderId && (invoiceNo || gatePassNo)) {
        await supabaseBrowserClient
          .from("customer_orders")
          .update({
            invoice_no: invoiceNo?.trim() || null,
            gate_pass_no: gatePassNo?.trim() || null,
          })
          .eq("id", selectedOrderId);
      }

      if (destination === "CUSTOMER" && selectedOrderId) {
        await supabaseBrowserClient
          .from("customer_orders")
          .update({
            status: "PARTIALLY_FULFILLED",
          })
          .eq("id", selectedOrderId)
          .in("status", ["OPEN", "PARTIALLY_FULFILLED"]);

        // Create or update back order for remaining quantity (shortfall)
        const shortfallReqs = requirementsWithSelected.filter((req) => req.remaining_m > 0);
        if (shortfallReqs.length > 0) {
          const originalOrder = customerOrders.find((o) => o.id === selectedOrderId);
          const customerId = (originalOrder as CustomerOrder & { customer_id?: string | null })?.customer_id ?? null;
          const orderRef = originalOrder?.order_ref ?? "ORD";

          const { data: existingBackOrder } = await supabaseBrowserClient
            .from("customer_orders")
            .select("id")
            .eq("parent_order_id", selectedOrderId)
            .eq("is_back_order", true)
            .in("status", ["OPEN", "PARTIALLY_FULFILLED"])
            .maybeSingle();

          let backOrderId: string;
          let backOrderRef: string;

          if (existingBackOrder) {
            backOrderId = existingBackOrder.id;
            const { data: bo } = await supabaseBrowserClient
              .from("customer_orders")
              .select("order_ref")
              .eq("id", backOrderId)
              .single();
            backOrderRef = bo?.order_ref ?? "BO";

            await supabaseBrowserClient
              .from("customer_order_lines")
              .delete()
              .eq("order_id", backOrderId);
          } else {
            const { data: newBackOrder, error: boError } = await supabaseBrowserClient
              .from("customer_orders")
              .insert({
                customer_id: customerId,
                parent_order_id: selectedOrderId,
                is_back_order: true,
                order_ref: `BO-${orderRef}`,
                status: "OPEN",
              })
              .select("id, order_ref")
              .single();
            if (boError) throw boError;
            backOrderId = newBackOrder!.id;
            backOrderRef = newBackOrder!.order_ref ?? "BO";
          }

          const backOrderLines = shortfallReqs.map((req) => ({
            order_id: backOrderId,
            fabric_type_id: req.fabric_type_id,
            color_option_id: req.color_option_id,
            gsm_option_id: req.gsm_option_id,
            width_option_id: req.width_option_id,
            coating_type: req.coating_type,
            color: req.color,
            gsm: req.gsm,
            quantity_m: req.remaining_m,
          }));

          const { error: linesErr } = await supabaseBrowserClient
            .from("customer_order_lines")
            .insert(backOrderLines);
          if (linesErr) throw linesErr;

          setSuccess(`Store issue created. Back order ${backOrderRef} created for remaining quantity.`);
          router.push(`/toolbox/finished-fabric/store/issues/${issue.id}?back_order=${backOrderId}`);
          return;
        }
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
                      setOverAllocationReason(""); // Clear over-allocation reason when order changes
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

              {/* Over-allocation reason (required when selected quantity exceeds order) */}
              {requirementsWithSelected.some((r) => r.remaining_m < 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <label className="block text-sm font-semibold text-amber-900 mb-2">
                    Reason for over-allocation (required)
                  </label>
                  <input
                    type="text"
                    value={overAllocationReason}
                    onChange={(e) => setOverAllocationReason(e.target.value)}
                    className="w-full rounded-lg border border-amber-300 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                    placeholder="e.g. Grace allowance meters per roll (2–10 m)"
                  />
                  <p className="mt-1 text-xs text-amber-800">
                    Selected quantity exceeds order for some lines. Please provide a reason (e.g. grace allowance per roll).
                  </p>
                </div>
              )}

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
                            // For customer orders, select all matching rolls (over-allocation allowed with reason)
                            if (destination === "CUSTOMER" && selectedOrderId) {
                              const validIds = new Set<string>();
                              filteredRolls.forEach((roll) => {
                                const requirement = requirementsWithSelected.find((req) =>
                                  rollMatchesRequirement(roll, req)
                                );
                                if (requirement || rollMatchesOrder[roll.id]?.matches) {
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

