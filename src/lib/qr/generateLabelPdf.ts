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

function drawLabel(
  doc: jsPDF,
  data: LabelPdfRow,
  logo: HTMLImageElement | null,
  qrDataUrl: string
) {
  const size = LABEL_SIZE_MM; // 100mm x 100mm
  let y = 4;

  // 1. Header Logo
  if (logo && logo.width > 0) {
    const maxW = 42;
    const maxH = 13;
    const ratio = logo.height / logo.width || 1;
    let w = maxW;
    let h = w * ratio;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    doc.addImage(logo, "PNG", (size - w) / 2, y, w, h);
    y += h + 2;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("UNICA TEXTILES", size / 2, y + 4, { align: "center" });
    y += 8;
  }

  // 2. QR Code
  const qrMm = 36;
  const qrX = (size - qrMm) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, y, qrMm, qrMm);
  y += qrMm + 4.5;

  // 3. Main Title (Roll No / QR Code)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  const title = data.roll_no || data.qr_code;
  doc.text(title, size / 2, y, { align: "center", maxWidth: 90 });
  y += 3.5;

  // Horizontal Divider Line
  doc.setDrawColor(203, 213, 225); // Slate 300 border
  doc.setLineWidth(0.3);
  doc.line(6, y, 94, y);
  y += 4;

  // 4. Two-Column Grid Setup
  const col1X = 26; // Center of Left Column
  const col2X = 74; // Center of Right Column

  // Vertical Divider between columns
  doc.setDrawColor(226, 232, 240); // Slate 200 light border
  doc.line(50, y - 1, 50, y + 17);

  if (data.type === "base_fabric") {
    // Row 1: Loom No | Order / Fabric
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("LOOM", col1X, y, { align: "center" });
    doc.text("ORDER / FABRIC", col2X, y, { align: "center" });
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const loomText = data.loom_no != null && data.loom_no !== "" ? `Loom ${data.loom_no}` : "—";
    const fabricText = data.fabric_name || data.order_no || "—";
    doc.text(loomText, col1X, y, { align: "center", maxWidth: 40 });
    doc.text(fabricText, col2X, y, { align: "center", maxWidth: 40 });
    y += 6;

    // Row 2: Length (Meters) | GSM
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("LENGTH", col1X, y, { align: "center" });
    doc.text("WEIGHT", col2X, y, { align: "center" });
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const lengthText = data.length_m != null ? `${Number(data.length_m).toFixed(2)} m` : "—";
    const gsmText = data.gsm != null ? `${Number(data.gsm).toFixed(0)} GSM` : "—";
    doc.text(lengthText, col1X, y, { align: "center" });
    doc.text(gsmText, col2X, y, { align: "center" });
  } else {
    // Finished Fabric Column Layout
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("COATING / COLOR", col1X, y, { align: "center" });
    doc.text("GRADE", col2X, y, { align: "center" });
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const coatingColor = [data.coating_type, data.color].filter(Boolean).join(" · ") || "—";
    const gradeText = data.grade ? `Grade ${data.grade}` : "—";
    doc.text(coatingColor, col1X, y, { align: "center", maxWidth: 40 });
    doc.text(gradeText, col2X, y, { align: "center", maxWidth: 40 });
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("LENGTH", col1X, y, { align: "center" });
    doc.text("WEIGHT", col2X, y, { align: "center" });
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const lengthText = data.length_m != null ? `${Number(data.length_m).toFixed(2)} m` : "—";
    const gsmText = data.gsm != null ? `${Number(data.gsm).toFixed(0)} GSM` : "—";
    doc.text(lengthText, col1X, y, { align: "center" });
    doc.text(gsmText, col2X, y, { align: "center" });
  }

  y += 4;
  // Bottom Horizontal Divider
  doc.setDrawColor(203, 213, 225);
  doc.line(6, y, 94, y);

  // 5. Footer Row (Batch Number & Made in South Africa)
  y += 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  
  const batchDisplay = data.batch_no ? `BATCH: ${data.batch_no}` : "";
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text(batchDisplay, col1X, y, { align: "center", maxWidth: 42 });

  doc.setTextColor(4, 120, 87); // Emerald 700 green
  doc.text("MADE IN SOUTH AFRICA", col2X, y, { align: "center", maxWidth: 42 });
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
  const prefix = kind === "base_fabric" ? "base-fabric" : "finished-fabric";
  doc.save(`${prefix}-labels-${stamp}.pdf`);
}