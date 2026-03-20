"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function ReferralCapture() {
  const params = useSearchParams();

  useEffect(() => {
    const ref = params.get("ref");
    if (ref && typeof window !== "undefined") {
      localStorage.setItem("ref_code", ref);
    }
  }, [params]);

  return null;
}
