import { KostraKarty, KostraStatu, KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Přehled portfolia">
      <KostraStatu />
      <div className="grid gap-4 lg:grid-cols-2">
        <KostraKarty />
        <KostraKarty />
      </div>
      <KostraTabulky />
    </KostraStranky>
  );
}
