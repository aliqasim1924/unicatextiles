"use client";

import { useSearchParams } from "next/navigation";
import { QRCode } from "@/components/qr/QRCode";
import { useEffect, useState, useRef } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";

interface QRData {
  qr_code: string;
  roll_no: string | null;
  type: "base_fabric" | "finished_fabric";
  length_m?: number;
  order_no?: string | null;
  fabric_name?: string | null;
  gsm?: number | null;
  loom_no?: number | string | null;
}

export default function QRPrintPage() {
  const searchParams = useSearchParams();
  const rollIdsParam = searchParams.get("rollIds");
  const rollIds = rollIdsParam?.split(",").filter(Boolean) || [];
  const type = (searchParams.get("type") || "base_fabric") as "base_fabric" | "finished_fabric";
  const [qrData, setQrData] = useState<QRData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasPrintedRef = useRef(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple fetches
    if (hasLoadedRef.current) return;
    
    if (rollIds.length === 0) {
      setError("No rolls selected for printing.");
      setIsLoading(false);
      hasLoadedRef.current = true;
      return;
    }

    async function fetchQRData() {
      try {
        setIsLoading(true);
        setError(null);

        if (type === "base_fabric") {
          const { data, error: fetchError } = await supabaseBrowserClient
            .from("base_fabric_rolls")
            .select(
              `
              id,
              qr_code,
              roll_no,
              length_m,
              actual_gsm,
              base_fabric_orders:base_fabric_order_id (
                order_no,
                loom_no,
                base_fabric_items:base_fabric_item_id (
                  name,
                  gsm
                )
              )
            `
            )
            .in("id", rollIds);

          if (fetchError) throw fetchError;

          const mapped = (data || []).map((row: any) => {
            const order = Array.isArray(row.base_fabric_orders)
              ? row.base_fabric_orders[0]
              : row.base_fabric_orders;
            const item = order?.base_fabric_items
              ? Array.isArray(order.base_fabric_items)
                ? order.base_fabric_items[0]
                : order.base_fabric_items
              : null;

            return {
              qr_code: row.qr_code || row.roll_no || `BFR-${row.id.slice(0, 8)}`,
              roll_no: row.roll_no,
              type: "base_fabric" as const,
              length_m: row.length_m,
              order_no: order?.order_no || null,
              fabric_name: item?.name || null,
              gsm:
                row.actual_gsm !== null && row.actual_gsm !== undefined
                  ? Number(row.actual_gsm)
                  : item?.gsm !== null && item?.gsm !== undefined
                    ? Number(item.gsm)
                    : null,
              loom_no: order?.loom_no ?? null,
            };
          });

          setQrData(mapped);
        } else {
          const { data, error: fetchError } = await supabaseBrowserClient
            .from("finished_fabric_rolls")
            .select(
              `
              id,
              qr_code,
              roll_no,
              length_m,
              grade,
              color,
              coating_type,
              gsm
            `
            )
            .in("id", rollIds);

          if (fetchError) throw fetchError;

          const mapped = (data || []).map((row: any) => ({
            qr_code: row.qr_code || row.roll_no || `FFR-${row.id.slice(0, 8)}`,
            roll_no: row.roll_no,
            type: "finished_fabric" as const,
            length_m: row.length_m,
            grade: row.grade,
            color: row.color,
            coating_type: row.coating_type,
            gsm: row.gsm,
          }));

          setQrData(mapped);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load QR code data.");
      } finally {
        setIsLoading(false);
        hasLoadedRef.current = true;
      }
    }

    fetchQRData();
  }, [rollIdsParam, type]);

  // Optional: Auto-print when page loads (commented out to prevent issues)
  // Users can click the "Print QR Codes" button manually when ready
  // useEffect(() => {
  //   if (!isLoading && qrData.length > 0 && !hasPrintedRef.current && !error) {
  //     hasPrintedRef.current = true;
  //     const timer = setTimeout(() => {
  //       window.print();
  //     }, 2000);
  //     return () => clearTimeout(timer);
  //   }
  // }, [isLoading, qrData.length, error]);

  // Don't show loading if we already have data (prevents flicker during print)
  if (isLoading && qrData.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading QR codes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error}</p>
          <button
            onClick={() => window.close()}
            className="rounded-lg bg-teal-700 px-4 py-2 text-white hover:bg-teal-800"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Pad to multiple of 4 for grid layout
  const paddedData = [...qrData];
  while (paddedData.length % 4 !== 0) {
    paddedData.push({
      qr_code: "",
      roll_no: null,
      type: type,
    } as QRData);
  }

  return (
    <div className="bg-white p-8 print:p-4">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0.5cm;
          }
          body {
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Print button (hidden when printing) */}
      <div className="no-print mb-4 flex gap-4">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-teal-700 px-4 py-2 text-white hover:bg-teal-800"
        >
          Print QR Codes
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      {/* QR Code Grid - 2x2 per page */}
      <div className="grid grid-cols-2 gap-0 print:grid-cols-2">
        {paddedData.map((data, index) => {
          if (!data.qr_code) {
            // Empty placeholder
            return (
              <div
                key={`empty-${index}`}
                className="flex min-h-[calc(297mm/2-1cm)] flex-col items-center justify-center border-b-2 border-r-2 border-dashed border-slate-300 p-4 print:min-h-[calc(297mm/2-1cm)] print:border-b-2 print:border-r-2 print:border-dashed print:border-slate-400"
              >
                {/* Empty space */}
              </div>
            );
          }

          return (
            <div
              key={data.qr_code}
              className="flex min-h-[calc(297mm/2-1cm)] flex-col items-center justify-center border-b-2 border-r-2 border-dashed border-slate-300 p-4 print:min-h-[calc(297mm/2-1cm)] print:border-b-2 print:border-r-2 print:border-dashed print:border-slate-400"
            >
              {/* Cutting line indicator */}
              <div className="mb-2 text-xs text-slate-400 print:text-slate-500">
                ──── Cut Here ────
              </div>

              {/* QR Code */}
              <div className="mb-4 flex items-center justify-center rounded-lg border-2 border-slate-200 bg-white p-4 print:border-slate-300">
                <div data-qr-code={data.qr_code}>
                  <QRCode value={data.qr_code} size={180} level="M" />
                </div>
              </div>

              {/* Roll Information */}
              <div className="text-center">
                <div className="mb-1 text-lg font-bold text-slate-900 print:text-base">
                  {data.roll_no || data.qr_code}
                </div>
                {data.type === "base_fabric" ? (
                  data.loom_no != null && data.loom_no !== "" ? (
                    <div className="text-sm font-semibold text-slate-700 print:text-xs">
                      Loom Number: {String(data.loom_no)}
                    </div>
                  ) : null
                ) : (
                  <div className="text-sm font-semibold text-slate-700 print:text-xs">
                    {data.qr_code}
                  </div>
                )}
                {data.length_m && (
                  <div className="mt-1 text-xs text-slate-600 print:text-[10px]">
                    Length: {data.length_m.toFixed(2)} m
                  </div>
                )}
                {data.type === "base_fabric" && (
                  <>
                    {data.order_no && (
                      <div className="mt-1 text-xs text-slate-600 print:text-[10px]">
                        Order: {data.order_no}
                      </div>
                    )}
                    {data.fabric_name && (
                      <div className="mt-1 text-xs text-slate-600 print:text-[10px]">
                        {data.fabric_name}
                      </div>
                    )}
                    {data.gsm != null && (
                      <div className="mt-1 text-xs text-slate-600 print:text-[10px]">
                        GSM: {Number(data.gsm).toFixed(2)}
                      </div>
                    )}
                  </>
                )}
                {data.type === "finished_fabric" && (
                  <>
                    {(data as any).grade && (
                      <div className="mt-1 text-xs text-slate-600 print:text-[10px]">
                        Grade: {(data as any).grade}
                      </div>
                    )}
                    {(data as any).color && (
                      <div className="mt-1 text-xs text-slate-600 print:text-[10px]">
                        Color: {(data as any).color}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Bottom cutting line */}
              <div className="mt-4 text-xs text-slate-400 print:text-slate-500">
                ──── Cut Here ────
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

