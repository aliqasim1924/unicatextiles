
const TRACEABILITY_URL =
  "https://unicatextilemills.netlify.app";

type RollQrData = {
  type: "base_fabric" | "finished_fabric";
  roll_no: string | null;
  qr_code: string;
};

export function getRollQrValue(roll: RollQrData): string {
  // Keep existing base fabric QR codes unchanged.
  if (roll.type === "base_fabric") {
    return roll.qr_code;
  }

  // Finished fabric QR codes open the customer page.
  const rollNumber = roll.roll_no?.trim();

  if (!rollNumber) {
    // Preserve the existing identifier if no roll
    // number is available.
    return roll.qr_code;
  }

  return (
    `${TRACEABILITY_URL}/traceability/` +
    encodeURIComponent(rollNumber)
  );
}
