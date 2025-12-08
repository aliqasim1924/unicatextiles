import { createServerClient } from "@/lib/supabase/serverClient";
import Link from "next/link";
import StockClient from "./stockClient";

interface StockRow {
  dye_item_id: string;
  stock_qty: number;
  dye_items: {
    id: string;
    name: string;
    type: string | null;
    code: string | null;
    uom: string;
  };
}

export default async function DyesStockPage() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("dye_stock")
    .select(
      `
      dye_item_id,
      stock_qty,
      dye_items:dye_item_id (
        id,
        name,
        type,
        code,
        uom
      )
    `
    );

  const processed: StockRow[] =
    (data as any[])?.map((row) => ({
      ...row,
      dye_items: Array.isArray(row.dye_items) ? row.dye_items[0] : row.dye_items,
    })) || [];

  // Sort by name
  processed.sort((a, b) => (a.dye_items?.name || "").localeCompare(b.dye_items?.name || ""));

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dyes &amp; Chemicals Stock</h1>
          <p className="mt-1 text-slate-600">Current stock levels for dyes &amp; chemicals.</p>
        </div>
        <Link
          href="/toolbox/dyes"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Dyes &amp; Chemicals
        </Link>
      </div>

      <StockClient initialStock={processed} />
    </div>
  );
}

