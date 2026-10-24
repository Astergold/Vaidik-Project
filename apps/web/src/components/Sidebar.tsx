import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  House,
  type LucideIcon,
  Megaphone,
  PhoneCall,
  Settings,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session";
import { navFor, type Area } from "@/lib/sitemap";

const AREA_ICONS: Record<Area, LucideIcon> = {
  Auth: Users,
  Home: House,
  Leads: Users,
  Calls: PhoneCall,
  Campaigns: Megaphone,
  "Visits & calendar": CalendarDays,
  Applications: FileText,
  AI: Bot,
  Programs: GraduationCap,
  Reports: BarChart3,
  Settings: Settings,
  Platform: Building2,
  System: Bell,
};

export function Sidebar() {
  const { session } = useSession();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <BrandMark />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {session.status === "loading" ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          navFor(session.viewerRole).map((group) => {
            const Icon = AREA_ICONS[group.area];
            return (
              <div key={group.area} className="mb-4">
                <p className="flex items-center gap-2 px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Icon className="size-3.5" aria-hidden />
                  {group.area}
                </p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        activeOptions={{ exact: true, includeSearch: false }}
                        className="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeProps={{
                          className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        }}
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </nav>
      {session.status === "ready" && (
        <div className="shrink-0 truncate border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground">
          {session.viewerRole === "super_admin" ? "Platform" : session.me.tenant.name}
        </div>
      )}
    </div>
  );
}
