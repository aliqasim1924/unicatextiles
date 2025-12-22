import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function StockPage() {
  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Stock Control</h1>
        <p className="mt-2 text-slate-600">
          Overview across raw materials, base fabric, and finished fabric.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/toolbox/finished-fabric/store" className="w-full">
            <Button variant="primary" className="w-full">
              Finished Fabric Store
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
