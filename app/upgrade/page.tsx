import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import UpgradePlanClient from "./UpgradePlanClient";

export const dynamic = "force-dynamic";

export default async function UpgradePage() {
  await requireActiveSubscriber("/upgrade");
  return (
    <main className="control-route-shell">
      <UpgradePlanClient />
    </main>
  );
}
