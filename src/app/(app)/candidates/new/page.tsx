import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, toDateInput } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { NewCandidateForm } from "./form";

export default async function NewCandidatePage() {
  const user = await requireUser();
  const [recruiters, campaigns] = await Promise.all([
    db.user.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }),
    db.campaign.findMany({ where: { orgId: user.orgId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add an accepted offer" subtitle="The candidate is enrolled immediately and receives a welcome from your joining companion." />
      <NewCandidateForm
        recruiters={recruiters.map((r) => ({ id: r.id, name: r.name }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
        currentUserId={user.id}
        defaultChannel={user.org.defaultChannel}
        today={toDateInput(new Date())}
        defaultJoining={toDateInput(addDays(new Date(), 30))}
      />
    </div>
  );
}
