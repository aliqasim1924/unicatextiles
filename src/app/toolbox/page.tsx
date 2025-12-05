import Link from "next/link";
import { ToolboxCard } from "@/components/toolbox/ToolboxCard";
import { Button } from "@/components/ui/Button";

const controlCards = [
  {
    title: "Yarn Control",
    items: ["Receiving", "Issuing", "Stock"],
    href: "/toolbox/yarn",
  },
  {
    title: "Base Fabric Control",
    items: ["Receiving", "Issuing", "Stock"],
    href: "/toolbox/base-fabric",
  },
  {
    title: "Finished Fabric Control",
    items: ["Receiving", "Issuing", "Stock"],
    href: "/toolbox/finished-fabric",
  },
  {
    title: "Dyes & Chemicals",
    items: ["Receiving", "Issuing", "Stock"],
    href: "/toolbox/dyes",
  },
  {
    title: "Stock Control",
    items: ["Raw Materials", "Base Fabric", "Finished Fabric"],
    href: "/toolbox/stock",
  },
  {
    title: "Orders & Dispatch",
    items: ["New Orders", "Order Tracking", "Dispatch"],
    href: "/toolbox/orders",
  },
];

export default function ToolboxPage() {
  return (
    <div className="grid gap-8">
      {/* Header Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Toolbox</h1>
        <p className="mt-2 text-lg text-slate-600">
          Choose a control area to begin.
        </p>
      </section>

      {/* Control Cards Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {controlCards.map((card, index) => (
          <ToolboxCard
            key={card.title}
            title={card.title}
            items={card.items}
            href={card.href}
            index={index}
          />
        ))}
      </section>

      {/* Quick Shortcuts */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Quick Actions
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/toolbox/yarn/receiving" className="flex-1">
            <Button variant="primary" className="w-full">
              Record Yarn Receiving
            </Button>
          </Link>
          <Link href="/toolbox/orders/new" className="flex-1">
            <Button variant="primary" className="w-full">
              New Order
            </Button>
          </Link>
          <Link href="/toolbox/qr" className="flex-1">
            <Button variant="primary" className="w-full">
              Scan QR Code
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
