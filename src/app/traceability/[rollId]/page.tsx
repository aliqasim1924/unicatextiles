
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";

type BaseRoll = {
  roll_no: string;
  loom_no: string | null;
  gsm: number | null;
};

type RollDetails = {
  roll_no: string;
  grade: string | null;
  batch_no: string | null;
  color: string | null;
  coating_type: string | null;
  gsm: number | null;
  length_m: number | null;
  produced_at?: string | null;
  base_rolls: BaseRoll[];
};

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

export default function TraceabilityPage() {
  const params = useParams();
  const rollId = params.rollId as string;

  const [roll, setRoll] = useState<RollDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBaseRolls, setShowBaseRolls] = useState(false);

  const contactEmail =
    process.env.NEXT_PUBLIC_TRACEABILITY_CONTACT_EMAIL;

  useEffect(() => {
    if (!rollId) return;

    let active = true;

    async function loadRoll() {
      setLoading(true);
      setError("");
      setRoll(null);

      try {
        const response = await fetch(
          `/api/public/traceability/${encodeURIComponent(rollId)}`
        );

        if (!response.ok) {
          throw new Error("Roll information unavailable.");
        }

        const data: RollDetails = await response.json();

        if (active) setRoll(data);
      } catch {
        if (active) {
          setError(
            "Unable to retrieve roll information. Please check the roll number."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRoll();

    return () => {
      active = false;
    };
  }, [rollId]);

  const baseRolls = roll?.base_rolls ?? [];

  const loomNumbers = Array.from(
    new Set(
      baseRolls
        .map((base) => base.loom_no?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  const baseGsms = Array.from(
    new Set(
      baseRolls
        .map((base) => base.gsm)
        .filter((value): value is number => value != null)
    )
  ).sort((a, b) => a - b);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white shadow-sm">

        <header className="border-b border-slate-200 p-6 sm:p-8">
          <Image
            src="/Logo.png"
            alt="Unica Textile Mills"
            width={220}
            height={100}
            className="h-auto max-h-24 w-auto object-contain"
            priority
          />

          <h1 className="mt-6 text-2xl font-bold">
            Product Traceability
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Finished Fabric Roll Information
          </p>
        </header>

        {loading && (
          <p className="p-8 text-center text-slate-500">
            Loading roll information...
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="p-8 text-center text-red-600"
          >
            {error}
          </p>
        )}

        {!loading && !error && roll && (
          <div className="space-y-8 p-6 sm:p-8">

            <section className="rounded-xl bg-slate-900 p-6 text-white">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-300">
                Finished Fabric Roll
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <h2 className="break-all text-2xl font-bold sm:text-3xl">
                  {roll.roll_no}
                </h2>

                {roll.grade && (
                  <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900">
                    Grade {roll.grade}
                  </span>
                )}
              </div>

              <p className="mt-3 text-sm text-slate-300">
                CBT Batch: {display(roll.batch_no)}
              </p>
            </section>

            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <span
                aria-hidden="true"
                className="text-xl text-emerald-700"
              >
                ✓
              </span>

              <div>
                <p className="font-semibold text-emerald-900">
                  Roll record found
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  Production information retrieved from
                  Unica Textile Mills.
                </p>
              </div>
            </div>

            <section>
              <h2 className="mb-5 text-lg font-semibold">
                Finished Fabric Information
              </h2>

              <div className="grid grid-cols-2 gap-x-5 gap-y-6">
                <Detail
                  label="Fabric Type"
                  value={display(roll.coating_type)}
                />
                <Detail
                  label="Colour"
                  value={display(roll.color)}
                />
                <Detail
                  label="Finished GSM"
                  value={
                    roll.gsm != null
                      ? `${roll.gsm} GSM`
                      : "—"
                  }
                />
                <Detail
                  label="Roll Length"
                  value={
                    roll.length_m != null
                      ? `${roll.length_m} m`
                      : "—"
                  }
                />
                <Detail
                  label="Production Date"
                  value={formatDate(roll.produced_at)}
                />
                <Detail
                  label="CBT Batch"
                  value={display(roll.batch_no)}
                />
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold">
                Base Fabric Traceability
              </h2>

              <p className="mb-5 text-sm text-slate-500">
                Base fabric rolls associated with this
                coating batch.
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Summary
                  label="Base GSM"
                  value={
                    baseGsms.length
                      ? baseGsms.map((gsm) => `${gsm}`).join(", ") +
                      " GSM"
                      : "—"
                  }
                />

                <Summary
                  label="Looms Used"
                  value={
                    loomNumbers.length
                      ? loomNumbers.join(", ")
                      : "—"
                  }
                />

                <Summary
                  label="Base Rolls"
                  value={String(baseRolls.length)}
                />
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBaseRolls(!showBaseRolls)}
                  aria-expanded={showBaseRolls}
                  className="flex w-full items-center justify-between gap-3 bg-slate-50 p-4 text-left font-semibold hover:bg-slate-100"
                >
                  <span>
                    Base Fabric Rolls Used in This Batch
                  </span>

                  <span aria-hidden="true">
                    {showBaseRolls ? "−" : "+"}
                  </span>
                </button>


                {showBaseRolls && (
                  <div>
                    <p className="px-4 py-3 text-xs leading-relaxed text-slate-500">
                      The base fabric rolls listed below were used in the
                      associated coating batch. They may not all be directly
                      associated with this individual finished fabric roll.
                    </p>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="p-3">Base Roll</th>
                            <th className="p-3">Loom No.</th>
                            <th className="p-3">Base GSM</th>
                          </tr>
                        </thead>

                        <tbody>
                          {baseRolls.length === 0 ? (
                            <tr>
                              <td
                                colSpan={3}
                                className="p-4 text-slate-500"
                              >
                                No base fabric records available.
                              </td>
                            </tr>
                          ) : (
                            baseRolls.map((base, index) => (
                              <tr
                                key={`${base.roll_no}-${index}`}
                                className="border-t border-slate-200"
                              >
                                <td className="p-3">
                                  {base.roll_no}
                                </td>
                                <td className="p-3">
                                  {display(base.loom_no)}
                                </td>
                                <td className="p-3">
                                  {base.gsm != null
                                    ? `${base.gsm} GSM`
                                    : "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </section>

            {contactEmail && (
              <section className="border-t border-slate-200 pt-6 text-center">
                <p className="text-sm text-slate-500">
                  Have a question about this fabric roll?
                </p>

                <a
                  href={`mailto:${contactEmail}?subject=${encodeURIComponent(
                    `Fabric Roll Enquiry - ${roll.roll_no}`
                  )}`}
                  className="mt-3 inline-block rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-slate-50"
                >
                  Contact Unica Textile Mills
                </a>
              </section>
            )}
          </div>
        )}

        <footer className="border-t border-slate-200 p-5 text-center text-xs text-slate-500">
          Unica Textile Mills | Product Traceability
        </footer>
      </div>
    </main>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-100 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-bold">
        {value}
      </p>
    </div>
  );
}
