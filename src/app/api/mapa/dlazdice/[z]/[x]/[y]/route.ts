import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * Dlazdice mapy z Mapy.cz.
 *
 * Prohlizec si je tahá pres nas server zamerne — v adrese dlazdice je klic
 * a ten by si z pozadavku kdokoli precetl a pouzival na svem webu.
 * Nevyhoda je jeden skok navic, coz u aplikace pro dva lidi nevadi.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const user = await getSession();
  if (!user) return new NextResponse("Nepřihlášen", { status: 401 });

  const { z, x, y } = await params;
  // Cislo dlazdice jde primo do ciziho URL, takze se pouzije jen kdyz je to
  // opravdu cislo — nic jineho tam nepatri. Pri priblizeni na dum (zoom 17+)
  // ma souradnice dlazdice sest cislic, proto ne prilis tesny limit.
  const cislo = (v: string, max: number) => /^\d{1,7}$/.test(v) && Number(v) <= max;
  if (!cislo(z, 19) || !cislo(x, 2 ** 19) || !cislo(y, 2 ** 19)) {
    return new NextResponse("Neplatná dlaždice", { status: 400 });
  }

  const klic = process.env.MAPY_API_KEY;
  if (!klic) return new NextResponse("Mapa není nastavená", { status: 503 });

  const url = `https://api.mapy.cz/v1/maptiles/basic/256/${z}/${x}/${y}?apikey=${encodeURIComponent(klic)}`;

  try {
    const r = await fetch(url);
    if (!r.ok) return new NextResponse("Dlaždice nedostupná", { status: r.status });

    return new NextResponse(await r.arrayBuffer(), {
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "image/png",
        // Dlazdice se nemeni, at je prohlizec nestahuje pri kazdem posunu
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Mapa je dočasně nedostupná", { status: 502 });
  }
}
