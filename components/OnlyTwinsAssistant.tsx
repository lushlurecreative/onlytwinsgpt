"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const QUICK_ACTIONS: Array<{ label: string; answer: string }> = [
  {
    label: "How do I upload training photos?",
    answer:
      "Open Training Photos from your dashboard, upload at least 10 clear source images, then save. We recommend front, left, right, full-body, and waist-up angles.",
  },
  {
    label: "How do recurring requests work?",
    answer:
      "Your saved monthly request mix repeats each cycle unless you update it at least 5 days before renewal. You can update anytime on the Requests page.",
  },
  {
    label: "How do I change my plan?",
    answer:
      "Open Upgrade Plan, choose the target plan, review the due-today summary, and confirm. Your new allowance starts immediately.",
  },
  {
    label: "Where will I receive my content?",
    answer:
      "Delivered content appears in your Content Library as requests complete. You can open files there and monitor progress from Requests.",
  },
  {
    label: "What should I upload?",
    answer:
      "Upload clean, well-lit photos with your face visible. Include varied angles and outfits. Avoid heavy filters, hats, phones, and other people in frame.",
  },
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

  const pushAssistant = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `assistant-${crypto.randomUUID()}`, role: "assistant", text },
    ]);
  };

  const onSend = () => {
    const clean = input.trim();
    if (!clean) return;
    setMessages((prev) => [...prev, { id: `user-${crypto.randomUUID()}`, role: "user", text: clean }]);
    setInput("");
    pushAssistant("Thanks. A full assistant backend can be connected here next. For now, use the quick actions for instant help.");
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
                  onClick={() => pushAssistant(action.answer)}
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
