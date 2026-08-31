"use client";

import { useSearchParams } from "next/navigation";
import { QRCode } from "@/components/qr/QRCode";
import { useEffect, useState, useRef } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { generateLabelPdf, LABEL_SIZE_MM, type LabelPdfRow } from "@/lib/qr/generateLabelPdf";

type QRData = LabelPdfRow;

export default function QRPrintPage() {
  const searchParams = useSearchParams();
  const rollIdsParam = searchParams.get("rollIds");
  const rollIds = rollIdsParam?.split(",").filter(Boolean) || [];
  const type = (searchParams.get("type") || "base_fabric") as "base_fabric" | "finished_fabric";
  const [qrData, setQrData] = useState<QRData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
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

          const byId = new Map((data || []).map((row: any) => [row.id, row]));
          const mapped = rollIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((row: any) => {
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
                length_m: row.length_m !== null && row.length_m !== undefined ? Number(row.length_m) : null,
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
          // Relational query joining coating_batches via batch_id
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
              gsm,
              coating_batches:batch_id (
                batch_no
              )
            `
            )
            .in("id", rollIds);

          if (fetchError) throw fetchError;

          const byId = new Map((data || []).map((row: any) => [row.id, row]));
          const mapped = rollIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((row: any) => {
              const batch = Array.isArray(row.coating_batches)
                ? row.coating_batches[0]
                : row.coating_batches;

              return {
                qr_code: row.qr_code || row.roll_no || `FFR-${row.id.slice(0, 8)}`,
                roll_no: row.roll_no,
                type: "finished_fabric" as const,
                length_m: row.length_m !== null && row.length_m !== undefined ? Number(row.length_m) : null,
                grade: row.grade,
                color: row.color,
                coating_type: row.coating_type,
                gsm: row.gsm,
                batch_no: batch?.batch_no || null,
              };
            });

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

  async function handleDownloadPdf() {
    setPdfError(null);
    setIsGeneratingPdf(true);
    try {
      await generateLabelPdf(qrData, type);
    } catch (err: any) {
      setPdfError(err.message || "Failed to generate PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  if (isLoading && qrData.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading labels...</p>
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

  return (
    <div className="label-print-root bg-slate-100 print:bg-white">
      <style jsx global>{`
        @page {
          size: ${LABEL_SIZE_MM}mm ${LABEL_SIZE_MM}mm;
          margin: 0;
        }
        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .label-print-root {
            background: white !important;
            padding: 0 !important;
          }
          .qr-label {
            width: ${LABEL_SIZE_MM}mm;
            height: ${LABEL_SIZE_MM}mm;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
          .qr-label:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <div className="no-print mx-auto max-w-xl px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-900">Roll labels ({qrData.length})</h1>
        <p className="mt-2 text-sm text-slate-600">
          100 × 100 mm labels for the Epson TM-C3500 (100 mm × 30 m continuous roll). Download the PDF,
          then print at 100% scale with no margins.
        </p>
        {pdfError && <p className="mt-3 text-sm text-red-600">{pdfError}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf || qrData.length === 0}
            className="rounded-lg bg-teal-700 px-4 py-2 text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {isGeneratingPdf ? "Building PDF..." : "Download PDF"}
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            Print from browser
          </button>
          <button
            onClick={() => window.close()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 p-4 print:gap-0 print:p-0">
        {qrData.map((data) => {
          const isCoating = data.type === "finished_fabric";
          const tableRows: [string, string][] = isCoating
            ? [
                ["TYPE OF FABRIC", data.coating_type || data.fabric_name || "—"],
                ["COLOUR", data.color || "—"],
                ["GSM", data.gsm != null ? `${Number(data.gsm).toFixed(0)} GSM` : "—"],
                ["BATCH NUMBER", data.batch_no || "—"],
                ["ROLL NUMBER", data.roll_no || data.qr_code],
                ["ROLL LENGTH", data.length_m != null ? `${Number(data.length_m).toFixed(2)} MTR` : "—"],
                ["GRADE", data.grade || "A"],
              ]
            : [
                ["TYPE OF FABRIC", data.fabric_name || "BASE FABRIC"],
                ["COLOUR", "NATURAL / GREY"],
                ["GSM", data.gsm != null ? `${Number(data.gsm).toFixed(0)} GSM` : "—"],
                ["BFO NUMBER", data.order_no || "—"],
                ["ROLL NUMBER", data.roll_no || data.qr_code],
                ["ROLL LENGTH", data.length_m != null ? `${Number(data.length_m).toFixed(2)} MTR` : "—"],
                ["LOOM NUMBER", data.loom_no != null && data.loom_no !== "" ? `LOOM ${data.loom_no}` : "—"],
              ];

          return (
            <article
              key={data.qr_code}
              className="qr-label relative flex flex-col justify-between overflow-hidden border border-slate-300 bg-white shadow-sm"
              style={{ width: `${LABEL_SIZE_MM}mm`, height: `${LABEL_SIZE_MM}mm` }}
            >
              {/* Header Banner Block */}
              <div
                className={`flex h-[20mm] w-full items-center justify-between px-2 ${
                  isCoating ? "bg-sky-600" : "bg-slate-700"
                }`}
              >
                <div className="flex h-[16mm] w-[58mm] items-center justify-center rounded bg-white p-1">
                  <img src="/Logo.png" alt="Unica" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex flex-col items-center justify-center text-white pr-2">
                  <span className="text-xl font-black leading-none">
                    {data.gsm != null ? Number(data.gsm).toFixed(0) : "—"}
                  </span>
                  <span className="text-[10px] font-bold tracking-wider">GSM</span>
                </div>
              </div>

              {/* Data Grid & QR Code Body */}
              <div className="flex h-[67mm] w-full items-center px-2 py-1">
                {/* Grid Table */}
                <div className="w-[58mm] border border-slate-300">
                  {tableRows.map(([label, value], idx) => (
                    <div
                      key={label}
                      className={`flex h-[8.5mm] border-b border-slate-300 last:border-b-0 ${
                        idx % 2 === 0 ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <div className="flex w-[24mm] items-center border-r border-slate-300 px-1 text-[7px] font-extrabold text-slate-500 uppercase">
                        {label}
                      </div>
                      <div className="flex w-[34mm] items-center truncate px-1.5 text-[9px] font-extrabold text-slate-900">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* QR Code */}
                <div className="flex w-[38mm] justify-center items-center pl-1">
                  <QRCode value={data.qr_code} size={120} level="M" includeMargin={false} />
                </div>
              </div>

              {/* Bottom Banner */}
              <div
                className={`flex h-[13mm] w-full items-center justify-center text-xs font-black tracking-wider text-white ${
                  isCoating ? "bg-sky-600" : "bg-slate-700"
                }`}
              >
                {isCoating ? "MADE IN SOUTH AFRICA" : "MADE IN SOUTH AFRICA"}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}