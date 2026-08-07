import { supabase } from "@/lib/supabase";
import type { Recipient, Sender } from "@/lib/types";
import { recipientFromRow, recipientToRow, senderFromRow, senderToRow } from "./mappers";

export async function listSenders(): Promise<Sender[]> {
  const { data, error } = await supabase.from("senders").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(senderFromRow);
}

export async function upsertSender(sender: Sender): Promise<Sender> {
  const { data, error } = await supabase
    .from("senders")
    .upsert(senderToRow(sender))
    .select("*")
    .single();
  if (error) throw error;
  return senderFromRow(data);
}

export async function deleteSender(id: string): Promise<void> {
  const { error } = await supabase.from("senders").delete().eq("id", id);
  if (error) throw error;
}

export async function listRecipients(): Promise<Recipient[]> {
  const { data, error } = await supabase.from("recipients").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(recipientFromRow);
}

export async function upsertRecipient(recipient: Recipient): Promise<Recipient> {
  const { data, error } = await supabase
    .from("recipients")
    .upsert(recipientToRow(recipient))
    .select("*")
    .single();
  if (error) throw error;
  return recipientFromRow(data);
}

export async function deleteRecipient(id: string): Promise<void> {
  const { error } = await supabase.from("recipients").delete().eq("id", id);
  if (error) throw error;
}
