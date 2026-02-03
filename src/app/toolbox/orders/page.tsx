"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

type OrderStatus = "OPEN" | "PARTIALLY_FULFILLED" | "COMPLETED" | "CANCELLED";

interface CustomerOrderRow {
  id: string;
  order_ref: string;
  status: OrderStatus;
  created_at: string;
  parent_order_id: string | null;
  is_back_order: boolean;
  customers: {
    id: string;
    name: string;
    pastel_code: string | null;
  } | null;
  total_m: number | null;
}

interface CustomerOrder {
  id: string;
  order_ref: string;
  status: OrderStatus;
  created_at: string;
  customer_name: string;
  customer_pastel_code: string | null;
  total_m: number | null;
  parent_order_id: string | null;
  is_back_order: boolean;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus | "BACK_ORDER">("ALL");

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      setIsLoading(true);
      setError(null);

      let data: any[] | null = null;
      let fetchError: any = null;
      let hasBackOrderColumns = false;

      const result = await supabaseBrowserClient
        .from("customer_orders")
        .select(
          `
          id,
          order_ref,
          status,
          created_at,
          customer_name,
          customer_id,
          parent_order_id,
          is_back_order,
          customers:customer_id (
            id,
            name,
            pastel_code
          ),
          customer_order_lines (
            quantity_m
          )
        `
        )
        .order("created_at", { ascending: false });

      if (result.error?.code === "42703" || result.error?.message?.includes("does not exist")) {
        const fallback = await supabaseBrowserClient
          .from("customer_orders")
          .select(
            `
            id,
            order_ref,
            status,
            created_at,
            customer_name,
            customer_id,
            customers:customer_id (
              id,
              name,
              pastel_code
            ),
            customer_order_lines (
              quantity_m
            )
          `
          )
          .order("created_at", { ascending: false });
        data = fallback.data;
        fetchError = fallback.error;
      } else {
        data = result.data;
        fetchError = result.error;
        hasBackOrderColumns = true;
      }

      if (fetchError) throw fetchError;

      const mapped: CustomerOrder[] =
        ((data as any[]) || []).map((row: any) => {
          const cust = row.customers as CustomerOrderRow["customers"];
          const total =
            (row.customer_order_lines || []).reduce(
              (sum: number, l: any) => sum + Number(l.quantity_m || 0),
              0
            ) || null;

          return {
            id: row.id,
            order_ref: row.order_ref,
            status: row.status || "OPEN",
            created_at: row.created_at,
            customer_name: cust?.name || row.customer_name || "—",
            customer_pastel_code: cust?.pastel_code ?? null,
            total_m: total,
            parent_order_id: hasBackOrderColumns ? (row.parent_order_id ?? null) : null,
            is_back_order: hasBackOrderColumns ? (row.is_back_order === true) : false,
          };
        }) || [];

      setOrders(mapped);
    } catch (err: any) {
      console.error("Failed to load orders", err);
      setError(err?.message || "Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        !search ||
        o.order_ref.toLowerCase().includes(search.toLowerCase()) ||
        o.customer_name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "ALL"
          ? true
          : statusFilter === "BACK_ORDER"
            ? o.is_back_order
            : o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  function formatDate(dateString?: string | null) {
    if (!dateString) return "-";
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
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Orders</h1>
          <p className="mt-1 text-slate-600">Track customer orders for planning and dispatch.</p>
        </div>
        <div className="flex items-center gap-2">
          <BackButton href="/toolbox" label="Back" />
          <Link href="/toolbox/orders/order-book">
            <Button variant="outline">Order Book Report</Button>
          </Link>
          <Link href="/toolbox/orders/returns">
            <Button variant="outline">Returns</Button>
          </Link>
          <Link href="/toolbox/orders/customers">
            <Button variant="outline">Customers</Button>
          </Link>
          <Link href="/toolbox/orders/new">
            <Button variant="primary">New Order</Button>
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Order ref or customer..."
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            >
              <option value="ALL">All</option>
              <option value="BACK_ORDER">Back orders only</option>
              <option value="OPEN">Open</option>
              <option value="PARTIALLY_FULFILLED">Partially Fulfilled</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
            {error}
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-slate-600">Loading orders...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-sm text-slate-600">No orders found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Order Ref</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Total (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => (window.location.href = `/toolbox/orders/${order.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {order.order_ref}
                      {order.is_back_order && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Back order
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{order.customer_name}</td>
                    <td className="px-4 py-3 text-slate-900">
                          {order.total_m !== null && order.total_m !== undefined
                            ? Number(order.total_m).toFixed(3)
                            : "—"}
                        </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-900">{formatDate(order.created_at)}</td>
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