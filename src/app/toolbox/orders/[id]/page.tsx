"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

type OrderStatus = "OPEN" | "PARTIALLY_FULFILLED" | "COMPLETED" | "CANCELLED";

interface CustomerRef {
  id: string;
  name: string;
  pastel_code: string | null;
}

interface CustomerOrder {
  id: string;
  order_ref: string;
  customer_id: string | null;
  customer: CustomerRef | null;
  legacy_customer_name?: string | null;
  notes?: string | null;
  status: OrderStatus;
  invoice_no?: string | null;
  gate_pass_no?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  parent_order_id?: string | null;
  is_back_order?: boolean;
}

interface BackOrderSummary {
  id: string;
  order_ref: string;
  status: string;
}

interface OrderLine {
  id: string;
  fabric_type_id: string | null;
  gsm_option_id: string | null;
  color_option_id: string | null;
  width_option_id: string | null;
  coating_type: string;
  color: string;
  gsm: string | null;
  quantity_m: number;
  notes: string | null;
}

interface FabricType {
  id: string;
  code: string;
  name: string;
}

interface GsmOption {
  id: string;
  fabric_type_id: string;
  gsm: number;
}

interface ColorOption {
  id: string;
  fabric_type_id: string;
  color_name: string;
}

interface WidthOption {
  id: string;
  fabric_type_id: string;
  width_mm: number;
}

interface IssueSummary {
  id: string;
  issue_no: number | null;
  issue_time: string;
  destination: string | null;
  invoice_no: string | null;
  gate_pass_no: string | null;
  total_length_m: number;
}

export default function CustomerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [backOrders, setBackOrders] = useState<BackOrderSummary[]>([]);
  const [parentOrderRef, setParentOrderRef] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [gatePassNo, setGatePassNo] = useState("");
  const [status, setStatus] = useState<OrderStatus>("OPEN");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLines, setIsSavingLines] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fabricTypes, setFabricTypes] = useState<FabricType[]>([]);
  const [gsmOptions, setGsmOptions] = useState<GsmOption[]>([]);
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [widthOptions, setWidthOptions] = useState<WidthOption[]>([]);

  useEffect(() => {
    if (orderId) {
      fetchData();
      fetchCatalogData();
    }
  }, [orderId]);

  async function fetchCatalogData() {
    try {
      // Fetch fabric types
      const { data: typesData, error: typesError } = await supabaseBrowserClient
        .from("fabric_types")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (typesError) {
        console.error("Error fetching fabric_types:", typesError);
        throw typesError;
      }
      setFabricTypes((typesData as FabricType[]) || []);

      // Fetch all GSM options
      const { data: gsmData, error: gsmError } = await supabaseBrowserClient
        .from("fabric_type_gsm_options")
        .select("id, fabric_type_id, gsm")
        .eq("is_active", true)
        .order("gsm", { ascending: true });
      if (gsmError) {
        console.error("Error fetching fabric_type_gsm_options:", gsmError);
        throw gsmError;
      }
      setGsmOptions((gsmData as GsmOption[]) || []);

      // Fetch all color options
      const { data: colorData, error: colorError } = await supabaseBrowserClient
        .from("fabric_type_color_options")
        .select("id, fabric_type_id, color_name")
        .eq("is_active", true)
        .order("color_name", { ascending: true });
      if (colorError) {
        console.error("Error fetching fabric_type_color_options:", colorError);
        throw colorError;
      }
      setColorOptions((colorData as ColorOption[]) || []);

      // Fetch all width options
      const { data: widthData, error: widthError } = await supabaseBrowserClient
        .from("fabric_type_width_options")
        .select("id, fabric_type_id, width_mm")
        .eq("is_active", true)
        .order("width_mm", { ascending: true });
      if (widthError) {
        console.error("Error fetching fabric_type_width_options:", widthError);
        throw widthError;
      }
      setWidthOptions((widthData as WidthOption[]) || []);
    } catch (err: any) {
      console.error("Failed to load catalog data", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        error: err
      });
      // Don't set error state here as it's not critical - catalog is optional for display
      // The page can still work with text fields as fallback
      // Initialize with empty arrays so the page doesn't break
      if (fabricTypes.length === 0) setFabricTypes([]);
      if (gsmOptions.length === 0) setGsmOptions([]);
      if (colorOptions.length === 0) setColorOptions([]);
      if (widthOptions.length === 0) setWidthOptions([]);
    }
  }

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);
      // Try to fetch with catalog IDs first, fallback to text-only if schema cache hasn't refreshed
      let orderData: any;
      let orderError: any;
      
      try {
        const result = await supabaseBrowserClient
          .from("customer_orders")
          .select(
            `
            id,
            order_ref,
            customer_id,
            customer_name,
            notes,
            status,
            invoice_no,
            gate_pass_no,
            completed_at,
            created_at,
            parent_order_id,
            is_back_order,
            customers:customer_id (
              id,
              name,
              pastel_code
            ),
            customer_order_lines (
              id,
              fabric_type_id,
              gsm_option_id,
              color_option_id,
              width_option_id,
              coating_type,
              color,
              gsm,
              quantity_m,
              notes,
              created_at
            )
          `
          )
          .eq("id", orderId)
          .single();
        orderData = result.data;
        orderError = result.error;
      } catch (err: any) {
        // If catalog columns don't exist yet (schema cache issue), try without them
        if (err?.code === '42703' || err?.message?.includes('does not exist')) {
          const result = await supabaseBrowserClient
            .from("customer_orders")
            .select(
              `
              id,
              order_ref,
              customer_id,
              customer_name,
              notes,
              status,
              invoice_no,
              gate_pass_no,
              completed_at,
              created_at,
              parent_order_id,
              is_back_order,
              customers:customer_id (
                id,
                name,
                pastel_code
              ),
              customer_order_lines (
                id,
                coating_type,
                color,
                gsm,
                quantity_m,
                notes,
                created_at
              )
            `
            )
            .eq("id", orderId)
            .single();
          orderData = result.data;
          orderError = result.error;
        } else {
          orderError = err;
        }
      }
      if (orderError) throw orderError;

      const hasBackOrderColumns =
        orderData.parent_order_id !== undefined || orderData.is_back_order !== undefined;

      const normalizedOrder: CustomerOrder = {
        id: orderData.id,
        order_ref: orderData.order_ref,
        customer_id: orderData.customer_id ?? null,
        legacy_customer_name: orderData.customer_name ?? null,
        customer: orderData.customers
          ? {
              id: orderData.customers.id,
              name: orderData.customers.name,
              pastel_code: orderData.customers.pastel_code ?? null,
            }
          : null,
        notes: orderData.notes ?? null,
        status: orderData.status || "OPEN",
        invoice_no: orderData.invoice_no ?? null,
        gate_pass_no: orderData.gate_pass_no ?? null,
        completed_at: orderData.completed_at ?? null,
        created_at: orderData.created_at ?? null,
        parent_order_id: hasBackOrderColumns ? (orderData.parent_order_id ?? null) : null,
        is_back_order: hasBackOrderColumns ? (orderData.is_back_order === true) : false,
      };

      setOrder(normalizedOrder);

      // Fetch back orders and parent ref only when back order columns exist (after migration)
      if (hasBackOrderColumns) {
        const { data: backOrdersData } = await supabaseBrowserClient
          .from("customer_orders")
          .select("id, order_ref, status")
          .eq("parent_order_id", orderId)
          .order("created_at", { ascending: true });
        setBackOrders((backOrdersData as BackOrderSummary[]) || []);

        if (orderData.parent_order_id) {
          const { data: parentData } = await supabaseBrowserClient
            .from("customer_orders")
            .select("order_ref")
            .eq("id", orderData.parent_order_id)
            .single();
          setParentOrderRef(parentData?.order_ref ?? null);
        } else {
          setParentOrderRef(null);
        }
      } else {
        setBackOrders([]);
        setParentOrderRef(null);
      }
      setInvoiceNo(normalizedOrder.invoice_no || "");
      setGatePassNo(normalizedOrder.gate_pass_no || "");
      setStatus(normalizedOrder.status || "OPEN");

      const mappedLines: OrderLine[] =
        (orderData.customer_order_lines || []).map((l: any) => ({
          id: l.id,
          // Catalog IDs may not exist if schema cache hasn't refreshed
          fabric_type_id: l.fabric_type_id ?? null,
          gsm_option_id: l.gsm_option_id ?? null,
          color_option_id: l.color_option_id ?? null,
          width_option_id: l.width_option_id ?? null,
          // Text fields for backward compatibility
          coating_type: l.coating_type || "",
          color: l.color || "",
          gsm: l.gsm,
          quantity_m: Number(l.quantity_m || 0),
          notes: l.notes ?? null,
        })) || [];
      setLines(mappedLines);

      const { data: issuesData, error: issuesError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select(
          `
          id,
          issue_no,
          issue_time,
          destination,
          invoice_no,
          gate_pass_no,
          finished_fabric_store_issue_items ( length_m )
        `
        )
        .eq("order_id", orderId)
        .eq("destination", "CUSTOMER")
        .order("issue_time", { ascending: false });
      if (issuesError) throw issuesError;

      const mappedIssues: IssueSummary[] =
        (issuesData || []).map((row: any) => {
          const total = (row.finished_fabric_store_issue_items || []).reduce(
            (sum: number, line: any) => sum + Number(line.length_m || 0),
            0
          );
          return {
            id: row.id,
            issue_no: row.issue_no ?? null,
            issue_time: row.issue_time,
            destination: row.destination ?? null,
            invoice_no: row.invoice_no ?? null,
            gate_pass_no: row.gate_pass_no ?? null,
            total_length_m: total,
          };
        }) || [];
      setIssues(mappedIssues);

      // Auto bump to PARTIALLY_FULFILLED if open and issues exist
      if (normalizedOrder.status === "OPEN" && mappedIssues.length > 0) {
        await supabaseBrowserClient
          .from("customer_orders")
          .update({ status: "PARTIALLY_FULFILLED" })
          .eq("id", orderId)
          .eq("status", "OPEN");
        setStatus("PARTIALLY_FULFILLED");
        setOrder((prev) => (prev ? { ...prev, status: "PARTIALLY_FULFILLED" } : prev));
      }
    } catch (err: any) {
      console.error("Failed to load order", err);
      setError(err.message || "Failed to load order.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveStatus(newStatus?: OrderStatus) {
    if (!orderId) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updatePayload: any = {
        invoice_no: invoiceNo || null,
        gate_pass_no: gatePassNo || null,
      };
      if (newStatus) {
        updatePayload.status = newStatus;
        if (newStatus === "COMPLETED") {
          updatePayload.completed_at = new Date().toISOString();
        } else {
          updatePayload.completed_at = null;
        }
      }

      const { error: updateError } = await supabaseBrowserClient
        .from("customer_orders")
        .update(updatePayload)
        .eq("id", orderId);
      if (updateError) throw updateError;

      setSuccess("Order updated.");
      await fetchData();
    } catch (err: any) {
      console.error("Failed to update order", err);
      setError(err.message || "Failed to update order.");
    } finally {
      setIsSaving(false);
    }
  }

  const orderLabel = useMemo(() => {
    if (!order) return "";
    return order.order_ref || order.id || "";
  }, [order]);

  function formatIssueNo(issueNo: number | null) {
    if (issueNo === null || issueNo === undefined) return "N/A";
    return `FFSI-${String(issueNo).padStart(6, "0")}`;
  }

  function formatDate(dateString?: string | null) {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleString("en-ZA", {
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

  const totalIssued = issues.reduce((sum, iss) => sum + (iss.total_length_m || 0), 0);
  const totalOrdered = lines.reduce((sum, l) => sum + (l.quantity_m || 0), 0);
  const remaining = totalOrdered ? totalOrdered - totalIssued : null;
  const hasCustomerIssues = issues.length > 0;
  const canComplete = order?.status !== "COMPLETED" && hasCustomerIssues;

  function formatQuantity(q?: number | null) {
    if (q === null || q === undefined) return "—";
    return Number(q).toFixed(3);
  }

  async function handleAddLine() {
    if (!orderId) return;
    setIsSavingLines(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("customer_order_lines")
        .insert({
          order_id: orderId,
          fabric_type_id: null,
          gsm_option_id: null,
          color_option_id: null,
          width_option_id: null,
          coating_type: "",
          color: "",
          gsm: null,
          quantity_m: 0,
          notes: null,
        })
        .select("*")
        .single();
      if (error) throw error;
      setLines((prev) => [
        ...prev,
        {
          id: data.id,
          fabric_type_id: data.fabric_type_id ?? null,
          gsm_option_id: data.gsm_option_id ?? null,
          color_option_id: data.color_option_id ?? null,
          width_option_id: data.width_option_id ?? null,
          coating_type: data.coating_type,
          color: data.color,
          gsm: data.gsm,
          quantity_m: Number(data.quantity_m || 0),
          notes: data.notes,
        },
      ]);
    } catch (err: any) {
      console.error("Failed to add line", err);
      setError(err.message || "Failed to add line.");
    } finally {
      setIsSavingLines(false);
    }
  }

  async function handleUpdateLine(id: string, patch: Partial<OrderLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

    setIsSavingLines(true);
    setError(null);
    setSuccess(null);
    try {
      const line = lines.find((l) => l.id === id);
      const merged = { ...line, ...patch };

      // Resolve text values from catalog for backward compatibility
      const fabricType = merged.fabric_type_id
        ? fabricTypes.find((ft) => ft.id === merged.fabric_type_id)
        : null;
      const colorOpt = merged.color_option_id
        ? colorOptions.find((c) => c.id === merged.color_option_id)
        : null;
      const gsmOpt = merged.gsm_option_id
        ? gsmOptions.find((g) => g.id === merged.gsm_option_id)
        : null;
      const widthOpt = merged.width_option_id
        ? widthOptions.find((w) => w.id === merged.width_option_id)
        : null;

      const updatePayload: any = {
        fabric_type_id: merged.fabric_type_id || null,
        gsm_option_id: merged.gsm_option_id || null,
        color_option_id: merged.color_option_id || null,
        width_option_id: merged.width_option_id || null,
        // Backward compatibility: update text fields
        coating_type: fabricType?.code || merged.coating_type || null,
        color: colorOpt?.color_name || merged.color || null,
        gsm: gsmOpt?.gsm?.toString() || merged.gsm || null,
        quantity_m: merged.quantity_m,
        notes: merged.notes,
      };

      // If fabric_type_id changed, clear dependent options
      if (patch.fabric_type_id !== undefined && patch.fabric_type_id !== line?.fabric_type_id) {
        updatePayload.gsm_option_id = null;
        updatePayload.color_option_id = null;
        updatePayload.width_option_id = null;
      }

      const { error } = await supabaseBrowserClient
        .from("customer_order_lines")
        .update(updatePayload)
        .eq("id", id);
      if (error) throw error;
    } catch (err: any) {
      console.error("Failed to update line", err);
      setError(err.message || "Failed to update line.");
      await fetchData();
    } finally {
      setIsSavingLines(false);
    }
  }

  async function handleDeleteLine(id: string) {
    if (!window.confirm("Remove this line from the order?")) return;
    setIsSavingLines(true);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabaseBrowserClient
        .from("customer_order_lines")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setLines((prev) => prev.filter((l) => l.id !== id));
    } catch (err: any) {
      console.error("Failed to delete line", err);
      setError(err.message || "Failed to delete line.");
      await fetchData();
    } finally {
      setIsSavingLines(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        Loading order...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 shadow-sm text-red-700">
        {error || "Order not found."}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Customer Order</h1>
          <p className="mt-1 text-slate-600">
            {orderLabel ? `Order: ${orderLabel}` : "Order detail"}
          </p>
        </div>
        <BackButton href="/toolbox/orders" label="Back to Orders" />
      </div>

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Parent order / Back orders */}
      {(order?.is_back_order && order?.parent_order_id) || backOrders.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-4 text-sm">
            {order?.is_back_order && order?.parent_order_id && (
              <div>
                <span className="text-slate-500">Parent order: </span>
                <Link
                  href={`/toolbox/orders/${order.parent_order_id}`}
                  className="font-semibold text-teal-700 hover:text-teal-900 underline"
                >
                  {parentOrderRef ?? order.parent_order_id}
                </Link>
              </div>
            )}
            {backOrders.length > 0 && (
              <div>
                <span className="text-slate-500">Back orders: </span>
                {backOrders.map((bo) => (
                  <Link
                    key={bo.id}
                    href={`/toolbox/orders/${bo.id}`}
                    className="font-semibold text-teal-700 hover:text-teal-900 underline mr-2"
                  >
                    {bo.order_ref}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Customer</p>
            <p className="text-lg font-semibold text-slate-900">
              {order.customer?.name || order.legacy_customer_name || "—"}
            </p>
            {order.customer?.pastel_code && (
              <p className="text-xs text-slate-500 mt-1">
                Pastel: {order.customer.pastel_code}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-slate-500">Order Ref</p>
            <p className="text-lg font-semibold text-slate-900">
              {order.order_ref}
              {order.is_back_order && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Back order
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Status</p>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
              {order.status}
            </span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Created</p>
            <p className="text-sm text-slate-900">{formatDate(order.created_at)}</p>
          </div>
        </div>
      </section>

      {/* Order lines */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Order Lines</h2>
            <p className="text-sm text-slate-600">
              Fabric requests recorded exactly as received from the customer.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            isLoading={isSavingLines}
            onClick={handleAddLine}
          >
            Add Line
          </Button>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-slate-600">No lines yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Fabric Type
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Width (mm)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Quantity (m)
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Notes</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const availableGsm = line.fabric_type_id
                    ? gsmOptions.filter((g) => g.fabric_type_id === line.fabric_type_id)
                    : [];
                  const availableColors = line.fabric_type_id
                    ? colorOptions.filter((c) => c.fabric_type_id === line.fabric_type_id)
                    : [];
                  const availableWidths = line.fabric_type_id
                    ? widthOptions.filter((w) => w.fabric_type_id === line.fabric_type_id)
                    : [];
                  return (
                    <tr key={line.id} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <select
                          value={line.fabric_type_id || ""}
                          onChange={(e) =>
                            handleUpdateLine(line.id, {
                              fabric_type_id: e.target.value || null,
                              gsm_option_id: null,
                              color_option_id: null,
                              width_option_id: null,
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                        >
                          <option value="">Select</option>
                          {fabricTypes.map((ft) => (
                            <option key={ft.id} value={ft.id}>
                              {ft.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={line.color_option_id || ""}
                          onChange={(e) =>
                            handleUpdateLine(line.id, { color_option_id: e.target.value || null })
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                          disabled={!line.fabric_type_id}
                        >
                          <option value="">Select colour</option>
                          {availableColors.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.color_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={line.gsm_option_id || ""}
                          onChange={(e) =>
                            handleUpdateLine(line.id, { gsm_option_id: e.target.value || null })
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                          disabled={!line.fabric_type_id}
                        >
                          <option value="">Select GSM</option>
                          {availableGsm.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.gsm}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={line.width_option_id || ""}
                          onChange={(e) =>
                            handleUpdateLine(line.id, { width_option_id: e.target.value || null })
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                          disabled={!line.fabric_type_id}
                        >
                          <option value="">Select width</option>
                          {availableWidths.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.width_mm} mm
                            </option>
                          ))}
                        </select>
                      </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={line.quantity_m}
                        onChange={(e) =>
                          handleUpdateLine(line.id, {
                            quantity_m: Number(e.target.value || 0),
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={line.notes || ""}
                        onChange={(e) => handleUpdateLine(line.id, { notes: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDeleteLine(line.id)}
                        className="text-xs md:text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 text-sm text-slate-700">
          <div>Total ordered: {formatQuantity(totalOrdered)} m</div>
          {remaining !== null && (
            <div className="text-slate-600">Remaining vs issued: {formatQuantity(remaining)} m</div>
          )}
        </div>
      </section>

      {/* Commercial completion */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-3">Invoice & Gate Pass</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Invoice No</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Invoice number"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Gate Pass No</label>
            <input
              type="text"
              value={gatePassNo}
              onChange={(e) => setGatePassNo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Gate pass number"
            />
            <p className="mt-1 text-xs text-slate-500">Leave blank for security to write manually.</p>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            >
              <option value="OPEN">OPEN</option>
              <option value="PARTIALLY_FULFILLED">PARTIALLY_FULFILLED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <Button
            variant="secondary"
            isLoading={isSaving}
            onClick={() => handleSaveStatus(status)}
            disabled={isSaving}
          >
            Save
          </Button>
          {canComplete ? (
            <Button
              variant="primary"
              isLoading={isSaving}
              onClick={() => handleSaveStatus("COMPLETED")}
              disabled={isSaving}
            >
              Mark Completed
            </Button>
          ) : null}
        </div>
        {!hasCustomerIssues && order.status !== "COMPLETED" && (
          <p className="mt-2 text-xs text-slate-500">
            Complete is available after fabric is issued to this order.
          </p>
        )}
      </section>

      {/* Linked dispatches */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Linked Dispatches</h2>
            <p className="text-sm text-slate-600">
              Store issues to CUSTOMER linked to this order.
            </p>
          </div>
          <div className="text-sm text-slate-700">
            <div>Total issued: {totalIssued.toFixed(3)} m</div>
            {remaining !== null && (
              <div className="text-slate-600">
                Remaining: {remaining.toFixed(3)} m
              </div>
            )}
          </div>
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-slate-600">No store issues yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Issue No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Gate Pass</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Total (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((iss) => (
                  <tr key={iss.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900 font-medium">{formatIssueNo(iss.issue_no)}</td>
                    <td className="px-4 py-3 text-slate-900">{formatDate(iss.issue_time)}</td>
                    <td className="px-4 py-3 text-slate-900">{iss.invoice_no || "—"}</td>
                    <td className="px-4 py-3 text-slate-900">{iss.gate_pass_no || "—"}</td>
                    <td className="px-4 py-3 text-slate-900">{iss.total_length_m.toFixed(3)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="px-3 py-2 text-sm"
                          onClick={() =>
                            router.push(`/toolbox/finished-fabric/store/issues/${iss.id}/packing-list`)
                          }
                        >
                          Packing List
                        </Button>
                        <Button
                          variant="outline"
                          className="px-3 py-2 text-sm"
                          onClick={() => router.push(`/toolbox/finished-fabric/store/issues/${iss.id}`)}
                        >
                          View Issue
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


