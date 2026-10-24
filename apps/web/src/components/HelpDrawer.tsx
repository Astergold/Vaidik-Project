import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CircleHelp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { HELP, pageForPath } from "@/lib/help";
import { PAGES } from "@/lib/sitemap";

/** Top-bar "?" (D7-I4-03): short tips for the page you're on, from lib/help.ts. No route of its own. */
export function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const id = pageForPath(pathname);
  const tips = id ? HELP[id] : [];
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Help for this page"
        onClick={() => setOpen(true)}
      >
        <CircleHelp />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-sm">
          <SheetTitle>{id ? PAGES[id].title : "Help"}</SheetTitle>
          <SheetDescription className="mb-4">Tips for this page</SheetDescription>
          {tips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tips for this page yet.</p>
          ) : (
            <ul className="space-y-3" aria-label="Tips">
              {tips.map((t) => (
                <li key={t} className="flex gap-2 text-sm">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 space-y-1 border-t pt-4 text-sm text-muted-foreground">
            <p>
              Press <kbd className="rounded border bg-muted px-1 font-mono text-xs">Ctrl K</kbd>{" "}
              anywhere to find a student or jump to a page.
            </p>
            <p>Your admin has the full user guide.</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
