import Link from "next/link";
import { Badge } from "./Stat";
import { STATUS_LABELS } from "@/lib/format";
import { nazevNemovitosti } from "@/lib/catalogs";

/** Zalozky detailu nemovitosti — stejne poradi jako na strance nemovitosti. */
export const ZALOZKY_NEMOVITOSTI = [
  ["prehled", "Přehled"], ["katastr", "Katastr"], ["najem", "Nájem"], ["sluzby", "Služby"], ["vyuctovani", "Vyúčtování"],
  ["finance", "Finance"], ["pohyby", "Stav účtu"], ["trh", "Trh"], ["dane", "Daně"],
] as const;

/**
 * Hlavicka nemovitosti (nazev, stav, adresa) a pod ni zalozky jako odkazy. Pouziva ji
 * stranka Ocenění a trh, aby zustal po ruce cely panel nemovitosti.
 */
export function HlavickaNemovitosti({ property, canEdit, aktivni }: {
  property: { id: string; name: string; status: string; street: string; zip: string; city: string; district: string | null; type: string; disposition: string | null; areaM2: number; floor: number | null; buildYear: number | null };
  canEdit: boolean;
  aktivni: (typeof ZALOZKY_NEMOVITOSTI)[number][0];
}) {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/properties" className="text-sm text-ink-muted hover:text-ink-primary">← Nemovitosti</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{property.name}</h1>
          <Badge tone={property.status === "RENTED" ? "good" : property.status === "VACANT" ? "warn" : "neutral"}>
            {STATUS_LABELS[property.status as keyof typeof STATUS_LABELS] ?? property.status}
          </Badge>
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <p className="text-sm text-ink-secondary">
            {property.street}, {property.zip} {property.city}
            {property.district && ` · ${property.district}`} · {nazevNemovitosti(property.type)}
            {property.disposition && ` · ${property.disposition}`} · {property.areaM2} m²
            {property.floor != null && ` · ${property.floor}. patro`}
            {property.buildYear && ` · rok ${property.buildYear}`}
          </p>
          {canEdit && <Link href={`/properties/${property.id}/edit`} className="btn no-print shrink-0">Upravit</Link>}
        </div>
      </div>
      <div className="max-w-full overflow-x-auto pb-1">
        <div className="flex w-fit gap-1 rounded-2xl bg-surface-card p-1 shadow-card">
          {ZALOZKY_NEMOVITOSTI.map(([klic, nazev]) => (
            <Link key={klic} href={klic === "trh" ? `/properties/${property.id}/trh` : `/properties/${property.id}?list=${klic}`}
              aria-current={klic === aktivni ? "page" : undefined}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                klic === aktivni ? "bg-accent text-white" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary"
              }`}>
              {nazev}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
