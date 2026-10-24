import { useBranding } from "@/lib/branding";
import { cn } from "@/lib/utils";

/** Tenant logo + product name. Without a logo, the first letter on the brand colour. */
export function BrandMark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const { productName, logoUrl } = useBranding();
  const box = size === "lg" ? "size-10 text-lg" : "size-8 text-sm";
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className={cn(box, "shrink-0 rounded-md object-contain")} />
      ) : (
        <span
          aria-hidden
          className={cn(
            box,
            "grid shrink-0 place-items-center rounded-md bg-primary font-semibold text-primary-foreground",
          )}
        >
          {productName.charAt(0)}
        </span>
      )}
      <span className={cn("truncate font-semibold", size === "lg" ? "text-xl" : "text-base")}>
        {productName}
      </span>
    </div>
  );
}
