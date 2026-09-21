import { KostraKarty, KostraStatu, KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Porovnání s trhem">
      <KostraStatu />
      <KostraKarty />
      <KostraTabulky />
    </KostraStranky>
  );
}
