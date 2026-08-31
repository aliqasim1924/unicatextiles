"use client";

import { createRoot } from "react-dom/client";
import { QRCodeCanvas } from "qrcode.react";
import { createElement } from "react";
import jsPDF from "jspdf";

export const LABEL_SIZE_MM = 100;

export interface LabelPdfRow {
  qr_code: string;
  roll_no: string | null;
  type: "base_fabric" | "finished_fabric";
  length_m?: number | null;
  order_no?: string | null;
  fabric_name?: string | null;
  gsm?: number | null;
  loom_no?: number | string | null;
  grade?: string | null;
  color?: string | null;
  coating_type?: string | null;
  batch_no?: string | null;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return Promise.race([
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }),
    new Promise<HTMLImageElement | null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
}

function qrCodePngDataUrl(value: string, sizePx = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      createElement(QRCodeCanvas, {
        value,
        size: sizePx,
        level: "M",
        includeMargin: false,
        fgColor: "#0F172A",
        bgColor: "#FFFFFF",
      })
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = host.querySelector("canvas");
        if (!canvas) {
          root.unmount();
          host.remove();
          reject(new Error("Could not render QR code."));
          return;
        }
        const dataUrl = canvas.toDataURL("image/png");
        root.unmount();
        host.remove();
        resolve(dataUrl);
      });
    });
  });
}

// Helper function to determine color based on GSM
function getHeaderColorByGsm(
  gsm: number | null | undefined
): [number, number, number] {
  // For coated rolls, use GSM to determine color
  if (gsm === 400) {
    return [59, 246, 90]; // Green for 400 GSM
  } else if (gsm === 500) {
    return [32, 68, 232]; // Blue for 500 GSM
  }
  // Default/fallback for other GSM values
  return [232, 32, 59]; // Red for unknown GSM
}


function drawLabel(
  doc: jsPDF,
  data: LabelPdfRow,
  logo: HTMLImageElement | null,
  qrDataUrl: string
) {
  const size = LABEL_SIZE_MM; // 100mm x 100mm
  const isCoating = data.type === "finished_fabric";

   // Color theme: Blue for 400 GSM, Red for 500 GSM (coated), Dark Slate for Weaving
const colorRgb = isCoating
? getHeaderColorByGsm(data.gsm)
: [51, 65, 85]; // Keep dark slate for all weaving labels


  // 1. Top Header Banner
  doc.setFillColor(colorRgb[0], colorRgb[1], colorRgb[2]);
  doc.rect(0, 0, size, 20, "F");

  // Logo Container Box
  doc.setFillColor(255, 255, 255);
  doc.rect(2, 2, 60, 16, "F");

  if (logo && logo.width > 0) {
    const maxW = 54;
    const maxH = 12;
    const ratio = logo.height / logo.width || 1;
    let w = maxW;
    let h = w * ratio;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    doc.addImage(logo, "PNG", 2 + (60 - w) / 2, 2 + (16 - h) / 2, w, h);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("UNICA TEXTILES", 32, 11, { align: "center" });
  }

  // Top Right GSM Banner
  const gsmValue = data.gsm != null ? `${Number(data.gsm).toFixed(0)}` : "—";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(gsmValue, 81, 10, { align: "center" });
  doc.setFontSize(9);
  doc.text("GSM", 81, 15, { align: "center" });

  // 2. Data Rows Definition
  const rows: [string, string][] = isCoating
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

  // 3. Render Table Grid (Left)
  let yPos = 23;
  const rowH = 8.5;
  const tableW = 58;

  rows.forEach(([label, value], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(4, yPos, tableW, rowH, "F");
    }

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(4, yPos, tableW, rowH);
    doc.line(28, yPos, 28, yPos + rowH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.text(label, 5, yPos + 5.5, { maxWidth: 22 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(value, 29, yPos + 5.5, { maxWidth: 32 });

    yPos += rowH;
  });

  // 4. Render QR Code (Right Side)
  const qrMm = 31;
  doc.addImage(qrDataUrl, "PNG", 65, 33, qrMm, qrMm);

  // 5. Bottom Footer Banner
  doc.setFillColor(colorRgb[0], colorRgb[1], colorRgb[2]);
  doc.rect(0, 87, size, 13, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const footerText = isCoating ? "QUALITY YOU CAN TRUST" : "MADE IN SOUTH AFRICA";
  doc.text(footerText, size / 2, 95, { align: "center" });
}

export async function generateLabelPdf(
  rows: LabelPdfRow[],
  kind: "base_fabric" | "finished_fabric"
): Promise<void> {
  if (rows.length === 0) return;

  const logo = await loadImage("/Logo.png");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [LABEL_SIZE_MM, LABEL_SIZE_MM],
  });

  for (let i = 0; i < rows.length; i++) {
    if (i > 0) doc.addPage([LABEL_SIZE_MM, LABEL_SIZE_MM], "portrait");
    const qrDataUrl = await qrCodePngDataUrl(rows[i].qr_code);
    drawLabel(doc, rows[i], logo, qrDataUrl);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = kind === "base_fabric" ? "weaving-base" : "coating-finished";
  doc.save(`${prefix}-labels-${stamp}.pdf`);
}