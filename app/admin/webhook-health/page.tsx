import { redirect } from "next/navigation";

export default function WebhookHealthPage() {
  redirect("/admin/leads");
}
