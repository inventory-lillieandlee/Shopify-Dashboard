import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerComponentClient } from "@/lib/supabase/server";
import type { MonthlySale } from "@/lib/sales";

/**
 * Seam reader for the sales popup. Returns monthly_sales grouped by product_id
 * (uuid), ascending by month — a serializable Record so it passes straight from the
 * server page into the client table/popup without a client fetch. Read-only, anon-RLS
 * (monthly_sales has an anon SELECT policy), mirroring getInventoryRows().
 */
export async function getMonthlySales(): Promise<Record<string, MonthlySale[]>> {
  return getMonthlySalesWith(await createServerComponentClient());
}

export async function getMonthlySalesWith(
  client: SupabaseClient,
): Promise<Record<string, MonthlySale[]>> {
  const { data, error } = await client
    .from("monthly_sales")
    .select("product_id, month, units_sold")
    .order("month", { ascending: true });
  if (error) throw new Error(`monthly_sales: ${error.message}`);

  const out: Record<string, MonthlySale[]> = {};
  for (const r of (data ?? []) as { product_id: string; month: string; units_sold: number }[]) {
    (out[r.product_id] ??= []).push({ month: String(r.month).slice(0, 7), units: Number(r.units_sold) });
  }
  return out;
}

/**
 * When the CURRENT-month sales rows were last synced — the newest
 * monthly_sales.updated_at for `${currentMonth}-01`. The demand-sync cron stamps every
 * current-month row each run, so this is the chart's true freshness. DELIBERATELY not
 * the inventory snapshot_at (that field is always fresh on its own cron and is exactly
 * what made a stale chart look trustworthy). Null when no current-month row exists yet.
 */
export async function getCurrentMonthSalesUpdatedAt(currentMonth: string): Promise<string | null> {
  return getCurrentMonthSalesUpdatedAtWith(await createServerComponentClient(), currentMonth);
}

export async function getCurrentMonthSalesUpdatedAtWith(
  client: SupabaseClient,
  currentMonth: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("monthly_sales")
    .select("updated_at")
    .eq("month", `${currentMonth}-01`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`monthly_sales freshness: ${error.message}`);
  return (data?.[0] as { updated_at: string } | undefined)?.updated_at ?? null;
}
