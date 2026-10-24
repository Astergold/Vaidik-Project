import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SessionProvider } from "@/lib/session";

/** Sidebar + top bar around every signed-in page. Below 768 px the sidebar becomes a drawer. */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <SessionProvider>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:block">
          <Sidebar />
        </aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 gap-0 p-0 md:hidden">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Pages available to your role</SheetDescription>
            <Sidebar />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <ImpersonationBanner />
          <Topbar onOpenNav={() => setNavOpen(true)} />
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
