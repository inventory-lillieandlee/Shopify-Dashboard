import type { NextRequest } from "next/server";
import { adminClientOrError } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEVELS = new Set(["yellow", "red", "critical"]);

// Manage alert recipients via the service-role client. Open — no login/admin gate.
export async function GET() {
  const { admin, error } = adminClientOrError();
  if (error) return error;
  try {
    const { data, error: e } = await admin
      .from("alert_recipients")
      .select("id, email, min_level, active")
      .order("email");
    if (e) throw new Error(e.message);
    return Response.json({ recipients: data ?? [] });
  } catch (e) {
    console.warn("recipients list failed:", String(e));
    return Response.json({ error: "could not list recipients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { admin, error } = adminClientOrError();
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
  try {
    const { error: e } = await admin
      .from("alert_recipients")
      .upsert({ email, min_level, active: true }, { onConflict: "email" });
    if (e) throw new Error(e.message);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.warn("recipient add failed:", String(e));
    return Response.json({ error: "could not add recipient" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { admin, error } = adminClientOrError();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    const { error: e } = await admin.from("alert_recipients").delete().eq("id", id);
    if (e) throw new Error(e.message);
    return Response.json({ ok: true });
  } catch (e) {
    console.warn("recipient remove failed:", String(e));
    return Response.json({ error: "could not remove recipient" }, { status: 500 });
  }
}
