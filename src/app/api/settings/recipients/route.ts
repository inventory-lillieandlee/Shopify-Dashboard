import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEVELS = new Set(["yellow", "red", "critical"]);

// Manage alert recipients. ADMIN-ONLY — self-authorizes (403 without an admin
// session, incl. during dormancy). Service-role only (emails are private).
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const admin = createSupabaseAdminClient();
  const { data, error: e } = await admin
    .from("alert_recipients")
    .select("id, email, min_level, active")
    .order("email");
  if (e) return Response.json({ error: "could not list recipients" }, { status: 500 });
  return Response.json({ recipients: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const email = (body as { email?: unknown })?.email;
  const min_level = (body as { min_level?: unknown })?.min_level ?? "red";
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) {
    return Response.json({ error: "a valid email is required" }, { status: 400 });
  }
  if (typeof min_level !== "string" || !LEVELS.has(min_level)) {
    return Response.json({ error: "min_level must be yellow|red|critical" }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { error: e } = await admin
    .from("alert_recipients")
    .upsert({ email, min_level, active: true }, { onConflict: "email" });
  if (e) return Response.json({ error: "could not add recipient" }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { error: e } = await admin.from("alert_recipients").delete().eq("id", id);
  if (e) return Response.json({ error: "could not remove recipient" }, { status: 500 });
  return Response.json({ ok: true });
}
