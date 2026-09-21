import { KostraStatu, KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Podklad pro daňové přiznání">
      <KostraStatu />
      <KostraTabulky radku={3} />
      <KostraTabulky radku={5} />
    </KostraStranky>
  );
}
