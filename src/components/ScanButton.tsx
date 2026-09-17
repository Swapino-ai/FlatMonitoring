"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScanButton({ disabled }: { disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function run() {
    setState("running");
    setMessage("");
    try {
      const res = await fetch("/api/market/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sken selhal");

      const ok = data.results.filter((r: { status: string }) => r.status === "OK").length;
      const failed = data.results.filter((r: { status: string }) => r.status === "FAILED");
      setState(failed.length && !ok ? "error" : "done");
      setMessage(
        failed.length && !ok
          ? `Žádný zdroj neodpověděl. ${failed[0]?.message ?? ""}`
          : `Hotovo — ${ok} úspěšných dotazů, přeceněno ${data.valuations.length} nemovitostí.`,
      );
      router.refresh();
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Neznámá chyba");
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      <button onClick={run} disabled={disabled || state === "running"} className="btn btn-primary">
        {state === "running" ? "Skenuji trh…" : "Spustit sken trhu"}
      </button>
      {message && (
        <span className={`text-sm ${state === "error" ? "text-bad" : "text-good"}`}>{message}</span>
      )}
    </div>
  );
}
