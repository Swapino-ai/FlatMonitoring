import { cookies } from "next/headers";
import { POHLED_COOKIE, type Pohled } from "./ownership";

/**
 * Hodnota cookie: "vse" (cele portfolio), "moje" (podil prihlaseneho) nebo "u:<userId>"
 * (podil jineho vlastnika). Vychozi je cele portfolio.
 */
async function hodnota(): Promise<string> {
  return (await cookies()).get(POHLED_COOKIE)?.value ?? "vse";
}

/** Pohled zvoleny prepinacem v hlavicce: "moje" = krati se na podil nekoho (me nebo vybraneho vlastnika). */
export async function aktualniPohled(): Promise<Pohled> {
  const c = await hodnota();
  return c === "moje" || c.startsWith("u:") ? "moje" : "vse";
}

/** Cisi podil se zobrazuje: vybrany vlastnik, jinak prihlaseny uzivatel. */
export async function kdoPohledu(prihlasenyId: string): Promise<string> {
  const c = await hodnota();
  return c.startsWith("u:") && c.length > 2 ? c.slice(2) : prihlasenyId;
}

/** Surova volba pro prepinac ("vse" | "moje" | "u:<id>"). */
export async function volbaPohledu(): Promise<string> {
  const c = await hodnota();
  return c === "moje" || /^u:[\w-]+$/.test(c) ? c : "vse";
}
