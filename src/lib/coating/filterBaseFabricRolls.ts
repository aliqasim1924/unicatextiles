export interface BaseFabricRollSearchRow {
  roll_no: string | null;
  qr_code?: string | null;
  order_no?: string | null;
  fabric_name?: string | null;
  loom_no?: string | null;
}

/** Filter coating base-fabric rolls by roll no, QR, order, fabric, or loom. */
export function filterBaseFabricRolls<T extends BaseFabricRollSearchRow>(
  rolls: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rolls;

  const numericPart = q.replace(/^bfr-?0*/i, "");

  return rolls.filter((roll) => {
    const rollNo = (roll.roll_no ?? "").toLowerCase();
    const rollNoDigits = rollNo.replace(/^bfr-0*/i, "");

    return (
      rollNo.includes(q) ||
      (!!numericPart && rollNoDigits.includes(numericPart)) ||
      (roll.qr_code ?? "").toLowerCase().includes(q) ||
      (roll.order_no ?? "").toLowerCase().includes(q) ||
      (roll.fabric_name ?? "").toLowerCase().includes(q) ||
      String(roll.loom_no ?? "").toLowerCase().includes(q)
    );
  });
}
