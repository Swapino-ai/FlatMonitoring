import { KostraStranky, KostraTabulky } from "@/components/Skeleton";

export default function Loading() {
  return <KostraStranky nadpis="Nájemníci"><KostraTabulky radku={5} /></KostraStranky>;
}
