import { KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return <KostraStranky nadpis="Reporty"><KostraTabulky radku={4} /></KostraStranky>;
}
