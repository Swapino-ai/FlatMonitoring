import { KostraKarty, KostraStatu, KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Načítám nemovitost…">
      <KostraStatu />
      <div className="grid gap-4 lg:grid-cols-3">
        <KostraTabulky radku={6} />
        <KostraTabulky radku={6} />
        <KostraTabulky radku={6} />
      </div>
      <KostraKarty />
    </KostraStranky>
  );
}
