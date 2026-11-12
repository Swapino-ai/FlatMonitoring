/** Soubor z telefonu pro nahrani: fotka se zmensi (delsi strana 1600 px, JPEG), PDF zustane. */
export interface NactenySoubor { data: string; mime: string; nazev: string; nahled: string | null }

export async function nactiSoubor(f: File): Promise<NactenySoubor> {
  if (f.type === "application/pdf") {
    const b = new Uint8Array(await f.arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { data: btoa(s), mime: "application/pdf", nazev: f.name, nahled: null };
  }
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, chyba) => { const i = new Image(); i.onload = () => ok(i); i.onerror = chyba; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    return { data: dataUrl.split(",")[1], mime: "image/jpeg", nazev: f.name.replace(/\.[^.]+$/, "") + ".jpg", nahled: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
