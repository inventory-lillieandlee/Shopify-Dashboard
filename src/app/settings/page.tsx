import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getInventoryRows } from "@/lib/data/inventory";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import { DemoBanner } from "@/components/demo-banner";
import { SiteHeader } from "@/components/site-header";
import { SettingsConfigCard } from "@/components/settings-config-card";
import { SettingsTable } from "@/components/settings-table";
import { TeamPanel } from "@/components/team-panel";

// Live (read-only) from Supabase via the same anon seam as the dashboard.
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
  const tab = (typeof sp.tab === "string" ? sp.tab : "") === "team" ? "team" : "settings";

  const rows = await getInventoryRows();

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <SiteHeader />

        <div className="flex items-center justify-between border-b border-border px-1">
          <nav className="flex gap-1">
            <TabLink href="/settings?tab=settings" active={tab === "settings"}>
              Settings
            </TabLink>
            <TabLink href="/settings?tab=team" active={tab === "team"}>
              Team
            </TabLink>
          </nav>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
        </div>

        {tab === "settings" ? (
          <div className="animate-in space-y-6 duration-500 fade-in slide-in-from-bottom-2">
            <SettingsConfigCard />
            <section className="space-y-3">
              <div className="px-1">
                <h2 className="font-display text-lg font-semibold text-brand">
                  Per-SKU configuration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Read-only · {rows.length} active SKUs · thresholds derived from lead time + safety stock
                </p>
              </div>
              <div className={cn(surfacePanel, "overflow-hidden")}>
                <SettingsTable rows={rows} />
              </div>
            </section>
          </div>
        ) : (
          <TeamPanel />
        )}

        <footer className="pt-2 text-center text-xs text-muted-foreground">
          Lillie &amp; Lee · Settings (read-only) · reading live from Supabase (demo data)
        </footer>
      </main>
    </div>
  );
}
