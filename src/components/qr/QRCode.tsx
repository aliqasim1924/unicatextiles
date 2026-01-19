"use client";

import { QRCodeSVG } from "qrcode.react";

interface QRCodeProps {
  value: string;
  size?: number;
  level?: "L" | "M" | "Q" | "H";
  includeMargin?: boolean;
  className?: string;
}

export function QRCode({
  value,
  size = 200,
  level = "M",
  includeMargin = true,
  className = "",
}: QRCodeProps) {
  return (
    <div className={className}>
      <QRCodeSVG
        value={value}
        size={size}
        level={level}
        includeMargin={includeMargin}
        fgColor="#0F172A"
        bgColor="#FFFFFF"
      />
    </div>
  );
}

