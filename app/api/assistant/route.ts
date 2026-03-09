import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

type LinkItem = { label: string; href: string };

type AssistantReply = {
  answer: string;
  links: LinkItem[];
};

function reply(answer: string, links: LinkItem[]): AssistantReply {
  return { answer, links };
}

function buildReply(questionRaw: string): AssistantReply {
  const q = questionRaw.toLowerCase();

  if (q.includes("free") || q.includes("cost") || q.includes("price")) {
    return reply(
      "OnlyTwins is a paid subscription platform. Plans include a monthly allowance of AI-generated photos and videos.",
      [
        { label: "View pricing", href: "/pricing" },
        { label: "Upgrade plan", href: "/upgrade" },
      ]
    );
  }

  if (q.includes("plan") || q.includes("difference") || q.includes("starter") || q.includes("growth") || q.includes("scale")) {
    return reply(
      "Starter, Growth, and Scale plans differ by monthly photo/video allowance. You can compare plans in pricing and manage your current plan in upgrade.",
      [
        { label: "View pricing", href: "/pricing" },
        { label: "Manage plans", href: "/upgrade" },
      ]
    );
  }

  if (q.includes("recurring") || q.includes("monthly request") || q.includes("5-day") || q.includes("cutoff")) {
    return reply(
      "Your saved request mix repeats every month. Update at least 5 days before renewal for changes to apply to the next cycle.",
      [
        { label: "Open requests", href: "/requests" },
        { label: "Open billing", href: "/billing" },
      ]
    );
  }

  if (q.includes("upload") || q.includes("training photo") || q.includes("what should i upload") || q.includes("photo")) {
    return reply(
      "Upload clean training photos with good lighting and clear face visibility. Include front, left, right, full-body, and waist-up angles. Avoid hats, phones, and other people in frame.",
      [
        { label: "Upload training photos", href: "/training/photos" },
        { label: "Edit onboarding", href: "/onboarding/intake" },
      ]
    );
  }

  if (q.includes("billing") || q.includes("invoice") || q.includes("payment")) {
    return reply(
      "Billing settings let you review plan status, invoices, and payment details. You can also change plans any time.",
      [
        { label: "Open billing", href: "/billing" },
        { label: "Upgrade plan", href: "/upgrade" },
      ]
    );
  }

  if (q.includes("upgrade")) {
    return reply(
      "Upgrades start immediately. If you upgrade mid-cycle, we apply credit for the unused portion of your current plan.",
      [
        { label: "Upgrade plan", href: "/upgrade" },
        { label: "View requests", href: "/requests" },
      ]
    );
  }

  if (q.includes("request") || q.includes("status")) {
    return reply(
      "You can manage recurring request mix and track request status from the requests page.",
      [
        { label: "View requests", href: "/requests" },
        { label: "Go to dashboard", href: "/dashboard" },
      ]
    );
  }

  if (q.includes("library") || q.includes("results") || q.includes("delivered") || q.includes("content")) {
    return reply(
      "Completed content is available in your library, and public output examples are available in results and gallery.",
      [
        { label: "Open library", href: "/library" },
        { label: "See results", href: "/results" },
        { label: "Open gallery", href: "/gallery" },
      ]
    );
  }

  if (q.includes("onboarding") || q.includes("setup")) {
    return reply(
      "Complete onboarding first, then upload training photos, then set recurring generation preferences.",
      [
        { label: "Onboarding intake", href: "/onboarding/intake" },
        { label: "Upload photos", href: "/training/photos" },
        { label: "Set requests", href: "/requests" },
      ]
    );
  }

  return reply(
    "I can help with plans, onboarding, training photos, requests, billing, and delivery.",
    [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Requests", href: "/requests" },
      { label: "Billing", href: "/billing" },
      { label: "Upgrade", href: "/upgrade" },
    ]
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const result = buildReply(message);
  return NextResponse.json(result, { status: 200 });
}
