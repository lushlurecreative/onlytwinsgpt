import { redirect } from "next/navigation";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";

export default async function TrainingVaultPage() {
  await requireActiveSubscriber("/training-vault");
  redirect("/dashboard");
}
