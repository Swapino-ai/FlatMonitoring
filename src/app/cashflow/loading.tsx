import { KostraKarty, KostraStatu, KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Cash flow">
      <KostraStatu />
      <KostraKarty vyska="h-72" />
      <div className="grid gap-4 lg:grid-cols-2"><KostraTabulky /><KostraTabulky /></div>
    </KostraStranky>
  );
}
