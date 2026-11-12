/** Soubor z telefonu pro nahrani: fotka se zmensi (delsi strana 1600 px, JPEG), PDF zustane. */
export interface NactenySoubor { data: string; mime: string; nazev: string; nahled: string | null }

export async function nactiSoubor(f: File, nahledMax = 240): Promise<NactenySoubor> {
  if (f.type === "application/pdf") {
    const b = new Uint8Array(await f.arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { data: btoa(s), mime: "application/pdf", nazev: f.name, nahled: null };
  }
  // Dekodovani pres createImageBitmap (bitmapa se hned uvolni); canvas se po pouziti vynuluje,
  // aby telefon nedrzel desitky MB — jinak Android pri dalsim foceni prohlizec ukonci
  let zdroj: ImageBitmap | HTMLImageElement;
  let url: string | null = null;
  try {
    zdroj = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    url = URL.createObjectURL(f);
    zdroj = await new Promise<HTMLImageElement>((ok, chyba) => { const i = new Image(); i.onload = () => ok(i); i.onerror = chyba; i.src = url!; });
  }
  const c = document.createElement("canvas");
  try {
    const k = Math.min(1, 1600 / Math.max(zdroj.width, zdroj.height));
    c.width = Math.round(zdroj.width * k); c.height = Math.round(zdroj.height * k);
    c.getContext("2d")!.drawImage(zdroj, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.82).split(",")[1];
    // Nahled maly (vychozi do 240 px) — v seznamu stejne jen jako miniatura
    const kn = Math.min(1, nahledMax / Math.max(c.width, c.height));
    const m = document.createElement("canvas");
    m.width = Math.round(c.width * kn); m.height = Math.round(c.height * kn);
    m.getContext("2d")!.drawImage(c, 0, 0, m.width, m.height);
    const nahled = m.toDataURL("image/jpeg", 0.7);
    m.width = 0; m.height = 0;
    return { data, mime: "image/jpeg", nazev: f.name.replace(/\.[^.]+$/, "") + ".jpg", nahled };
  } finally {
    c.width = 0; c.height = 0;
    if ("close" in zdroj) zdroj.close();
    if (url) URL.revokeObjectURL(url);
  }
}
