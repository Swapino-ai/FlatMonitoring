import { cookies } from "next/headers";
import { POHLED_COOKIE, type Pohled } from "./ownership";

/** Pohled zvoleny prepinacem v hlavicce. Vychozi je cele portfolio. */
export async function aktualniPohled(): Promise<Pohled> {
  const c = (await cookies()).get(POHLED_COOKIE)?.value;
  return c === "moje" ? "moje" : "vse";
}
