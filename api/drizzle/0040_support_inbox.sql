-- A human behind the support assistant.
--
-- The assistant could explain but not act, and "talk to a person" opened the
-- phone's mail app: the customer lost the conversation, and the team never saw
-- it. Now the customer hands the same conversation to the team
-- (`status = 'escalated'`, which the enum already had and nothing used), an
-- administrator answers in the back office, and the reply lands in the same
-- thread.

-- A reply written by an administrator. `assistant` stays the model's.
alter type public.support_message_role add value if not exists 'agent';
--> statement-breakpoint
alter type public.audit_subject add value if not exists 'support';
--> statement-breakpoint

-- Who wrote an `agent` message. Null for the customer's and the model's.
alter table public.support_messages
  add column author_id uuid references public.profiles (id) on delete set null;
--> statement-breakpoint

alter table public.support_conversations
  add column escalated_at timestamptz,
  -- What the inbox sorts by: the thread that moved last comes first.
  add column last_message_at timestamptz not null default now(),
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.profiles (id);
--> statement-breakpoint

update public.support_conversations c
   set last_message_at = coalesce(
     (select max(m.created_at) from public.support_messages m where m.conversation_id = c.id),
     c.created_at
   );
--> statement-breakpoint

-- The inbox reads escalated threads, newest activity first. Partial: open
-- (assistant-only) and closed threads never appear there.
create index support_conversations_inbox_idx
  on public.support_conversations (last_message_at desc)
  where status = 'escalated';
--> statement-breakpoint

-- An administrator answers an escalated conversation. Message and audit line
-- in one transaction.
--
-- Refusals: SGB05 no such conversation; SGB06 it is not waiting for the team
-- (still with the assistant, or already resolved).
--
-- The audit line records *that* a reply was sent, not what it said: the
-- conversation is the customer's, and it is deleted with their account; the
-- audit log is kept forever.
create or replace function public.admin_support_reply(
  p_admin_id uuid,
  p_conversation_id uuid,
  p_content text
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_status public.support_conversation_status;
  v_customer uuid;
  v_message_id uuid;
  v_label text;
begin
  select c.status, c.customer_id into v_status, v_customer
    from public.support_conversations c
   where c.id = p_conversation_id
     for update;
  if not found then
    raise exception 'Conversation not found' using errcode = 'SGB05';
  end if;
  if v_status <> 'escalated' then
    raise exception 'This conversation is not waiting for the team' using errcode = 'SGB06';
  end if;

  insert into public.support_messages (conversation_id, role, content, author_id)
  values (p_conversation_id, 'agent', p_content, p_admin_id)
  returning id into v_message_id;

  update public.support_conversations set last_message_at = now() where id = p_conversation_id;

  select coalesce(full_name, v_customer::text) into v_label from public.profiles where id = v_customer;
  perform private.admin_audit_write(
    p_admin_id, 'support.reply', 'support'::public.audit_subject, p_conversation_id, v_label, null, null
  );
  return v_message_id;
end;
$function$;
--> statement-breakpoint

-- An administrator closes an escalated conversation as resolved.
create or replace function public.admin_support_resolve(
  p_admin_id uuid,
  p_conversation_id uuid
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_status public.support_conversation_status;
  v_customer uuid;
  v_label text;
begin
  select c.status, c.customer_id into v_status, v_customer
    from public.support_conversations c
   where c.id = p_conversation_id
     for update;
  if not found then
    raise exception 'Conversation not found' using errcode = 'SGB05';
  end if;
  if v_status <> 'escalated' then
    raise exception 'This conversation is not waiting for the team' using errcode = 'SGB06';
  end if;

  update public.support_conversations
     set status = 'closed', resolved_at = now(), resolved_by = p_admin_id
   where id = p_conversation_id;

  select coalesce(full_name, v_customer::text) into v_label from public.profiles where id = v_customer;
  perform private.admin_audit_write(
    p_admin_id, 'support.resolve', 'support'::public.audit_subject, p_conversation_id, v_label, null,
    jsonb_build_object('status', jsonb_build_object('from', 'escalated', 'to', 'closed'))
  );
end;
$function$;
--> statement-breakpoint

revoke execute on function public.admin_support_reply(uuid, uuid, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_support_reply(uuid, uuid, text) to service_role;
--> statement-breakpoint
revoke execute on function public.admin_support_resolve(uuid, uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_support_resolve(uuid, uuid) to service_role;
