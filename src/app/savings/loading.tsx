import { KostraStatu, KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Kde ušetřit">
      <KostraStatu />
      <KostraTabulky radku={4} />
      <KostraTabulky radku={4} />
    </KostraStranky>
  );
}
