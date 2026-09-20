import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { UserManager } from "@/components/UserManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await page();
  if (user.role !== "OWNER") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return (
    <>
      <Nav user={user} />
      <main className="mx-auto max-w-[900px] space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Uživatelé</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Obchodnímu partnerovi nebo účetní založ účet v režimu jen pro čtení — uvidí čísla
            i reporty, ale nic nezmění.
          </p>
        </div>
        <UserManager users={users} currentUserId={user.id} />
      </main>
    </>
  );
}
