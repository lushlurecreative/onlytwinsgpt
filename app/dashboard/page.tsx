import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import StartDashboardClient from "@/app/start/StartDashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireActiveSubscriber("/dashboard");
  return <StartDashboardClient />;
}
