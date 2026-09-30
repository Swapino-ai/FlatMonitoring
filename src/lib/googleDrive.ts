import { prisma } from "./db";
import { plnyKlic, type SegmentSlozky } from "./dokumenty";

/**
 * Klient Google Disku bez zavislosti na knihovne googleapis: OAuth 2.0 + Drive REST v3.
 *
 * Proc OAuth a ne servisni ucet: soubor vytvoreny servisnim uctem patri jemu a nema
 * misto na osobnim Disku (chyba storageQuotaExceeded). Pri OAuth patri soubory
 * majiteli Disku a pocitaji se do jeho uloziste.
 *
 * Rozsah drive.file: aplikace vidi jen to, co sama nahrala — zbytek Disku je pro ni neviditelny.
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const ROZSAH = "openid email https://www.googleapis.com/auth/drive.file";
export const KOREN_NAZEV = "F(a)latMonitoring";

export function jeNastaveno(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function klient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new ChybaDisku("Google Disk není nastavený (chybí GOOGLE_CLIENT_ID nebo GOOGLE_CLIENT_SECRET).", 503);
  return { id, secret };
}

export class ChybaDisku extends Error {
  constructor(message: string, public stav = 500) {
    super(message);
  }
}

export function redirectUri(origin: string): string {
  return `${origin}/api/google/callback`;
}

export function adresaPrihlaseni(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: klient().id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: ROZSAH,
    access_type: "offline",
    // Bez prompt=consent Google refresh token podruhe uz nevrati
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface OdpovedTokenu {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}

async function tokenPozadavek(body: Record<string, string>): Promise<OdpovedTokenu> {
  const { id, secret } = klient();
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (d.error === "invalid_grant") {
      throw new ChybaDisku("Google odebral přístup (nebo vypršel). Připoj Disk znovu ve Správě.", 401);
    }
    throw new ChybaDisku(`Google odmítl přihlášení: ${d.error_description ?? d.error ?? r.status}`, 502);
  }
  return d as OdpovedTokenu;
}

export async function vymenKod(origin: string, code: string) {
  const t = await tokenPozadavek({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  let email: string | null = null;
  if (t.id_token) {
    try {
      email = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email ?? null;
    } catch { /* e-mail je jen pro zobrazeni */ }
  }
  return { refreshToken: t.refresh_token ?? null, email };
}

let pametToken: { hodnota: string; do: number } | null = null;

async function accessToken(): Promise<string> {
  if (pametToken && pametToken.do > Date.now() + 30_000) return pametToken.hodnota;
  const spojeni = await prisma.googleConnection.findUnique({ where: { id: "main" } });
  if (!spojeni) throw new ChybaDisku("Google Disk není připojený. Připoj ho ve Správě.", 409);
  const t = await tokenPozadavek({ grant_type: "refresh_token", refresh_token: spojeni.refreshToken });
  pametToken = { hodnota: t.access_token, do: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

export const zapomenToken = () => { pametToken = null; };

async function drive(cesta: string, init: RequestInit = {}, zaklad = API): Promise<Response> {
  const token = await accessToken();
  return fetch(`${zaklad}${cesta}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
  });
}

async function json<T>(r: Response, co: string): Promise<T> {
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    let zprava = t;
    try { zprava = JSON.parse(t).error?.message ?? t; } catch { /* necitelne */ }
    throw new ChybaDisku(`${co}: ${zprava || r.status}`, r.status === 404 ? 404 : 502);
  }
  return r.json() as Promise<T>;
}

// --- Slozky ---

export async function vytvorSlozku(nazev: string, rodicId: string): Promise<string> {
  const r = await drive("/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nazev, mimeType: "application/vnd.google-apps.folder", parents: [rodicId] }),
  });
  return (await json<{ id: string }>(r, "Založení složky")).id;
}

/** Zalozi koren aplikace na Disku (jednou, pri pripojeni). */
export async function zalozKoren(): Promise<string> {
  const r = await drive("/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: KOREN_NAZEV, mimeType: "application/vnd.google-apps.folder" }),
  });
  return (await json<{ id: string }>(r, "Založení kořenové složky")).id;
}

// Dva soubehne nahravane soubory nesmi zalozit tu samou slozku dvakrat
const zamky = new Map<string, Promise<string>>();

/**
 * Zajisti cestu slozek pod korenem a vrati id posledni. Slozky se pamatuji
 * v databazi podle logickeho klice, takze prejmenovani nemovitosti nezaklada novou.
 */
export async function zajistiCestu(cesta: SegmentSlozky[]): Promise<string> {
  const spojeni = await prisma.googleConnection.findUnique({ where: { id: "main" } });
  if (!spojeni) throw new ChybaDisku("Google Disk není připojený. Připoj ho ve Správě.", 409);

  let rodic = spojeni.rootFolderId;
  for (let i = 0; i < cesta.length; i++) {
    const klic = plnyKlic(cesta, i);
    const znama = await prisma.driveFolder.findUnique({ where: { klic } });
    if (znama) { rodic = znama.driveId; continue; }

    const rodicPouzity = rodic;
    let slib = zamky.get(klic);
    if (!slib) {
      slib = (async () => {
        const id = await vytvorSlozku(cesta[i].nazev, rodicPouzity);
        await prisma.driveFolder.upsert({
          where: { klic }, update: { driveId: id, nazev: cesta[i].nazev }, create: { klic, driveId: id, nazev: cesta[i].nazev },
        });
        return id;
      })().finally(() => zamky.delete(klic));
      zamky.set(klic, slib);
    }
    rodic = await slib;
  }
  return rodic;
}

/** Slozka na Disku zmizela (smazana rucne): zapomene se, at se pri dalsim nahrani zalozi znovu. */
export async function zapomenSlozky(prefixKlice: string) {
  await prisma.driveFolder.deleteMany({
    where: { OR: [{ klic: prefixKlice }, { klic: { startsWith: `${prefixKlice}/` } }] },
  });
}

// --- Soubory ---

/**
 * Zahaji obnovitelne nahravani a vrati adresu, na kterou prohlizec soubor posle
 * primo (mimo nas server — na Vercelu je limit tela pozadavku 4,5 MB).
 * Hlavicka Origin zaridi, ze Google na tu adresu povoli pozadavek z prohlizece.
 */
export async function zahajNahrani(a: { rodicId: string; nazev: string; mime: string; velikost: number; origin: string }): Promise<string> {
  const r = await drive("/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": a.mime || "application/octet-stream",
      "X-Upload-Content-Length": String(a.velikost),
      Origin: a.origin,
    },
    body: JSON.stringify({ name: a.nazev, parents: [a.rodicId] }),
  }, UPLOAD);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 404) throw new ChybaDisku("Cílová složka na Disku neexistuje.", 404);
    throw new ChybaDisku(`Zahájení nahrávání: ${t || r.status}`, 502);
  }
  const url = r.headers.get("location");
  if (!url) throw new ChybaDisku("Google nevrátil adresu pro nahrávání.", 502);
  return url;
}

export interface InfoSouboru {
  id: string; name: string; mimeType: string; size?: string; trashed?: boolean; parents?: string[];
}

export async function infoSouboru(id: string): Promise<InfoSouboru> {
  const r = await drive(`/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,trashed,parents`);
  return json<InfoSouboru>(r, "Načtení souboru");
}

/** Do kose, ne natrvalo — jde vratit z Disku. */
export async function doKose(id: string): Promise<void> {
  const r = await drive(`/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (r.status === 404) return;
  await json(r, "Smazání souboru");
}

/** Obsah souboru jako proud; prohlizec ho dostane pres nas, takze nemusi mit ucet Google. */
export async function stahni(id: string, rozsah?: string | null): Promise<Response> {
  return drive(`/files/${encodeURIComponent(id)}?alt=media`, rozsah ? { headers: { Range: rozsah } } : {});
}

/** Zkouska pripojeni: vytvori a hned smaze maly soubor v koreni. */
export async function otestuj(): Promise<{ email: string | null; kdyz: string }> {
  const spojeni = await prisma.googleConnection.findUnique({ where: { id: "main" } });
  if (!spojeni) throw new ChybaDisku("Google Disk není připojený.", 409);
  const hranice = "fm" + Math.random().toString(36).slice(2);
  const telo =
    `--${hranice}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: "test-pripojeni.txt", parents: [spojeni.rootFolderId] }) +
    `\r\n--${hranice}\r\nContent-Type: text/plain\r\n\r\nF(a)latMonitoring — test připojení\r\n--${hranice}--`;
  const r = await drive("/files?uploadType=multipart&fields=id", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${hranice}` }, body: telo,
  }, UPLOAD);
  const { id } = await json<{ id: string }>(r, "Zkušební nahrání");
  await doKose(id);
  return { email: spojeni.email, kdyz: new Date().toISOString() };
}

/** Odvolani pristupu u Googlu (pri odpojeni). Selhani nevadi — token stejne zahodime. */
export async function odvolej(refreshToken: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => undefined);
  zapomenToken();
}

export const odkazNaSlozku = (id: string) => `https://drive.google.com/drive/folders/${id}`;
