
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ rollId: string }>;
};

function unavailable() {
  return NextResponse.json(
    { error: "Roll information unavailable." },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { rollId } = await context.params;

  if (
    !rollId ||
    rollId.length > 120 ||
    !/^[a-zA-Z0-9_-]+$/.test(rollId)
  ) {
    return unavailable();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    console.error("Traceability API credentials missing.");
    return NextResponse.json(
      { error: "Service unavailable." },
      { status: 503 }
    );
  }

  // Server-side only. Never expose this key to the browser.
  const db = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // Look up the finished roll by its QR identifier
    // or its printed roll number.
    const { data: rolls, error: rollError } = await db
      .from("finished_fabric_rolls")
      .select(
        "id, roll_no, batch_id, grade, color, coating_type, gsm, length_m, produced_at, status"
      )
      .or(
        `qr_code.eq.${rollId},roll_no.eq.${rollId}`
      )
      .limit(2);

    if (rollError) throw rollError;
    if (!rolls || rolls.length !== 1) {
      return unavailable();
    }

    const roll = rolls[0];


    // Only rolls currently dispatched to customers are eligible.
    if (
      roll.status !== "ISSUED"
    ) {
      return unavailable();
    }

    // Find active customer dispatches.
    const { data: issues, error: issueError } = await db
      .from("finished_fabric_store_issue_items")
      .select(
        "finished_fabric_store_issues!inner(issue_time, destination, status)"
      )
      .eq("roll_id", roll.id)
      .eq("finished_fabric_store_issues.destination", "CUSTOMER")
      .eq("finished_fabric_store_issues.status", "ACTIVE");

    if (issueError) throw issueError;

    // Find active store issue returns.
    const { data: storeReturns, error: storeReturnError } =
      await db
        .from("finished_fabric_store_issue_return_items")
        .select(
          "finished_fabric_store_issue_returns!inner(return_time, status)"
        )
        .eq("roll_id", roll.id)
        .eq("finished_fabric_store_issue_returns.status", "ACTIVE");

    if (storeReturnError) throw storeReturnError;

    // Find active customer returns.
    const { data: customerReturns, error: customerReturnError } =
      await db
        .from("customer_return_lines")
        .select("customer_returns!inner(created_at, status)")
        .eq("roll_id", roll.id)
        .eq("customer_returns.status", "ACTIVE");

    if (customerReturnError) throw customerReturnError;

    function latestDate(
      rows: Record<string, unknown>[],
      relation: string,
      field: string
    ): number {
      let latest = 0;

      for (const row of rows) {
        const raw = row[relation];
        const record = Array.isArray(raw) ? raw[0] : raw;

        if (record && typeof record === "object") {
          const value = (record as Record<string, unknown>)[field];

          if (typeof value === "string") {
            const time = Date.parse(value);
            if (Number.isFinite(time)) {
              latest = Math.max(latest, time);
            }
          }
        }
      }

      return latest;
    }

    const lastIssue = latestDate(
      issues ?? [],
      "finished_fabric_store_issues",
      "issue_time"
    );

    const lastStoreReturn = latestDate(
      storeReturns ?? [],
      "finished_fabric_store_issue_returns",
      "return_time"
    );

    const lastCustomerReturn = latestDate(
      customerReturns ?? [],
      "customer_returns",
      "created_at"
    );

    const lastReturn = Math.max(
      lastStoreReturn,
      lastCustomerReturn
    );

    // A customer dispatch must be newer than any return.
    if (!lastIssue || lastReturn >= lastIssue) {
      return unavailable();
    }


    let batchNo: string | null = null;

    const baseRolls: {
      roll_no: string;
      loom_no: string | null;
      gsm: number | null;
    }[] = [];

    if (roll.batch_id) {
      const { data: batch, error: batchError } =
        await db
          .from("coating_batches")
          .select("batch_no")
          .eq("id", roll.batch_id)
          .single();

      if (batchError) throw batchError;
      batchNo = batch.batch_no;

      const { data: links, error: linksError } =
        await db
          .from("coating_batch_base_rolls")
          .select("base_fabric_roll_id")
          .eq("batch_id", roll.batch_id);

      if (linksError) throw linksError;

      const baseIds = [
        ...new Set(
          (links ?? []).map(
            (item) => item.base_fabric_roll_id
          )
        ),
      ];

      if (baseIds.length > 0) {
        const { data: bases, error: basesError } =
          await db
            .from("base_fabric_rolls")
            .select(
              `roll_no,
               actual_gsm,
               base_fabric_orders:base_fabric_order_id (
                 loom_no,
                 base_fabric_items:base_fabric_item_id (
                   gsm
                 )
               )`
            )
            .in("id", baseIds);

        if (basesError) throw basesError;

        for (const base of bases ?? []) {
          const rawOrder = base.base_fabric_orders;
          const order = Array.isArray(rawOrder)
            ? rawOrder[0]
            : rawOrder;

          const rawItem = order?.base_fabric_items;
          const item = Array.isArray(rawItem)
            ? rawItem[0]
            : rawItem;

          baseRolls.push({
            roll_no: base.roll_no ?? "—",
            loom_no: order?.loom_no ?? null,
            gsm:
              base.actual_gsm != null
                ? Number(base.actual_gsm)
                : item?.gsm != null
                  ? Number(item.gsm)
                  : null,
          });
        }
      }
    }

    baseRolls.sort((a, b) =>
      a.roll_no.localeCompare(b.roll_no)
    );

    const grade = String(roll.grade ?? "")
      .trim()
      .toUpperCase();

    return NextResponse.json(
      {
        roll_no: roll.roll_no,
        grade: ["A", "B", "C"].includes(grade)
          ? grade
          : null,
        batch_no: batchNo,
        color: roll.color,
        coating_type: roll.coating_type,
        gsm: roll.gsm,
        length_m: roll.length_m,
        base_rolls: baseRolls,
        produced_at: roll.produced_at,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    console.error("Traceability lookup failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve roll information." },
      { status: 500 }
    );
  }
}
