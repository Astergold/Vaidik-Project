import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Empty / error / not-allowed state for a page section. */
export function StateCard({
  icon: Icon,
  title,
  tone,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: "error";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={cn(tone === "error" && "border-destructive/40")}>
      <CardContent className="flex flex-col items-center px-6 py-10 text-center">
        <Icon
          className={cn(
            "mb-3 size-8",
            tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}
