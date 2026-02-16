type BrandNameProps = {
  className?: string;
};

export default function BrandName({ className }: BrandNameProps) {
  return (
    <span className={className ?? ""}>
      <span className="brand-only">Only</span>
      <span className="brand-twins">Twins</span>
    </span>
  );
}

