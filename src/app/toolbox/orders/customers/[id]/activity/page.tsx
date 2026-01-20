"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { BackButton } from "@/components/navigation/BackButton";
import { Button } from "@/components/ui/Button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

type OrderStatus = "OPEN" | "PARTIALLY_FULFILLED" | "COMPLETED" | "CANCELLED";

type Customer = {
  id: string;
  pastel_code: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

interface CustomerOrder {
  id: string;
  order_ref: string;
  status: OrderStatus;
  created_at: string;
  total_m: number | null;
  invoice_no: string | null;
  gate_pass_no: string | null;
  completed_at: string | null;
}

export default function CustomerActivityPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerId) {
      fetchCustomerData();
      fetchCustomerOrders();
    }
  }, [customerId]);

  async function fetchCustomerData() {
    try {
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("customers")
        .select("id, pastel_code, name, contact_person, phone, email, address, is_active, created_at")
        .eq("id", customerId)
        .single();

      if (fetchError) throw fetchError;
      setCustomer(data as Customer);
    } catch (err: any) {
      console.error("Failed to load customer", err);
      setError(err?.message || "Failed to load customer.");
    }
  }

  async function fetchCustomerOrders() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseBrowserClient
        .from("customer_orders")
        .select(
          `
          id,
          order_ref,
          status,
          created_at,
          invoice_no,
          gate_pass_no,
          completed_at,
          customer_order_lines (
            quantity_m
          )
        `
        )
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: CustomerOrder[] =
        ((data as any[]) || []).map((row: any) => {
          const total =
            (row.customer_order_lines || []).reduce(
              (sum: number, l: any) => sum + Number(l.quantity_m || 0),
              0
            ) || null;

          return {
            id: row.id,
            order_ref: row.order_ref,
            status: (row.status || "OPEN") as OrderStatus,
            created_at: row.created_at,
            total_m: total,
            invoice_no: row.invoice_no,
            gate_pass_no: row.gate_pass_no,
            completed_at: row.completed_at,
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

  function getStatusColor(status: OrderStatus) {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700";
      case "PARTIALLY_FULFILLED":
        return "bg-amber-50 text-amber-700";
      case "CANCELLED":
        return "bg-red-50 text-red-700";
      case "OPEN":
      default:
        return "bg-blue-50 text-blue-700";
    }
  }

  // Process orders data for graph
  const chartData = useMemo(() => {
    if (orders.length === 0) return [];

    // Group orders by month
    const monthlyData: Record<
      string,
      { monthKey: string; month: string; orders: number; totalMeters: number }
    > = {};

    orders.forEach((order) => {
      if (!order.created_at) return;

      const date = new Date(order.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "short",
      });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          monthKey,
          month: monthLabel,
          orders: 0,
          totalMeters: 0,
        };
      }

      monthlyData[monthKey].orders += 1;
      if (order.total_m !== null && order.total_m !== undefined) {
        monthlyData[monthKey].totalMeters += order.total_m;
      }
    });

    // Convert to array and sort by monthKey (YYYY-MM format sorts correctly)
    return Object.values(monthlyData).sort((a, b) => {
      return a.monthKey.localeCompare(b.monthKey);
    });
  }, [orders]);

  if (isLoading && !customer) {
    return (
      <div className="grid gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Customer Activity</h1>
          </div>
          <BackButton href="/toolbox/orders/customers" label="Back to Customers" />
        </div>
        <p className="text-sm text-slate-600">Loading...</p>
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div className="grid gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Customer Activity</h1>
          </div>
          <BackButton href="/toolbox/orders/customers" label="Back to Customers" />
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Customer Activity</h1>
          <p className="mt-1 text-slate-600">
            View order history and activity for {customer?.name || "this customer"}.
          </p>
        </div>
        <BackButton href="/toolbox/orders/customers" label="Back to Customers" />
      </div>

      {/* Customer Information Card */}
      {customer && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Customer Information</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Name
              </label>
              <p className="text-sm font-medium text-slate-900">{customer.name}</p>
            </div>
            {customer.pastel_code && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Pastel Code
                </label>
                <p className="text-sm text-slate-900">{customer.pastel_code}</p>
              </div>
            )}
            {customer.contact_person && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Contact Person
                </label>
                <p className="text-sm text-slate-900">{customer.contact_person}</p>
              </div>
            )}
            {customer.phone && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Phone
                </label>
                <p className="text-sm text-slate-900">{customer.phone}</p>
              </div>
            )}
            {customer.email && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Email
                </label>
                <p className="text-sm text-slate-900">{customer.email}</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Status
              </label>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  customer.is_active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {customer.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          {customer.address && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Address
              </label>
              <p className="text-sm text-slate-900">{customer.address}</p>
            </div>
          )}
        </section>
      )}

      {/* Activity Graph */}
      {orders.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Activity Overview</h2>
          {chartData.length > 0 ? (
            <div className="space-y-6">
              {/* Orders Count Chart */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Orders Over Time</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      stroke="#64748b"
                      style={{ fontSize: "12px" }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis stroke="#64748b" style={{ fontSize: "12px" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "8px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="orders" fill="#0d9488" name="Number of Orders" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Total Meters Chart */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Total Quantity (Meters) Over Time</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      stroke="#64748b"
                      style={{ fontSize: "12px" }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis stroke="#64748b" style={{ fontSize: "12px" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "8px",
                      }}
                      formatter={(value: number) => `${Number(value).toFixed(2)} m`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="totalMeters"
                      stroke="#0d9488"
                      strokeWidth={2}
                      name="Total Meters"
                      dot={{ fill: "#0d9488", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No activity data available to display.</p>
          )}
        </section>
      )}

      {/* Orders History */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Order History</h2>
          <span className="text-sm text-slate-600">
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-600 mb-4">No orders found for this customer.</p>
            <Link href="/toolbox/orders/new">
              <Button variant="primary">Create New Order</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Order Ref</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Total (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Created</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Completed</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Gate Pass</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{order.order_ref}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {order.total_m !== null && order.total_m !== undefined
                        ? Number(order.total_m).toFixed(3)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {order.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-900">{formatDate(order.created_at)}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {formatDate(order.completed_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {order.invoice_no || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {order.gate_pass_no || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/toolbox/orders/${order.id}`}
                        className="text-sm text-teal-700 hover:text-teal-900 font-medium"
                      >
                        View Details
                      </Link>
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
