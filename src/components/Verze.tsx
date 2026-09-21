/**
 * Ukazatel nasazene verze. Bez nej se neda poznat, jestli uzivatel vidi
 * posledni kod, nebo starsi nasazeni — a hledala by se chyba tam, kde neni.
 */
export function Verze() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const zprava = process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0];

  return (
    <a href="/api/diagnostika" target="_blank" rel="noreferrer"
      className="whitespace-nowrap text-xs text-ink-muted hover:text-ink-primary"
      title={zprava ?? "Diagnostika výkonu"}>
      {sha ? `verze ${sha}` : "lokálně"}
    </a>
  );
}
