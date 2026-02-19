import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ creatorId: string }>;
};

export default async function AdminCreatorDetailPage({ params }: PageProps) {
  const { creatorId } = await params;
  redirect(`/admin/customers/${creatorId}`);
}
