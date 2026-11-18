/**
 * Snimky (screenshoty) zarazenych inzeratu: porizuje je nocni sken v GitHub Actions
 * a uklada do databaze. Odtud se presouvaji na Google Disk (slozka Trh), jakmile
 * je k dispozici pripojeni — aplikace to dela pri otevreni stranky trhu.
 */
import { prisma } from "../db";
import { jeNastaveno, nahrajPrimo, zajistiCestu } from "../googleDrive";
import { bezpecneJmeno } from "../dokumenty";

export async function presunSnimkyNaDisk(limit = 5): Promise<number> {
  if (!jeNastaveno()) return 0;
  const spojeni = await prisma.googleConnection.findUnique({ where: { id: "main" } });
  if (!spojeni) return 0;
  const cekajici = await prisma.inzeratSnimek.findMany({
    where: { driveId: null, data: { not: null } }, take: limit, orderBy: { createdAt: "asc" },
    include: { inzerat: true },
  });
  let presunuto = 0;
  for (const s of cekajici) {
    try {
      const slozka = await zajistiCestu([
        { klic: "TRH", nazev: "Trh" },
        { klic: `TRH:${s.inzerat.category}:${s.inzerat.city}`, nazev: bezpecneJmeno(`${s.inzerat.city}`) },
        { klic: `TRH:I:${s.inzerat.id}`, nazev: bezpecneJmeno(`${s.inzerat.dealType === "SALE" ? "prodej" : "nájem"} ${s.inzerat.disposition ?? ""} ${s.inzerat.areaM2 ?? ""} m2 ${s.inzerat.externalId}`) },
        // Fotky zvlast, snimky stranky zvlast — podle snimku je videt, jak se cena v case menila
        s.druh === "FOTO"
          ? { klic: `TRH:I:${s.inzerat.id}:FOTKY`, nazev: "Fotky" }
          : { klic: `TRH:I:${s.inzerat.id}:CENY`, nazev: "Historie ceny (snímky stránky)" },
      ]);
      const pripona = s.mime === "image/png" ? ".png" : s.mime === "image/webp" ? ".webp" : ".jpg";
      const cena = s.price == null ? "" : s.price < 1000 ? " – cena na vyžádání" : ` – ${Math.round(s.price).toLocaleString("cs-CZ")} Kč${s.inzerat.dealType === "RENT" ? " měsíčně" : ""}`;
      const nazev = s.druh === "FOTO"
        ? `foto ${String((s.poradi ?? 0) + 1).padStart(2, "0")}${pripona}`
        : bezpecneJmeno(`${s.createdAt.toISOString().slice(0, 10)}${cena}`) + pripona;
      const driveId = await nahrajPrimo({ rodicId: slozka, nazev, mime: s.mime, data: s.data! });
      await prisma.inzeratSnimek.update({ where: { id: s.id }, data: { driveId, data: null } });
      presunuto++;
    } catch (e) {
      console.error("Přesun snímku na Disk selhal:", e);
      break;
    }
  }
  return presunuto;
}
