import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SettingsEditor } from "@/components/settings-editor";
import { AlertRecipientsPanel } from "@/components/alert-recipients-panel";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-brand text-brand"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.tab === "string" ? sp.tab : "settings";
  const tab = raw === "alerts" ? "alerts" : "settings";

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <SiteHeader />

        <div className="flex items-center justify-between border-b border-border px-1">
          <nav className="flex gap-1">
            <TabLink href="/settings?tab=settings" active={tab === "settings"}>
              Settings
            </TabLink>
            <TabLink href="/settings?tab=alerts" active={tab === "alerts"}>
              Alerts
            </TabLink>
          </nav>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
        </div>

        {tab === "settings" ? <SettingsEditor /> : <AlertRecipientsPanel />}

        <footer className="pt-2 text-center text-xs text-muted-foreground">
          Lillie &amp; Lee · Settings · Shopify location on-hand · excludes 3PL warehouse
        </footer>
      </main>
    </div>
  );
}
