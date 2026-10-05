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
      {/* Global Print Stylesheet targeting A5 paper dimensions */}
      <style jsx global>{`
        @media print {
          @page {
            size: A5 portrait;
            margin: 8mm;
          }
          body {
            background: white !important;
            color: #000 !important;
            font-size: 11px !important;
          }
          .print-page-shell {
            background: white !important;
            min-h-0 !important;
          }
          .print-slip-container {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-slip-card {
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="print-page-shell min-h-screen bg-slate-100 print:bg-white print:min-h-0">
        {/* Top actions (screen only) */}
        <div className="mx-auto max-w-[800px] px-4 py-6 print:hidden">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              <BackButton href="/toolbox/base-fabric/issuing" label="Back to Issuing" />
              <Link href="/toolbox/base-fabric/issuing/slips">
                <Button variant="secondary">All Slips</Button>
              </Link>
            </div>
            <Button variant="primary" onClick={handlePrint}>
              Print Slip
            </Button>
          </div>
        </div>

        {/* Slip Content */}
        <div className="print-slip-container mx-auto max-w-[800px] px-4">
          <div className="print-slip-card flex flex-col bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            {/* Header */}
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  UNICA TEXTILE MILLS
                </h2>
                <p className="text-xs text-slate-600">Base Fabric Issue Slip</p>
              </div>
              <div className="w-16 h-16 flex items-center justify-center overflow-hidden">
                <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-center text-base font-bold text-slate-900 mb-3">
              Base Fabric Issue Slip – Weaving to Coating
            </h1>

            {/* Slip Info */}
            <div className="grid gap-1.5 text-xs text-slate-800 sm:grid-cols-2 mb-4">
              <div>
                <span className="font-semibold">Slip No:</span>{" "}
                <span className="text-teal-700 font-medium">{slip.slip_no || "N/A"}</span>
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
            <div className="mb-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50">
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-900">QR / Roll</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-900">Order</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-900">Fabric</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-900">Loom</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-slate-900">Length (m)</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-900">Notes</th>
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
                        <td className="px-2 py-1.5 text-slate-800 font-medium">
                          {roll?.qr_code || roll?.roll_no || "-"}
                        </td>
                        <td className="px-2 py-1.5 text-slate-700">{order?.order_no || "N/A"}</td>
                        <td className="px-2 py-1.5 text-slate-700">{item?.name || "N/A"}</td>
                        <td className="px-2 py-1.5 text-slate-700">{order?.loom_no || "-"}</td>
                        <td className="px-2 py-1.5 text-right text-slate-900 font-semibold">
                          {line.length_m.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{line.notes || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Signatures (print only) */}
            <div className="mt-4 hidden print:block">
              <div className="grid grid-cols-2 gap-6 text-xs text-slate-800">
                {/* Issued By */}
                <div className="flex flex-col gap-1.5">
                  <div className="font-semibold text-slate-900">Issued By</div>
                  <div className="h-6 border-b border-slate-400" />
                  <div className="flex items-center justify-between text-[10px] text-slate-600">
                    <span>Name &amp; Signature</span>
                    <span>Date: ______</span>
                  </div>
                </div>

                {/* Received By */}
                <div className="flex flex-col gap-1.5">
                  <div className="font-semibold text-slate-900">Received By</div>
                  <div className="h-6 border-b border-slate-400" />
                  <div className="flex items-center justify-between text-[10px] text-slate-600">
                    <span>Name &amp; Signature</span>
                    <span>Date: ______</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-6 pt-3 text-[10px] text-slate-600 border-t border-slate-200 flex justify-between">
              <span>Document Number: UTM-WEAV-ISSUE-FT-001</span>
              <span>Page 1 of 1</span>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}