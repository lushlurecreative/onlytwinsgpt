import type { HTMLAttributes, ReactNode } from "react";

type PremiumCardProps = HTMLAttributes<HTMLElement> & {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
};

export default function PremiumCard({
  title,
  subtitle,
  action,
  className = "",
  children,
  ...props
}: PremiumCardProps) {
  return (
    <article className={`premium-card ${className}`.trim()} {...props}>
      {(title || subtitle || action) && (
        <header className="premium-card-head">
          <div>
            {title ? <h3 className="premium-card-title">{title}</h3> : null}
            {subtitle ? <p className="premium-card-subtitle">{subtitle}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </header>
      )}
      {children}
    </article>
  );
}
