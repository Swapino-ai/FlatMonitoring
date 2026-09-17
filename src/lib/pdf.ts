/**
 * Generovani PDF: headless Chromium vytiskne tiskovou verzi /report.
 * Diky tomu vypada PDF stejne jako aplikace — zadne zvlastni sablony k udrzbe.
 */
import { chromium } from "playwright";

export interface PdfOptions {
  /** Absolutni URL na /report vcetne query parametru */
  url: string;
  /** Session cookie, aby si headless prohlizec prosel autentizaci */
  cookie?: { name: string; value: string; domain: string; path: string };
}

export async function renderReportPdf(opts: PdfOptions): Promise<Buffer> {
  // CHROMIUM_PATH umozni pouzit uz nainstalovany Chrome/Chromium misto toho
  // stazeneho Playwrightem — setri misto a resi prostredi, kde stahovani neprojde.
  const executablePath = process.env.CHROMIUM_PATH || undefined;

  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1600 },
      deviceScaleFactor: 2,
      colorScheme: "light", // PDF vzdy ve svetlem rezimu — tiskne se na papir
    });

    if (opts.cookie) await context.addCookies([opts.cookie]);

    const page = await context.newPage();
    await page.goto(opts.url, { waitUntil: "networkidle", timeout: 60_000 });

    // Pockej, az se stranka oznaci jako pripravena a dokresli se grafy (Recharts animace)
    await page.waitForSelector("[data-report-ready]", { timeout: 30_000 });
    await page.waitForFunction(
      () => document.querySelectorAll(".recharts-wrapper").length === 0 ||
            document.querySelectorAll(".recharts-surface").length > 0,
      { timeout: 15_000 },
    ).catch(() => { /* report bez grafu je v poradku */ });
    await page.waitForTimeout(1200);

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%;padding:0 12mm;font-family:system-ui,sans-serif;font-size:8px;color:#8f8e88;
                    display:flex;justify-content:space-between;">
          <span>FlatMonitoring — report portfolia</span>
          <span>Strana <span class="pageNumber"></span> z <span class="totalPages"></span></span>
        </div>`,
    });
  } finally {
    await browser.close();
  }
}
