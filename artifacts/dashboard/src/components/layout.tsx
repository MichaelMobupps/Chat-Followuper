import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Activity,
  Settings,
  MessageCircle,
  Users,
  Sparkles,
  Search,
  Shield,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { getAdminWhoami } from "@/lib/api/user-extras";
import { useCurrentUser } from "@/hooks/use-current-user";

type NavItem = {
  label: string;
  href: string;
  icon: typeof CalendarClock;
};

const PRIMARY_NAV: NavItem[] = [
  { label: "Today", href: "/", icon: CalendarClock },
  { label: "Contacts", href: "/contacts", icon: Sparkles },
  { label: "Follow-ups", href: "/followup/whatsapp", icon: MessageCircle },
];

const SECONDARY_NAV: NavItem[] = [
  { label: "Apollo seeder", href: "/seeder", icon: Search },
  { label: "All prospects", href: "/prospects", icon: Users },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Accounts", href: "/accounts", icon: Settings },
];

function isActive(currentPath: string, href: string, label?: string): boolean {
  if (href === "/") {
    return currentPath === "/" || currentPath === "";
  }
  if (label === "Follow-ups") {
    return currentPath.startsWith("/followup/");
  }
  return currentPath === href || currentPath.startsWith(href + "/");
}

export function Layout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const logout = useLogout();
  const admin = useQuery({
    queryKey: ["admin-whoami"],
    queryFn: getAdminWhoami,
    staleTime: 5 * 60_000,
  });

  // FE8: previously there was no way to sign out and the signed-in identity was
  // never shown. Wire the generated logout mutation; clear the query cache and
  // route to /login regardless of outcome (the intent is to leave — AuthGate
  // re-verifies from there).
  function handleSignOut() {
    logout.mutate(undefined, {
      onSettled: () => {
        queryClient.clear();
        navigate("/login", { replace: true });
      },
    });
  }
  const account = currentUser.status === "authenticated" ? currentUser.user : null;

  const secondaryNav = admin.data?.isAdmin
    ? [
        ...SECONDARY_NAV,
        { label: "Ops", href: "/admin/ops", icon: Shield },
      ]
    : SECONDARY_NAV;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <div className="text-sm font-semibold tracking-tight">
            Chat Followuper
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">MobUpps</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-6">
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(location, item.href, item.label);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover-elevate",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div>
            <div className="px-3 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              More
            </div>
            <ul className="space-y-1">
              {secondaryNav.map((item) => {
                const active = isActive(location, item.href, item.label);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover-elevate",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
        <div className="border-t border-sidebar-border px-3 py-3 space-y-1">
          {account ? (
            <div className="px-3 py-1" data-testid="account-identity">
              <div className="text-xs font-medium truncate">
                {account.name ?? account.email}
              </div>
              {account.name ? (
                <div className="text-[11px] text-muted-foreground truncate">
                  {account.email}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={logout.isPending}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover-elevate transition-colors disabled:opacity-60"
            data-testid="nav-sign-out"
          >
            <LogOut className="h-4 w-4" />
            <span>{logout.isPending ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export default Layout;
