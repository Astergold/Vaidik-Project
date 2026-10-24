import { Toast } from "radix-ui";
import { XIcon } from "lucide-react";
import { dismissToast, useToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Renders the global toast store (D2-I4-01). Mounted once in __root, so auth pages get it too. */
export function Toaster() {
  const toasts = useToasts();
  return (
    <Toast.Provider swipeDirection="right" duration={6000}>
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) dismissToast(t.id);
          }}
          className={cn(
            "relative grid gap-1 rounded-lg border bg-card p-4 pr-9 text-card-foreground shadow-lg",
            t.tone === "error" && "border-destructive/40",
          )}
        >
          <Toast.Title
            className={cn("text-sm font-semibold", t.tone === "error" && "text-destructive")}
          >
            {t.title}
          </Toast.Title>
          {t.description && (
            <Toast.Description className="text-sm text-muted-foreground">
              {t.description}
            </Toast.Description>
          )}
          <Toast.Close
            aria-label="Dismiss"
            className="absolute top-3 right-3 rounded-sm text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed right-0 bottom-0 z-[100] flex w-full flex-col gap-2 p-4 outline-none sm:max-w-sm" />
    </Toast.Provider>
  );
}
