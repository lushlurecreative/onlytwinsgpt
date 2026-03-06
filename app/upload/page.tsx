import { redirect } from "next/navigation";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";

export default async function UploadPage() {
  await requireActiveSubscriber("/upload");
  redirect("/training/photos");
}
