import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Building2, Menu, Search } from "lucide-react";
import { CommandPalette } from "@/components/CommandPalette";
import { HelpDrawer } from "@/components/HelpDrawer";
import { isPaletteShortcut } from "@/components/palette";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUnreadCount } from "@/features/notifications/notifications-api";
import { useSession } from "@/lib/session";
import { ROLE_LABELS, VIEWER_ROLES } from "@/lib/sitemap";

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { session, setDevRole, signOut } = useSession();
  const ready = session.status === "ready" ? session : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: unread } = useUnreadCount(ready !== null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return;
      e.preventDefault();
      setPaletteOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-card px-2 md:gap-3 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        className="hidden h-9 max-w-sm flex-1 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground hover:bg-accent md:flex"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Search leads, phones, pages…</span>
        <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">Ctrl K</kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search"
      >
        <Search />
      </Button>
      {ready && (
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} role={ready.viewerRole} />
      )}

      <div className="ml-auto flex min-w-0 items-center gap-1 md:gap-2">
        {ready?.viewerRole === "super_admin" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Switch tenant">
                <Building2 />
                <span className="hidden max-w-32 truncate sm:inline">All tenants</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Tenants</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/platform/tenants">Impersonate from the tenants list</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {ready?.source === "dev" && (
          <label
            className="flex items-center gap-1.5 text-xs"
            title={`Dev session: ${ready.devReason ?? ""}`}
          >
            <span className="hidden rounded bg-warning px-1.5 py-0.5 font-semibold text-warning-foreground sm:inline">
              DEV
            </span>
            <span className="sr-only">Dev role</span>
            <select
              value={ready.viewerRole}
              onChange={(e) => {
                const role = VIEWER_ROLES.find((r) => r === e.target.value);
                if (role) setDevRole(role);
              }}
              className="h-8 max-w-32 rounded-md border bg-card px-1.5 text-sm"
            >
              {VIEWER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}

        <HelpDrawer />
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative"
        >
          <Link to="/notifications">
            <Bell />
            {unread ? (
              <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="User menu" className="rounded-full">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {ready ? ready.me.user.name.charAt(0).toUpperCase() : "·"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {ready && (
              <DropdownMenuLabel className="font-normal">
                <p className="truncate font-medium">{ready.me.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{ready.me.user.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[ready.viewerRole]}
                </p>
              </DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/notifications">Notifications</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={ready?.source !== "api"} onSelect={() => void signOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
