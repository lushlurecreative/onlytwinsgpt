import { NextResponse } from "next/server";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

type LinkItem = { label: string; href: string };

type AssistantReply = {
  answer: string;
  links: LinkItem[];
};

function reply(answer: string, links: LinkItem[]): AssistantReply {
  return { answer, links };
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function buildReply(questionRaw: string): AssistantReply {
  const q = questionRaw.toLowerCase();

  if (hasAny(q, ["how does it work", "how do you do this", "how do i do this", "how it works"])) {
    return reply(
      "OnlyTwins works in three main steps: you complete your profile, upload training photos, and choose your recurring monthly generation preferences. Each cycle, we generate your included photo and video package as a full batch based on your saved request mix, then deliver completed content to your library.",
      [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Requests", href: "/requests" },
        { label: "Training Photos", href: "/training/photos" },
        { label: "Library", href: "/library" },
      ]
    );
  }

  if (hasAny(q, ["free", "cost", "price", "pricing"])) {
    return reply(
      "No — OnlyTwins is a paid subscription platform. Plans include a monthly allowance of AI-generated photos and videos.",
      [
        { label: "View pricing", href: "/pricing" },
        { label: "Upgrade plan", href: "/upgrade" },
      ]
    );
  }

  if (hasAny(q, ["plan", "plans", "difference", "starter", "growth", "scale", "package"])) {
    return reply(
      "We offer Starter, Growth, Scale, Single Content Batch, and partner packages. The main differences are monthly allowance and delivery model.",
      [
        { label: "View pricing", href: "/pricing" },
        { label: "Upgrade plan", href: "/upgrade" },
      ]
    );
  }

  if (hasAny(q, ["recurring", "monthly request", "5-day", "cutoff", "repeat", "next cycle"])) {
    return reply(
      "Your saved request mix repeats every month unless you update it at least 5 days before renewal. If part of your allowance is unassigned, OnlyTwins fills the remaining scenes and styles automatically for that cycle.",
      [
        { label: "Open requests", href: "/requests" },
        { label: "Open billing", href: "/billing" },
      ]
    );
  }

  if (hasAny(q, ["don't choose", "dont choose", "unassigned", "remaining", "not choose all"])) {
    return reply(
      "If you do not choose all items in your monthly allowance, OnlyTwins automatically selects the remaining scenes and styles so your full batch can still be produced.",
      [
        { label: "Requests", href: "/requests" },
        { label: "Upgrade", href: "/upgrade" },
      ]
    );
  }

  if (hasAny(q, ["upload", "training photo", "what should i upload", "photos"])) {
    return reply(
      "Upload clean training photos with good lighting and clear face visibility. Include front, left, right, full-body, and waist-up angles. Avoid hats, phones, heavy filters, and other people in frame.",
      [
        { label: "Upload training photos", href: "/training/photos" },
        { label: "Onboarding intake", href: "/onboarding/intake" },
      ]
    );
  }

  if (hasAny(q, ["where do i get my content", "where is my content", "delivery", "delivered", "library"])) {
    return reply(
      "Completed content is delivered to your account library as generation jobs finish. You can track request status and open final assets there.",
      [
        { label: "Open library", href: "/library" },
        { label: "View requests", href: "/requests" },
        { label: "Dashboard", href: "/dashboard" },
      ]
    );
  }

  if (hasAny(q, ["upgrade", "change plan"])) {
    return reply(
      "Upgrades start immediately. If you upgrade mid-cycle, we apply credit for the unused portion of your current plan.",
      [
        { label: "Upgrade plan", href: "/upgrade" },
        { label: "Billing", href: "/billing" },
      ]
    );
  }

  if (hasAny(q, ["billing", "invoice", "payment"])) {
    return reply(
      "Billing settings let you review plan status, invoices, and payment details. You can also change plans any time.",
      [
        { label: "Open billing", href: "/billing" },
        { label: "Upgrade plan", href: "/upgrade" },
      ]
    );
  }

  if (hasAny(q, ["steal my content", "do you steal", "ownership", "who owns"])) {
    return reply(
      "No. Your uploaded assets and generated results are associated with your account and used to operate your OnlyTwins workspace. You keep ownership of your uploaded content and receive generated outputs through your private workflow.",
      [
        { label: "Account", href: "/me" },
        { label: "Library", href: "/library" },
        { label: "Billing", href: "/billing" },
      ]
    );
  }

  if (hasAny(q, ["private", "privacy", "secure"])) {
    return reply(
      "Your workspace content is stored privately and tied to your account flow. Access is controlled through your authenticated account routes.",
      [
        { label: "Privacy", href: "/privacy" },
        { label: "Library", href: "/library" },
      ]
    );
  }

  if (hasAny(q, ["agency", "agencies", "team"])) {
    return reply(
      "Yes. Agencies and teams can use OnlyTwins, especially on higher-volume plans designed for recurring output and multi-campaign delivery.",
      [
        { label: "Pricing", href: "/pricing" },
        { label: "Upgrade", href: "/upgrade" },
        { label: "Contact", href: "/contact" },
      ]
    );
  }

  if (hasAny(q, ["what kinds of content", "what can you create", "types of content"])) {
    return reply(
      "OnlyTwins can create recurring photo/video batches across multiple themes, styles, and campaign directions based on your saved request mix and training data.",
      [
        { label: "Gallery", href: "/gallery" },
        { label: "Results", href: "/results" },
        { label: "Requests", href: "/requests" },
      ]
    );
  }

  if (hasAny(q, ["request", "status"])) {
    return reply(
      "You can manage recurring request mix and track request status from the requests page.",
      [
        { label: "View requests", href: "/requests" },
        { label: "Dashboard", href: "/dashboard" },
      ]
    );
  }

  if (hasAny(q, ["onboarding", "setup"])) {
    return reply(
      "Start with onboarding intake, then upload training photos, then set your recurring monthly request mix.",
      [
        { label: "Onboarding intake", href: "/onboarding/intake" },
        { label: "Training photos", href: "/training/photos" },
        { label: "Requests", href: "/requests" },
      ]
    );
  }

  return reply(
    "I can help with plans, onboarding, training photos, recurring requests, billing, privacy, and delivery. Ask me a specific question and I’ll give a direct answer with the right next step.",
    [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Requests", href: "/requests" },
      { label: "Billing", href: "/billing" },
      { label: "Upgrade", href: "/upgrade" },
      { label: `WhatsApp: ${WHATSAPP_NUMBER_DISPLAY}`, href: WHATSAPP_LINK },
    ]
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const result = buildReply(message);
  return NextResponse.json(result, { status: 200 });
}
