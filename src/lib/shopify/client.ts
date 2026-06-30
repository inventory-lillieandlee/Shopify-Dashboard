// SERVER-ONLY Shopify Admin API client (client-credentials grant).
// Reads SHOPIFY_STORE, SHOPIFY_API_KEY (client_id — public), and SHOPIFY_API_SECRET
// (server-only secret). NEVER import into a client component; the secret + access
// token must never reach the browser bundle.

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
/** Single on-hand "Shop location" (confirmed: the store has exactly one location). */
export const SHOPIFY_LOCATION_ID = "72338145489";

function storeBase(): string {
  const store = process.env.SHOPIFY_STORE;
  if (!store) throw new Error("SHOPIFY_STORE not set");
  return store.startsWith("http") ? store : `https://${store}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cache the short-lived client-credentials token across calls within a request/run.
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;
  const client_id = process.env.SHOPIFY_API_KEY; // public app key
  const client_secret = process.env.SHOPIFY_API_SECRET; // server-only secret
  if (!client_id || !client_secret) throw new Error("SHOPIFY_API_KEY / SHOPIFY_API_SECRET not set");
  const res = await fetch(`${storeBase()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Shopify token grant failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: data.access_token, expiresAt: now + (data.expires_in ?? 86_400) * 1000 };
  return data.access_token;
}

export interface RestResult<T> {
  status: number;
  data: T | null;
  link: string | null;
}

async function restFetch<T>(url: string): Promise<RestResult<T>> {
  const token = await accessToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
    if (res.status === 429) {
      const retry = Number(res.headers.get("Retry-After")) || attempt + 1;
      await sleep(retry * 1000);
      continue;
    }
    const data = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, data, link: res.headers.get("link") };
  }
  throw new Error(`Shopify REST exhausted retries: ${url.split("?")[0]}`);
}

/** GET a REST path (relative to /admin/api/<ver>/). */
export function shopifyRest<T>(path: string): Promise<RestResult<T>> {
  return restFetch<T>(`${storeBase()}/admin/api/${SHOPIFY_API_VERSION}/${path}`);
}

/** GET an absolute REST URL (used to follow cursor-pagination Link headers). */
export function shopifyRestUrl<T>(absoluteUrl: string): Promise<RestResult<T>> {
  return restFetch<T>(absoluteUrl);
}

export async function shopifyGraphQL<T>(query: string): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${storeBase()}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data as T;
}
