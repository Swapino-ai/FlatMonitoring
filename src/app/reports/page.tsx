import Link from "next/link";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Card } from "@/components/Stat";
import { ReportBuilder } from "@/components/ReportBuilder";
import { canRenderPdfOnServer } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await page();
  const currentYear = new Date().getFullYear();

  return (
    <>
      <Nav user={user} />
      <main className="mx-auto max-w-[1000px] space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporty</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Vygeneruj PDF pro obchodního partnera nebo účetní. Vzhled je stejný jako v aplikaci.
          </p>
        </div>

        <ReportBuilder currentYear={currentYear} serverPdf={canRenderPdfOnServer} />

        <Card title="Jak report sdílet">
          <div className="space-y-3 text-sm text-ink-secondary">
            <p>
              <strong className="text-ink-primary">PDF e-mailem.</strong> Nejjednodušší cesta — vygeneruj, stáhni, pošli.
              Partner nepotřebuje nic instalovat ani se nikam přihlašovat.
            </p>
            <p>
              <strong className="text-ink-primary">Živý přístup.</strong> Partner má vlastní účet v režimu jen pro čtení.
              Aby se k aplikaci dostal, vystav ji přes Tailscale nebo Cloudflare Tunnel — návod je v README. Nikdy ji
              nevystavuj na veřejnou IP bez tunelu.
            </p>
            <p>
              <strong className="text-ink-primary">Tisk z prohlížeče.</strong> Otevři{" "}
              <Link href="/report" className="text-accent hover:underline">tiskovou verzi</Link> a dej Ctrl+P — stránka má
              vlastní tiskové styly, takže výsledek vypadá stejně jako v aplikaci.
            </p>
          </div>
        </Card>
      </main>
    </>
  );
}
