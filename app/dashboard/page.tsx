import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import DashboardClient from "@/app/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireActiveSubscriber("/dashboard");
  return <DashboardClient />;
}
