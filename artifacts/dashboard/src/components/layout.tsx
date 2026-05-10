import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Activity,
  Settings,
  MessageCircle,
  Send,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: typeof CalendarClock;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/", icon: CalendarClock },
  { label: "Prospect: WhatsApp", href: "/prospect/whatsapp", icon: MessageCircle },
  { label: "Prospect: Telegram", href: "/prospect/telegram", icon: Send },
  { label: "Follow-up: WhatsApp", href: "/followup/whatsapp", icon: MessageCircle },
  { label: "Follow-up: Telegram", href: "/followup/telegram", icon: Send },
  { label: "Prospects", href: "/prospects", icon: Users },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Accounts", href: "/accounts", icon: Settings },
];

function isActive(currentPath: string, href: string): boolean {
  if (href === "/") {
    return currentPath === "/" || currentPath === "";
  }
  return currentPath === href || currentPath.startsWith(href + "/");
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <div className="text-sm font-semibold tracking-tight">
            Chat Followuper
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">MobUpps</div>
        </div>
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(location, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`nav-${item.label.toLowerCase()}`}
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
        </nav>
        <div className="px-6 py-4 text-xs text-muted-foreground border-t border-sidebar-border">
          Phase 1 · WhatsApp
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export default Layout;
