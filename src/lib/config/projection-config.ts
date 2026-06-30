// Projection settings sourced from the DB (admin-editable). The pure builder is
// shared by the cron route (loadProjectionSettings) and the CLI recompute script,
// so they can never drift. Falls back to engine defaults when rows are absent.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CONFIG, type ProjectionConfig, type Thresholds } from "../projections/engine.ts";

const num = (v: unknown): number => (v === null || v === undefined ? NaN : Number(v));

export interface AppConfigRow {
  growth_pct: number | string | null;
  spike_threshold_pct: number | string | null;
}
export interface CategoryThresholdRow {
  category: string;
  yellow_days: number | string;
  red_days: number | string;
  critical_days: number | string;
  yellow_enabled?: boolean;
  red_enabled?: boolean;
  critical_enabled?: boolean;
}

/** Per-tier email-alert switches for a category (dashboard classification is unaffected). */
export interface TierEnabled {
  yellow: boolean;
  red: boolean;
  critical: boolean;
}

export interface ProjectionSettings {
  config: ProjectionConfig;
  /** category → explicit DSR day cutoffs; pass to computeProjection as the override. */
  thresholdsByCategory: Map<string, Thresholds>;
  /** category → which tiers email (the cron suppresses muted ones). */
  alertEnabledByCategory: Map<string, TierEnabled>;
}

/** Pure: build settings from raw rows (defaults when missing/blank). */
export function buildProjectionSettings(
  app: AppConfigRow | null,
  cats: CategoryThresholdRow[],
): ProjectionSettings {
  const growthPct = app ? num(app.growth_pct) : NaN;
  const spikePct = app ? num(app.spike_threshold_pct) : NaN;
  const config: ProjectionConfig = {
    ...DEFAULT_CONFIG,
    growth: Number.isFinite(growthPct) ? 1 + growthPct / 100 : DEFAULT_CONFIG.growth,
    spikeAlertPct: Number.isFinite(spikePct) ? spikePct : DEFAULT_CONFIG.spikeAlertPct,
  };
  const thresholdsByCategory = new Map<string, Thresholds>();
  const alertEnabledByCategory = new Map<string, TierEnabled>();
  for (const c of cats) {
    thresholdsByCategory.set(c.category, {
      critical: num(c.critical_days),
      red: num(c.red_days),
      yellow: num(c.yellow_days),
    });
    alertEnabledByCategory.set(c.category, {
      yellow: c.yellow_enabled ?? true,
      red: c.red_enabled ?? true,
      critical: c.critical_enabled ?? true,
    });
  }
  return { config, thresholdsByCategory, alertEnabledByCategory };
}

/** Read app_config + category_thresholds via any Supabase client. Defaults on error. */
export async function loadProjectionSettings(client: SupabaseClient): Promise<ProjectionSettings> {
  const [app, cats] = await Promise.all([
    client.from("app_config").select("growth_pct, spike_threshold_pct").limit(1).maybeSingle(),
    client
      .from("category_thresholds")
      .select("category, yellow_days, red_days, critical_days, yellow_enabled, red_enabled, critical_enabled"),
  ]);
  return buildProjectionSettings(
    (app.data as AppConfigRow | null) ?? null,
    (cats.data as CategoryThresholdRow[] | null) ?? [],
  );
}
