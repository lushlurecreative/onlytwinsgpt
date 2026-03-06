import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import StartDashboardClient from "@/app/start/StartDashboardClient";

export const dynamic = "force-dynamic";

export default async function StartPage() {
  await requireActiveSubscriber("/start");
  return <StartDashboardClient />;
}

