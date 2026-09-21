import { KostraStranky } from "@/components/Skeleton";
import { Pruh } from "@/components/Skeleton";

export default function Loading() {
  return (
    <KostraStranky nadpis="Nemovitosti">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <Pruh w="w-40" h="h-5" />
            <Pruh w="w-56" h="h-3" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="space-y-1.5"><Pruh w="w-20" h="h-3" /><Pruh w="w-24" /></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </KostraStranky>
  );
}
