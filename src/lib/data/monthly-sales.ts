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
