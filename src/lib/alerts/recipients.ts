import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipientLike } from "./policy.ts";

export interface Recipient extends RecipientLike {
  id: string;
  active: boolean;
}

/** Active alert recipients (service-role read — emails are private). */
export async function readActiveRecipients(admin: SupabaseClient): Promise<RecipientLike[]> {
  const { data, error } = await admin
    .from("alert_recipients")
    .select("email, min_level")
    .eq("active", true);
  if (error) throw new Error(`alert_recipients: ${error.message}`);
  return (data ?? []) as RecipientLike[];
}
