"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";
import { DateRangeFilter, isDateInRange } from "@/components/ui/DateRangeFilter";

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

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus | "BACK_ORDER">("ALL");
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [activeCollapsedMonths, setActiveCollapsedMonths] = useState<Set<string>>(new Set());
  const [completedCollapsedMonths, setCompletedCollapsedMonths] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
      const matchesDate = !dateFrom && !dateTo ? true : isDateInRange(o.created_at, dateFrom, dateTo);
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [orders, search, statusFilter, dateFrom, dateTo]);

  const ordersByMonth = useMemo(() => {
    const map = new Map<string, CustomerOrder[]>();
    filteredOrders.forEach((o) => {
      const key = getMonthKey(o.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredOrders]);

  const activeOrders = useMemo(
    () => filteredOrders.filter((o) => o.status === "OPEN" || o.status === "PARTIALLY_FULFILLED"),
    [filteredOrders]
  );
  const completedOrders = useMemo(
    () => filteredOrders.filter((o) => o.status === "COMPLETED" || o.status === "CANCELLED"),
    [filteredOrders]
  );

  const activeByMonth = useMemo(() => {
    const map = new Map<string, CustomerOrder[]>();
    activeOrders.forEach((o) => {
      const key = getMonthKey(o.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activeOrders]);

  const completedByMonth = useMemo(() => {
    const map = new Map<string, CustomerOrder[]>();
    completedOrders.forEach((o) => {
      const key = getMonthKey(o.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [completedOrders]);

  const showSeparateSections = statusFilter === "ALL";

  function toggleMonth(monthKey: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  function toggleActiveMonth(monthKey: string) {
    setActiveCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  function toggleCompletedMonth(monthKey: string) {
    setCompletedCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

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
      <div className="flex items-center justify-between print:hidden">
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

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-6">
            <div className="min-w-[160px]">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Order ref or customer..."
              />
            </div>
            <div className="min-w-[140px]">
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
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onFromChange={setDateFrom}
              onToChange={setDateTo}
              label="Date range"
              showAllHint={true}
              className="lg:min-w-0 lg:flex-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
              Print report
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="print:hidden"
              disabled={!dateFrom && !dateTo}
            >
              Clear dates
            </Button>
          </div>
        </div>
      </section>

      {(dateFrom || dateTo) && (
        <p className="text-sm text-slate-600 print:mb-2">
          Showing orders from {dateFrom || "…"} to {dateTo || "…"}
        </p>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {isLoading ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">Loading orders...</p>
        </section>
      ) : filteredOrders.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">No orders found.</p>
        </section>
      ) : showSeparateSections ? (
        <>
          {/* Open & in progress */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Open & in progress
              <span className="ml-2 text-sm font-normal text-slate-500">
                ({activeOrders.length} order{activeOrders.length !== 1 ? "s" : ""})
              </span>
            </h2>
            {activeOrders.length === 0 ? (
              <p className="text-sm text-slate-600">No open or partially fulfilled orders.</p>
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
                    {activeByMonth.map(([monthKey, orderList]) => {
                      const isCollapsed = activeCollapsedMonths.has(monthKey);
                      return (
                        <React.Fragment key={`active-${monthKey}`}>
                          <tr className="border-b border-slate-200 bg-slate-100/80">
                            <td colSpan={5} className="px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleActiveMonth(monthKey)}
                                className="flex items-center gap-2 text-left w-full font-semibold text-slate-800 hover:text-teal-700 transition"
                              >
                                <span className="text-slate-500 select-none w-5">
                                  {isCollapsed ? "▶" : "▼"}
                                </span>
                                {formatMonthLabel(monthKey)}
                                <span className="text-slate-500 font-normal text-sm">
                                  ({orderList.length} order{orderList.length !== 1 ? "s" : ""})
                                </span>
                              </button>
                            </td>
                          </tr>
                          {!isCollapsed &&
                            orderList.map((order) => (
                              <tr
                                key={order.id}
                                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                                onClick={() => (window.location.href = `/toolbox/orders/${order.id}`)}
                              >
                                <td className="px-4 py-3 font-medium text-slate-900 pl-9">
                                  {order.order_ref}
                                  {order.is_back_order && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                      Back order
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-900">{order.customer_name}</td>
                                <td className="px-4 py-3 text-slate-900">
                                  {order.total_m != null ? Number(order.total_m).toFixed(3) : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                                    {order.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-900">{formatDate(order.created_at)}</td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Completed */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Completed
              <span className="ml-2 text-sm font-normal text-slate-500">
                ({completedOrders.length} order{completedOrders.length !== 1 ? "s" : ""})
              </span>
            </h2>
            {completedOrders.length === 0 ? (
              <p className="text-sm text-slate-600">No completed or cancelled orders.</p>
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
                    {completedByMonth.map(([monthKey, orderList]) => {
                      const isCollapsed = completedCollapsedMonths.has(monthKey);
                      return (
                        <React.Fragment key={`completed-${monthKey}`}>
                          <tr className="border-b border-slate-200 bg-slate-100/80">
                            <td colSpan={5} className="px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleCompletedMonth(monthKey)}
                                className="flex items-center gap-2 text-left w-full font-semibold text-slate-800 hover:text-teal-700 transition"
                              >
                                <span className="text-slate-500 select-none w-5">
                                  {isCollapsed ? "▶" : "▼"}
                                </span>
                                {formatMonthLabel(monthKey)}
                                <span className="text-slate-500 font-normal text-sm">
                                  ({orderList.length} order{orderList.length !== 1 ? "s" : ""})
                                </span>
                              </button>
                            </td>
                          </tr>
                          {!isCollapsed &&
                            orderList.map((order) => (
                              <tr
                                key={order.id}
                                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                                onClick={() => (window.location.href = `/toolbox/orders/${order.id}`)}
                              >
                                <td className="px-4 py-3 font-medium text-slate-900 pl-9">
                                  {order.order_ref}
                                  {order.is_back_order && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                      Back order
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-900">{order.customer_name}</td>
                                <td className="px-4 py-3 text-slate-900">
                                  {order.total_m != null ? Number(order.total_m).toFixed(3) : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                                    {order.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-900">{formatDate(order.created_at)}</td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                {ordersByMonth.map(([monthKey, orderList]) => {
                  const isCollapsed = collapsedMonths.has(monthKey);
                  return (
                    <React.Fragment key={monthKey}>
                      <tr className="border-b border-slate-200 bg-slate-100/80">
                        <td colSpan={5} className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleMonth(monthKey)}
                            className="flex items-center gap-2 text-left w-full font-semibold text-slate-800 hover:text-teal-700 transition"
                          >
                            <span className="text-slate-500 select-none w-5">
                              {isCollapsed ? "▶" : "▼"}
                            </span>
                            {formatMonthLabel(monthKey)}
                            <span className="text-slate-500 font-normal text-sm">
                              ({orderList.length} order{orderList.length !== 1 ? "s" : ""})
                            </span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        orderList.map((order) => (
                          <tr
                            key={order.id}
                            className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                            onClick={() => (window.location.href = `/toolbox/orders/${order.id}`)}
                          >
                            <td className="px-4 py-3 font-medium text-slate-900 pl-9">
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}