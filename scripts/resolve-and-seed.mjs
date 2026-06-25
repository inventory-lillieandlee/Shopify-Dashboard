// scripts/resolve-and-seed.mjs
//
// Resolve the 19 core SKUs (roadmap §1.2) against the Shopify Admin API
// (2026-04): variant_id, inventory_item_id, sku, and the location list +
// which location(s) hold inventory. Flags any product with >1 variant.
// Then (idempotently) upserts products into Supabase on shopify_product_id.
//
// Dependency-free: Node built-in fetch + fs only. Reads creds from
// .env / .env.local in the CURRENT WORKING DIRECTORY. The Shopify token and
// any Supabase key are used in headers only — never printed or logged.
//
// Run from the repo root that holds .env.local:
//   node scripts/resolve-and-seed.mjs

import { readFileSync, existsSync } from "node:fs";

// ── env loading (first file wins; never overrides an already-set var) ────────
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    } else {
      const c = v.indexOf(" #"); // strip trailing inline comment for unquoted values
      if (c !== -1) v = v.slice(0, c).trim();
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const STORE = (process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API = process.env.SHOPIFY_API_VERSION || "2026-04";
if (!STORE || !TOKEN) {
  console.error("✖ Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in .env / .env.local");
  process.exit(1);
}
const BASE = `https://${STORE}/admin/api/${API}`;

// ── roadmap §1.2 — the 19 core SKUs (category + lead time are NOT in Shopify) ─
const CATEGORY_LEAD = { supplement_chews: 98, cbd: 49, treats: 98, salmon_oil: 56 };
const ROADMAP = [
  [7706691436753, "Hip & Joint Chews — Flex + Relief", "supplement_chews"],
  [7706691731665, "Allergy Chews — Soothe + Shield", "supplement_chews"],
  [7706691371217, "Multi-Vitamin Chews — Energy + Defense", "supplement_chews"],
  [7706691272913, "Probiotic Digestive Chews — Flora + Flourish", "supplement_chews"],
  [7706691207377, "Skin & Coat Chews — Luster + Nourish", "supplement_chews"],
  [7706692649169, "Activ-Multi-V — Energy + Defense", "supplement_chews"],
  [7706692026577, "1000mg CBD Oil — Calm + Comfort", "cbd"],
  [7706691961041, "750mg CBD Oil — Calm + Comfort", "cbd"],
  [7706691993809, "250mg CBD Oil — Calm + Comfort", "cbd"],
  [7706692157649, "CBD Soft Chews — Calm + Comfort", "cbd"],
  [7706690846929, "500mg CBD Balm — Relief + Restore", "cbd"],
  [7706691698897, "Beef Heart Treats — Strength + Health", "treats"],
  [7706691666129, "Beef Liver Treats — Protein + Power", "treats"],
  [7706692092113, "Beef Tendon Chews — Dental + Joint", "treats"],
  [7706692387025, "Beef Trachea Chews — Dental + Joint", "treats"],
  [7706691567825, "Chicken Breast Treats — Lean + Protein", "treats"],
  [7706691502289, "Chicken Liver Treats — Glow + Strength", "treats"],
  [7706692190417, "Sweet Potato Treats — Nourish + Glow", "treats"],
  [7706690945233, "Wild Alaskan Salmon & Pollock Oil — Brain + Heart", "salmon_oil"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// REST is 2 req/s — pace calls and back off on 429.
async function shopify(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") || 2) * 1000;
      await sleep(wait);
      continue;
    }
    await sleep(300); // ~2-3 req/s
    return res;
  }
  throw new Error(`Rate-limited repeatedly on ${path}`);
}

// ── 1. auth sanity check ─────────────────────────────────────────────────────
console.log(`\nAuth check → GET ${BASE}/shop.json`);
const shopRes = await shopify("/shop.json");
if (shopRes.status === 401 || shopRes.status === 403) {
  console.error(`\n✖ AUTH FAILED (${shopRes.status}).`);
  console.error(`  The SHOPIFY_ADMIN_TOKEN or store handle is not valid for the Admin API.`);
  console.error(`  A Custom App Admin API access token normally starts with "shpat_".`);
  console.error(`  Fix the token / scopes (read_products, read_inventory) and re-run. Stopping.`);
  process.exit(2);
}
if (!shopRes.ok) {
  console.error(`\n✖ shop.json returned ${shopRes.status} ${shopRes.statusText}. Stopping.`);
  process.exit(2);
}
const shop = (await shopRes.json()).shop;
console.log(`✔ Authenticated: "${shop?.name}" — ${shop?.myshopify_domain} (plan: ${shop?.plan_name})\n`);

// ── 2. locations ─────────────────────────────────────────────────────────────
const locRes = await shopify("/locations.json");
const locations = locRes.ok ? (await locRes.json()).locations : [];
const locName = new Map(locations.map((l) => [l.id, l.name]));
console.log(`Locations (${locations.length}):`);
for (const l of locations) {
  console.log(`  • [${l.id}] ${l.name}  active=${l.active}  fulfills_online=${l.fulfills_online_orders ?? "?"}`);
}
console.log("");

// ── 3. resolve each product ─────────────────────────────────────────────────
const rows = [];
const allItemIds = [];
for (const [pid, roadmapName, category] of ROADMAP) {
  const res = await shopify(`/products/${pid}.json?fields=id,title,status,variants`);
  if (res.status === 404) {
    rows.push({ pid, roadmapName, category, error: "NOT FOUND (404)" });
    continue;
  }
  if (!res.ok) {
    rows.push({ pid, roadmapName, category, error: `HTTP ${res.status}` });
    continue;
  }
  const p = (await res.json()).product;
  const variants = p.variants || [];
  for (const v of variants) if (v.inventory_item_id) allItemIds.push(v.inventory_item_id);
  rows.push({
    pid,
    roadmapName,
    shopifyTitle: p.title,
    status: p.status,
    category,
    variantCount: variants.length,
    variants: variants.map((v) => ({
      variant_id: v.id,
      inventory_item_id: v.inventory_item_id,
      sku: v.sku || "",
      title: v.title,
    })),
  });
}

// ── 4. inventory levels → which locations hold stock ────────────────────────
const levelsByItem = new Map(); // inventory_item_id -> [{location_id, available}]
for (let i = 0; i < allItemIds.length; i += 50) {
  const chunk = allItemIds.slice(i, i + 50).join(",");
  const res = await shopify(`/inventory_levels.json?inventory_item_ids=${chunk}&limit=250`);
  if (!res.ok) continue;
  for (const lvl of (await res.json()).inventory_levels || []) {
    if (!levelsByItem.has(lvl.inventory_item_id)) levelsByItem.set(lvl.inventory_item_id, []);
    levelsByItem.get(lvl.inventory_item_id).push({ location_id: lvl.location_id, available: lvl.available });
  }
}
const onHandLocations = new Set();
const fmtOnHand = (itemId) => {
  const lv = levelsByItem.get(itemId) || [];
  const held = lv.filter((x) => (x.available ?? 0) > 0);
  held.forEach((x) => onHandLocations.add(x.location_id));
  return held.length
    ? held.map((x) => `${locName.get(x.location_id) ?? x.location_id}:${x.available}`).join(", ")
    : "(none > 0)";
};

// ── 5. print resolution table ────────────────────────────────────────────────
console.log("Resolution (19 SKUs):");
console.table(
  rows.map((r) => {
    if (r.error) return { product: r.roadmapName.slice(0, 34), category: r.category, ERROR: r.error };
    const primary = r.variants[0] || {};
    return {
      product: (r.shopifyTitle || r.roadmapName).slice(0, 34),
      category: r.category,
      variants: r.variantCount,
      variant_id: primary.variant_id ?? "—",
      inventory_item_id: primary.inventory_item_id ?? "—",
      sku: primary.sku || "—",
      on_hand: r.variantCount === 1 ? fmtOnHand(primary.inventory_item_id) : "(multi-variant)",
    };
  }),
);

// ── 6. EXPLICIT multi-variant + error flags ─────────────────────────────────
const multi = rows.filter((r) => !r.error && r.variantCount > 1);
const errored = rows.filter((r) => r.error);
console.log(`\n── Flags ──`);
if (multi.length) {
  console.log(`⚠ ${multi.length} product(s) have MORE THAN ONE VARIANT — NOT auto-seeding a variant (need your call on which to track):`);
  for (const r of multi) {
    console.log(`   • ${r.shopifyTitle} (product ${r.pid}) — ${r.variantCount} variants:`);
    for (const v of r.variants) {
      console.log(`       - variant ${v.variant_id} | item ${v.inventory_item_id} | sku "${v.sku}" | "${v.title}" | on-hand ${fmtOnHand(v.inventory_item_id)}`);
    }
  }
} else {
  console.log(`✔ All resolved products are single-variant.`);
}
if (errored.length) {
  console.log(`⚠ ${errored.length} product(s) failed to resolve:`);
  for (const r of errored) console.log(`   • ${r.roadmapName} (product ${r.pid}) — ${r.error}`);
}

console.log(`\n── On-hand source ──`);
if (onHandLocations.size) {
  console.log(`Location(s) holding inventory (available > 0):`);
  for (const id of onHandLocations) console.log(`   • [${id}] ${locName.get(id) ?? "?"}`);
} else {
  console.log(`No location shows available > 0 for any resolved item.`);
}

// ── 7. upsert into Supabase (only if a service-role key is available) ────────
const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const seedRows = rows
  .filter((r) => !r.error)
  .map((r) => {
    const single = r.variantCount === 1 ? r.variants[0] : null;
    const row = {
      shopify_product_id: r.pid,
      name: r.shopifyTitle || r.roadmapName,
      category: r.category,
      lead_time_days: CATEGORY_LEAD[r.category],
      safety_stock_days: 30,
      active: true,
    };
    // Only set variant ids for unambiguous (single-variant) products — never guess.
    if (single) {
      row.shopify_variant_id = single.variant_id;
      row.inventory_item_id = single.inventory_item_id;
    }
    return { row, single: Boolean(single) };
  });

console.log(`\n── Supabase upsert ──`);
if (!SUPA_URL || !SERVICE_KEY) {
  console.log(`⏭  SKIPPED — SUPABASE_SERVICE_ROLE_KEY not set (RLS now blocks anon writes).`);
  console.log(`   ${seedRows.length} product rows are resolved and ready to upsert.`);
  console.log(`   To write: add SUPABASE_SERVICE_ROLE_KEY to .env.local and re-run, or seed via the Supabase MCP after review.`);
  process.exit(0);
}

async function upsert(payload, conflictCols) {
  const res = await fetch(`${SUPA_URL}/rest/v1/products?on_conflict=shopify_product_id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`upsert failed ${res.status}: ${await res.text()}`);
}

// Single-variant rows carry variant ids; multi-variant rows omit them so an
// existing variant choice is never clobbered with a guess.
const singleRows = seedRows.filter((s) => s.single).map((s) => s.row);
const multiRows = seedRows.filter((s) => !s.single).map((s) => s.row);
if (singleRows.length) await upsert(singleRows);
if (multiRows.length) await upsert(multiRows);
console.log(`✔ Upserted ${singleRows.length} single-variant + ${multiRows.length} multi-variant (catalog-only) product rows.`);
