"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  links?: Array<{ label: string; href: string }>;
};

const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: "How do I upload training photos?", prompt: "How do I upload training photos?" },
  { label: "How do recurring requests work?", prompt: "How do recurring requests work?" },
  { label: "How do I change my plan?", prompt: "How do I change my plan?" },
  { label: "Where will I receive my content?", prompt: "Where will I receive my content?" },
  { label: "What should I upload?", prompt: "What should I upload?" },
];

function shouldShowOnRoute(pathname: string) {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/requests")) return true;
  if (pathname.startsWith("/billing")) return true;
  if (pathname.startsWith("/upgrade")) return true;
  if (pathname.startsWith("/onboarding")) return true;
  if (pathname.startsWith("/training/photos")) return true;
  return false;
}

export default function OnlyTwinsAssistant() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: "I can help with setup, uploads, billing, and recurring monthly requests.",
      links: [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Requests", href: "/requests" },
      ],
    },
  ]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setIsAuthed(!!data.user);
      setCheckedAuth(true);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  if (!checkedAuth || !isAuthed || !shouldShowOnRoute(pathname)) {
    return null;
  }

  const pushAssistant = (text: string, links?: Array<{ label: string; href: string }>) => {
    setMessages((prev) => [
      ...prev,
      { id: `assistant-${crypto.randomUUID()}`, role: "assistant", text, links },
    ]);
  };

  const askAssistant = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean) return;
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: clean }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      answer?: string;
      links?: Array<{ label: string; href: string }>;
      error?: string;
    };
    if (!response.ok) {
      pushAssistant("I couldn’t process that right now. Please try again.", [
        { label: "Dashboard", href: "/dashboard" },
      ]);
      return;
    }
    pushAssistant(result.answer ?? "I can help with plans, setup, and requests.", result.links ?? []);
  };

  const onSend = () => {
    const clean = input.trim();
    if (!clean) return;
    setMessages((prev) => [...prev, { id: `user-${crypto.randomUUID()}`, role: "user", text: clean }]);
    setInput("");
    void askAssistant(clean);
  };

  return (
    <>
      <button type="button" className="assistant-launcher" onClick={() => setOpen(true)}>
        Ask OnlyTwins
      </button>
      {open ? (
        <div className="assistant-panel-wrap" role="dialog" aria-modal="true" aria-label="OnlyTwins assistant">
          <div className="assistant-panel">
            <header className="assistant-header">
              <div>
                <h3>OnlyTwins Assistant</h3>
                <p>Get help with setup, uploads, billing, and monthly requests.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="assistant-close">
                Close
              </button>
            </header>

            <div className="assistant-quick-actions">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setMessages((prev) => [...prev, { id: `user-${crypto.randomUUID()}`, role: "user", text: action.prompt }]);
                    void askAssistant(action.prompt);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>

            <div className="assistant-messages">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`assistant-message ${message.role === "assistant" ? "assistant-message-ai" : "assistant-message-user"}`}
                >
                  {message.text}
                  {message.links && message.links.length > 0 ? (
                    <div className="assistant-link-row">
                      {message.links.map((link) => (
                        <Link key={`${message.id}-${link.href}-${link.label}`} href={link.href} className="assistant-link-chip">
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="assistant-input-row">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask a question..."
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSend();
                }}
              />
              <button type="button" onClick={onSend}>
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
