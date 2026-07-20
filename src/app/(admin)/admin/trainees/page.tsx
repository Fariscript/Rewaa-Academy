import { auth } from "@/auth";
import { listUsers } from "@/lib/admin/list-users";
import { getFullTaxonomy } from "@/lib/content/taxonomy";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SectorSelect } from "@/components/admin/sector-select";

// FR-07/FR-14: trainee list with sector assignment. Reassignment's effect
// on in-flight quiz progress is open item #2 — nothing here implies an
// answer either way.
export default async function AdminTraineesPage() {
  const session = await auth();
  const [users, taxonomy] = await Promise.all([listUsers(session), getFullTaxonomy(session)]);
  const sectors = taxonomy.map((sector) => ({ id: sector.id, name: sector.name }));

  return (
    <div>
      <PageHeader title="المتدربون" description="تعيين المتدربين إلى قطاعاتهم" />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="p-3 text-start font-medium">المستخدم</th>
              <th className="p-3 text-start font-medium">الدور</th>
              <th className="p-3 text-start font-medium">القطاع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="p-3">
                  <p className="font-medium">{user.name ?? user.email}</p>
                  <p className="text-neutral-500 dark:text-neutral-400" dir="ltr">
                    {user.email}
                  </p>
                </td>
                <td className="p-3">
                  <Badge variant={user.role === "ADMIN" ? "info" : "neutral"}>
                    {user.role === "ADMIN" ? "مسؤول" : "متدرب"}
                  </Badge>
                </td>
                <td className="p-3">
                  {user.role === "ADMIN" ? (
                    <span className="text-neutral-400 dark:text-neutral-500">—</span>
                  ) : (
                    <SectorSelect traineeId={user.id} currentSectorId={user.sectorId} sectors={sectors} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
