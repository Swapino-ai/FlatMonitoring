import { KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return <KostraStranky nadpis="Uživatelé"><KostraTabulky radku={3} /></KostraStranky>;
}
