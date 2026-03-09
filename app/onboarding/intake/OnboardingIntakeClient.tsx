"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

type ExtraField = {
  id: string;
  label: string;
  value: string;
};

export default function OnboardingIntakeClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [realBio, setRealBio] = useState("");
  const [desiredBio, setDesiredBio] = useState("");
  const [rules, setRules] = useState("");
  const [extras, setExtras] = useState<ExtraField[]>([]);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addExtra = () => {
    setExtras((prev) => [...prev, { id: crypto.randomUUID(), label: "", value: "" }]);
  };

  const updateExtra = (id: string, field: "label" | "value", next: string) => {
    setExtras((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: next } : item)));
  };

  const removeExtra = (id: string) => {
    setExtras((prev) => prev.filter((item) => item.id !== id));
  };

  const onSave = () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Name is required.";
    if (!age.trim()) nextErrors.age = "Age is required.";
    if (!/^\d{2,3}$/.test(age.trim()) || Number(age) < 18) {
      nextErrors.age = "Age must be a valid number and 18+.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
      nextErrors.email = "Valid email is required.";
    }
    if (!whatsapp.trim()) nextErrors.whatsapp = "WhatsApp contact is required.";
    if (!realBio.trim()) nextErrors.realBio = "Real life bio is required.";
    if (!desiredBio.trim()) nextErrors.desiredBio = "Desired bio is required.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    const payload = {
      name,
      age,
      email: email.trim().toLowerCase(),
      whatsapp,
      realBio,
      desiredBio,
      rules,
      extras,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem("ot_onboarding_intake_v1", JSON.stringify(payload));
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      router.push("/training/photos");
    }, 600);
  };

  return (
    <section style={{ marginTop: 16, display: "grid", gap: 14 }}>
      <PremiumCard>
        <h2 style={{ marginTop: 0 }}>Required intake fields</h2>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          All fields below are required before moving to the next step.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <label>
            Name *
            <input value={name} onChange={(event) => setName(event.target.value)} style={{ width: "100%" }} />
            {errors.name ? <small style={{ color: "var(--danger)" }}>{errors.name}</small> : null}
          </label>
          <label>
            Age *
            <input value={age} onChange={(event) => setAge(event.target.value)} style={{ width: "100%" }} />
            {errors.age ? <small style={{ color: "var(--danger)" }}>{errors.age}</small> : null}
          </label>
          <label>
            Email *
            <input value={email} onChange={(event) => setEmail(event.target.value)} style={{ width: "100%" }} />
            {errors.email ? <small style={{ color: "var(--danger)" }}>{errors.email}</small> : null}
          </label>
          <label>
            WhatsApp (for receiving content links) *
            <input
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              style={{ width: "100%" }}
            />
            {errors.whatsapp ? <small style={{ color: "var(--danger)" }}>{errors.whatsapp}</small> : null}
          </label>
        </div>
      </PremiumCard>

      <PremiumCard>
        <h2 style={{ marginTop: 0 }}>Bio + direction</h2>
        <label style={{ display: "grid", gap: 6 }}>
          Real life bio * (example: creator from Miami, fitness + lifestyle focus, tattoo on right arm)
          <textarea
            value={realBio}
            onChange={(event) => setRealBio(event.target.value)}
            rows={5}
            style={{ width: "100%" }}
          />
          {errors.realBio ? <small style={{ color: "var(--danger)" }}>{errors.realBio}</small> : null}
        </label>
        <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
          Desired bio * (example: future content should be blonde, same arm tattoo as original training photos)
          <textarea
            value={desiredBio}
            onChange={(event) => setDesiredBio(event.target.value)}
            rows={5}
            style={{ width: "100%" }}
          />
          {errors.desiredBio ? <small style={{ color: "var(--danger)" }}>{errors.desiredBio}</small> : null}
        </label>
      </PremiumCard>

      <PremiumCard>
        <h2 style={{ marginTop: 0 }}>No-limit custom instructions</h2>
        <p style={{ opacity: 0.8 }}>
          Type any constraints, details, styling instructions, do-not-do rules, or campaign notes. This box is
          open text and supports fully custom instructions.
        </p>
        <textarea
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          rows={6}
          style={{ width: "100%" }}
        />
      </PremiumCard>

      <PremiumCard>
        <h2 style={{ marginTop: 0 }}>Additional fields</h2>
        <p style={{ opacity: 0.8 }}>
          Add any extra intake field your workflow needs. Examples: preferred posting timezone, watermark
          preference, banned words, makeup style defaults, campaign deadline, or platform-specific rules.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {extras.map((item) => (
            <div
              key={item.id}
              style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 2fr auto", alignItems: "center" }}
            >
              <input
                placeholder="Field name"
                value={item.label}
                onChange={(event) => updateExtra(item.id, "label", event.target.value)}
              />
              <input
                placeholder="Field value"
                value={item.value}
                onChange={(event) => updateExtra(item.id, "value", event.target.value)}
              />
              <button type="button" onClick={() => removeExtra(item.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={addExtra}>
            Add Field
          </button>
        </div>
      </PremiumCard>

      <PremiumCard>
        <h2 style={{ marginTop: 0 }}>Save intake and continue</h2>
        <p style={{ opacity: 0.8 }}>
          Save your required intake details, then continue to upload training photos.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <PremiumButton type="button" onClick={onSave}>
            Save Intake
          </PremiumButton>
          {saved ? <span style={{ color: "var(--success)" }}>Saved. Redirecting…</span> : null}
        </div>
      </PremiumCard>
    </section>
  );
}
