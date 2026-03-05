"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { DateRangeFilter, isDateInRange } from "@/components/ui/DateRangeFilter";

interface OrderRow {
  id: string;
  order_no: string | null;
  status: string;
  planned_qty_m: number;
  loom_no: string | null;
  created_at: string;
  actual_start_at: string | null;
  base_fabric_items: {
    name: string;
  };
  total_produced_m: number;
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

export default function BaseFabricOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    let list = orders;
    if (statusFilter !== "ALL") {
      list = list.filter((o) => o.status === statusFilter);
    }
    if (dateFrom || dateTo) {
      list = list.filter((o) => isDateInRange(o.created_at, dateFrom, dateTo));
    }
    setFilteredOrders(list);
  }, [statusFilter, orders, dateFrom, dateTo]);

  async function fetchOrders() {
    try {
      setIsLoading(true);

      // Fetch orders with fabric items
      // Production orders only; outsourced (purchased) base fabric is not shown here
      const { data: ordersData, error: ordersError } = await supabaseBrowserClient
        .from("base_fabric_orders")
        .select(
          `
          id,
          order_no,
          status,
          planned_qty_m,
          loom_no,
          created_at,
          actual_start_at,
          base_fabric_items:base_fabric_item_id ( name )
        `
        )
        .eq("is_outsourced", false)
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch roll totals per order
      const { data: rollsData, error: rollsError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select("base_fabric_order_id, length_m");

      if (rollsError) throw rollsError;

      // Calculate totals
      const totalsMap = new Map<string, number>();
      (rollsData || []).forEach((roll: any) => {
        const current = totalsMap.get(roll.base_fabric_order_id) || 0;
        totalsMap.set(roll.base_fabric_order_id, current + Number(roll.length_m || 0));
      });

      // Process orders
      const processed = (ordersData || []).map((order: any) => ({
        ...order,
        created_at: order.created_at ?? new Date().toISOString(),
        actual_start_at: order.actual_start_at ?? null,
        base_fabric_items: Array.isArray(order.base_fabric_items)
          ? order.base_fabric_items[0]
          : order.base_fabric_items,
        total_produced_m: totalsMap.get(order.id) || 0,
      })) as OrderRow[];

      setOrders(processed);
      setFilteredOrders(processed);
    } catch (err: any) {
      console.error("Error fetching orders:", err);
    } finally {
      setIsLoading(false);
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

  function calculateProgress(produced: number, planned: number): number {
    if (planned === 0) return 0;
    return Math.round((produced / planned) * 100);
  }

  const ordersByMonth = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    filteredOrders.forEach((o) => {
      const key = getMonthKey(o.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredOrders]);

  function toggleMonth(monthKey: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Base Fabric Orders</h1>
          <p className="mt-1 text-slate-600">View and manage production orders.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/toolbox/base-fabric/orders/new">
            <Button variant="primary">New Production Order</Button>
          </Link>
          <Link
            href="/toolbox/base-fabric"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Base Fabric
          </Link>
        </div>
      </div>

      {/* Filter */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-6">
            <div className="min-w-[160px]">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              >
                <option value="ALL">All Status</option>
                <option value="PLANNED">Planned</option>
                <option value="RUNNING">Running</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onFromChange={setDateFrom}
              onToChange={setDateTo}
              label="Date range (for list and print)"
              showAllHint={true}
              className="lg:min-w-0 lg:flex-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => window.print()}
              className="print:hidden"
            >
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
      </motion.section>

      {/* Orders Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900 print:mb-2">
          Production Orders
          {(dateFrom || dateTo) && (
            <span className="ml-2 text-sm font-normal text-slate-500 print:block print:mt-1">
              ({dateFrom || "…"} to {dateTo || "…"})
            </span>
          )}
        </h2>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading orders...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-sm text-slate-600">
            {statusFilter === "ALL"
              ? "No orders found."
              : `No ${statusFilter.toLowerCase()} orders found.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Order No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Base Fabric
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Loom</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Created</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Started</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Planned (m)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Produced (m)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Progress</th>
                </tr>
              </thead>
              <tbody>
                {ordersByMonth.map(([monthKey, orderList]) => {
                  const isCollapsed = collapsedMonths.has(monthKey);
                  return (
                    <React.Fragment key={monthKey}>
                      <tr
                        className="border-b border-slate-200 bg-slate-100/80"
                      >
                        <td colSpan={9} className="px-4 py-2.5">
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
                        orderList.map((order) => {
                          const progress = calculateProgress(
                            order.total_produced_m,
                            order.planned_qty_m
                          );
                          return (
                            <tr
                              key={order.id}
                              className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                              onClick={() => {
                                window.location.href = `/toolbox/base-fabric/orders/${order.id}`;
                              }}
                            >
                              <td className="px-4 py-3 font-medium text-slate-900 pl-9">
                                {order.order_no || "N/A"}
                              </td>
                              <td className="px-4 py-3 text-slate-900">
                                {order.base_fabric_items?.name || "N/A"}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{order.loom_no || "-"}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeColor(
                                    order.status
                                  )}`}
                                >
                                  {order.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {new Date(order.created_at).toLocaleDateString("en-ZA")}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {order.actual_start_at
                                  ? new Date(order.actual_start_at).toLocaleString("en-ZA")
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-900">
                                {order.planned_qty_m.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-900">
                                {order.total_produced_m.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className={`font-semibold ${
                                    progress >= 100 ? "text-green-700" : "text-slate-900"
                                  }`}
                                >
                                  {progress}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}

