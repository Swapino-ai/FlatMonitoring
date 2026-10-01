import { KostraKarty, KostraStatu, KostraStranky } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Nemovitost">
      <KostraStatu />
      <KostraKarty vyska="h-48" />
    </KostraStranky>
  );
}
