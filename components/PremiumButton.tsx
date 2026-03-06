import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type PremiumButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  href?: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export default function PremiumButton({
  children,
  href,
  loading = false,
  variant = "primary",
  className = "",
  ...props
}: PremiumButtonProps) {
  const cls = `btn btn-${variant} ${loading ? "is-loading" : ""} ${className}`.trim();
  if (href) {
    return (
      <Link href={href} className={cls}>
        {loading ? "Working..." : children}
      </Link>
    );
  }
  return (
    <button {...props} className={cls} disabled={loading || props.disabled}>
      {loading ? "Working..." : children}
    </button>
  );
}
