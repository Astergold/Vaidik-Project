import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { meResponse, type MeResponse } from "@vernacular/contracts";
import { apiGet, ApiCallError } from "@/lib/api";
import { signOut as signOutRequest } from "@/lib/auth";
import { VIEWER_ROLES, type ViewerRole } from "@/lib/sitemap";

/**
 * Who is looking at the UI. Real session = `GET /api/me`. In stub mode (dev server only) a failed
 * /api/me falls back to a dev session whose role can be switched in the top bar, so every role-filtered state can be
 * tested before auth pages exist. The role only shapes the UI; the API enforces every permission.
 */
// DEV is a build-time constant: a production build compiles the dev session out, whatever env is set.
// VITE_STUB_SESSION=false turns it off in dev too (to try the /login redirect).
export const STUB_SESSION = import.meta.env.DEV && import.meta.env.VITE_STUB_SESSION !== "false";
const DEV_ROLE_KEY = "vernacular.devRole";

export type Session =
  | { status: "loading" }
  | {
      status: "ready";
      source: "api" | "dev";
      me: MeResponse;
      viewerRole: ViewerRole;
      devReason?: string;
    };

export interface SessionValue {
  session: Session;
  setDevRole: (role: ViewerRole) => void;
  signOut: () => Promise<void>;
}

/** Exported for tests (StaticSession in src/test/utils.tsx); app code uses SessionProvider. */
export const SessionContext = createContext<SessionValue>({
  session: { status: "loading" },
  setDevRole: () => {},
  signOut: async () => {},
});

const isViewerRole = (v: unknown): v is ViewerRole => VIEWER_ROLES.some((r) => r === v);

/** Only reachable behind `STUB_SESSION`, so production bundles drop it (and its strings) entirely. */
function devSession(role: ViewerRole, error: unknown): Session {
  const reason =
    error instanceof ApiCallError ? `/api/me returned ${error.status}` : "/api/me unreachable";
  return { status: "ready", source: "dev", me: devMe(role), viewerRole: role, devReason: reason };
}

function devMe(role: ViewerRole): MeResponse {
  return {
    user: {
      id: "00000000-0000-7000-8000-000000000001",
      name: `Dev ${role.replace("_", " ")}`,
      email: `${role}@dev.local`,
    },
    tenant: {
      id: "00000000-0000-7000-8000-000000000002",
      name: "Demo Institute",
      slug: "demo",
      timezone: "Asia/Kolkata",
      status: "active",
    },
    role: role === "super_admin" ? "owner" : role,
    isPlatformAdmin: role === "super_admin",
    impersonatedBy: null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet("/api/me", meResponse),
    retry: false,
    // 401 is handled here (dev session or /login). 5xx/offline go to the global toast: a down API is
    // not a signed-out user.
    meta: { handles: [401] },
  });
  const href = useRouterState({ select: (s) => s.location.href });
  const [devRole, setDevRoleState] = useState<ViewerRole>("admin");

  useEffect(() => {
    if (!STUB_SESSION) return;
    try {
      const saved = window.localStorage.getItem(DEV_ROLE_KEY);
      if (isViewerRole(saved)) setDevRoleState(saved);
    } catch {
      // storage blocked: keep the default role
    }
  }, []);

  useEffect(() => {
    const signedOut = me.error instanceof ApiCallError && me.error.status === 401;
    if (signedOut && !STUB_SESSION) void navigate({ to: "/login", search: { redirect: href } });
  }, [me.error, navigate, href]);

  const setDevRole = useCallback((role: ViewerRole) => {
    if (!STUB_SESSION) return;
    setDevRoleState(role);
    try {
      window.localStorage.setItem(DEV_ROLE_KEY, role);
    } catch {
      // storage blocked: role still applies for this page view
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest().catch(() => undefined);
    queryClient.clear();
    await navigate({ to: "/login" });
  }, [navigate, queryClient]);

  const session = useMemo<Session>(() => {
    if (me.isSuccess)
      return { status: "ready", source: "api", me: me.data, viewerRole: me.data.role };
    if (STUB_SESSION && me.isError) return devSession(devRole, me.error);
    return { status: "loading" };
  }, [me.isSuccess, me.isError, me.data, me.error, devRole]);

  const value = useMemo(() => ({ session, setDevRole, signOut }), [session, setDevRole, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Dates in the UI use the tenant's timezone (not the viewer's browser). */
export function useTenantTimeZone(): string {
  const { session } = useSession();
  return session.status === "ready" ? session.me.tenant.timezone : "Asia/Kolkata";
}
