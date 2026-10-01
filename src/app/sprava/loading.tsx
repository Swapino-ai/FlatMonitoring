import { KostraStatu, KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Správa">
      <KostraStatu />
      <KostraTabulky radku={4} />
    </KostraStranky>
  );
}
