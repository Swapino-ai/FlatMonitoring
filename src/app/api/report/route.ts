import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { renderReportPdf } from "@/lib/pdf";

export const maxDuration = 120;

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });

  const url = new URL(request.url);
  const year = url.searchParams.get("rok") ?? String(new Date().getFullYear());
  const sections = url.searchParams.get("sekce") ?? "prehled,nemovitosti,cashflow,uspory,dane";

  const reportUrl = new URL("/report", url.origin);
  reportUrl.searchParams.set("rok", year);
  reportUrl.searchParams.set("sekce", sections);

  const sessionCookie = (await cookies()).get("fm_session");
  if (!sessionCookie) return NextResponse.json({ error: "Chybí session" }, { status: 401 });

  try {
    const pdf = await renderReportPdf({
      url: reportUrl.toString(),
      cookie: {
        name: sessionCookie.name,
        value: sessionCookie.value,
        domain: url.hostname,
        path: "/",
      },
    });

    const filename = `portfolio-report-${year}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Neznámá chyba";
    return NextResponse.json(
      { error: `PDF se nepodařilo vygenerovat: ${message}. Zkontroluj, že je nainstalovaný Chromium (npx playwright install chromium).` },
      { status: 500 },
    );
  }
}
