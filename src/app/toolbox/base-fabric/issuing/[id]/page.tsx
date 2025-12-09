"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface Slip {
  id: string;
  slip_no: string | null;
  issue_date: string;
  from_location: string;
  to_location: string;
  notes: string | null;
}

interface SlipLine {
  id: string;
  length_m: number;
  notes: string | null;
  roll: {
    qr_code: string | null;
    roll_no: string | null;
    length_m: number;
    base_fabric_orders?: {
      order_no: string | null;
      loom_no: string | null;
      base_fabric_items?: {
        name: string | null;
      } | null;
    } | null;
  } | null;
}

export default function BaseFabricIssueSlipPage() {
  const params = useParams();
  const slipId = params.id as string;
  const [slip, setSlip] = useState<Slip | null>(null);
  const [lines, setLines] = useState<SlipLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slipId) {
      fetchSlip();
    }
  }, [slipId]);

  async function fetchSlip() {
    try {
      setIsLoading(true);
      setError(null);

      const { data: slipData, error: slipError } = await supabaseBrowserClient
        .from("base_fabric_issue_slips")
        .select("id, slip_no, issue_date, from_location, to_location, notes")
        .eq("id", slipId)
        .single();

      if (slipError) throw slipError;

      const { data: lineData, error: lineError } = await supabaseBrowserClient
        .from("base_fabric_issue_lines")
        .select(
          `
          id,
          length_m,
          notes,
          base_fabric_rolls:base_fabric_roll_id (
            qr_code,
            roll_no,
            length_m,
            base_fabric_orders:base_fabric_order_id (
              order_no,
              loom_no,
              base_fabric_items:base_fabric_item_id ( name )
            )
          )
        `
        )
        .eq("slip_id", slipId);

      if (lineError) throw lineError;

      setSlip(slipData as Slip);
      setLines(
        (lineData as any[]).map((row) => ({
          ...row,
          roll: row.base_fabric_rolls
            ? Array.isArray(row.base_fabric_rolls)
              ? row.base_fabric_rolls[0]
              : row.base_fabric_rolls
            : null,
          base_fabric_rolls: undefined,
        })) as SlipLine[]
      );
    } catch (err: any) {
      setError(err.message || "Failed to load issue slip.");
    } finally {
      setIsLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading issue slip...</p>
      </div>
    );
  }

  if (error || !slip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error || "Issue slip not found."}</p>
          <Link href="/toolbox/base-fabric/issuing">
            <Button variant="primary">Back to Issuing</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="print-page-shell min-h-screen bg-slate-100 print:bg-white print:min-h-0">
        {/* Top actions (screen only) */}
        <div className="mx-auto max-w-[800px] px-4 py-6 print:hidden">
          <div className="mb-4 flex items-center justify-between">
            <BackButton href="/toolbox/base-fabric/issuing" label="Back to Issuing" />
            <Button variant="primary" onClick={handlePrint}>
              Print Slip
            </Button>
          </div>
        </div>

        {/* Slip Content */}
        <div className="print-slip-container">
          <div className="print-slip-card flex flex-col min-h-[100vh]">
            {/* Header */}
            <div className="print:flex print:justify-between print:items-start print:mb-6 print:pb-4 print:border-b print:border-slate-300">
              <div>
                <h2 className="print:text-2xl print:font-bold print:text-slate-900">
                  UNICA TEXTILE MILLS
                </h2>
                <p className="print:text-sm print:text-slate-600">Base Fabric Issue Slip</p>
              </div>
              <div className="print:w-24 print:h-24 print:border print:border-slate-300 print:flex print:items-center print:justify-center print:text-xs print:text-slate-500">
                LOGO
              </div>
            </div>

            {/* Title */}
            <h1 className="text-center text-xl font-bold text-slate-900 print:mb-4">
              Base Fabric Issue Slip – Weaving to Coating
            </h1>

            {/* Slip Info */}
            <div className="grid gap-2 text-sm text-slate-800 print:text-slate-800 sm:grid-cols-2 print:mb-4">
              <div>
                <span className="font-semibold">Slip No:</span>{" "}
                <span className="text-teal-700">{slip.slip_no || "N/A"}</span>
              </div>
              <div>
                <span className="font-semibold">Issue Date:</span>{" "}
                <span>{new Date(slip.issue_date).toLocaleString("en-ZA")}</span>
              </div>
              <div>
                <span className="font-semibold">From:</span>{" "}
                <span>{slip.from_location}</span>
              </div>
              <div>
                <span className="font-semibold">To:</span>{" "}
                <span>{slip.to_location}</span>
              </div>
              {slip.notes && (
                <div className="sm:col-span-2">
                  <span className="font-semibold">Notes:</span>{" "}
                  <span className="text-slate-700">{slip.notes}</span>
                </div>
              )}
            </div>

            {/* Lines Table */}
            <div className="print:mb-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">QR</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Order</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Fabric</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Loom</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-900">Length (m)</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const roll = line.roll;
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
                    return (
                      <tr key={line.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-800 font-medium">
                          {roll?.qr_code || roll?.roll_no || "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{order?.order_no || "N/A"}</td>
                        <td className="px-3 py-2 text-slate-700">{item?.name || "N/A"}</td>
                        <td className="px-3 py-2 text-slate-700">{order?.loom_no || "-"}</td>
                        <td className="px-3 py-2 text-right text-slate-900 font-semibold">
                          {line.length_m.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{line.notes || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <footer className="mt-auto pt-4 text-xs text-slate-600 print:text-[10px] print:text-slate-600 print:border-t print:border-slate-200">
              <div className="flex justify-between">
                <span>Document Number: UTM-WEAV-ISSUE-FT-001</span>
                <span>Page 1 of 1</span>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}

