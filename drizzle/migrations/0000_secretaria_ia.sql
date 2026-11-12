create type public.app_role as enum ('staff');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- First account to sign up becomes clinic staff automatically.
create or replace function public.grant_first_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'staff') then
    insert into public.user_roles (user_id, role) values (new.id, 'staff');
  end if;
  return new;
end $$;
create trigger on_auth_user_first_staff after insert on auth.users
for each row execute function public.grant_first_staff();

create table public.clinic_settings (
  id int primary key default 1 check (id = 1),
  clinic_name text not null default 'Clínica',
  assistant_name text not null default 'Ana',
  tone text not null default 'Acolhedora, simpática e breve. Usa emojis com moderação.',
  procedures text not null default 'Preenchimento labial
Botox
Bioestimulador de colágeno
Limpeza de pele
Harmonização facial',
  questions text not null default 'É a primeira vez que vai fazer ou já fez antes?
O que você está buscando com o procedimento?',
  ai_enabled boolean not null default true,
  max_ai_replies int not null default 2,
  send_handoff_message boolean not null default true,
  handoff_message text not null default 'Perfeito! Já vou te passar para nossa especialista, ela te responde em instantes 💛',
  updated_at timestamptz not null default now()
);
grant select, update on public.clinic_settings to authenticated;
grant all on public.clinic_settings to service_role;
alter table public.clinic_settings enable row level security;
create policy "staff read settings" on public.clinic_settings for select to authenticated using (public.has_role(auth.uid(), 'staff'));
create policy "staff update settings" on public.clinic_settings for update to authenticated using (public.has_role(auth.uid(), 'staff'));
insert into public.clinic_settings (id) values (1);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  wa_phone text not null unique,
  contact_name text,
  mode text not null default 'ia' check (mode in ('ia','aguardando_humano','humano','encerrada')),
  ai_replies int not null default 0,
  handoff_reason text,
  handoff_at timestamptz,
  procedure text,
  experience text,
  goal text,
  notes text,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, update on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "staff read conv" on public.conversations for select to authenticated using (public.has_role(auth.uid(), 'staff'));
create policy "staff update conv" on public.conversations for update to authenticated using (public.has_role(auth.uid(), 'staff'));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender text not null check (sender in ('lead','ia','humano')),
  body text not null default '',
  wa_message_id text unique,
  status text not null default 'accepted',
  status_at timestamptz,
  error text,
  reply_state text not null default 'none',
  reply_started_at timestamptz,
  reply_error text,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);
create index on public.messages (reply_state) where reply_state in ('pending','sending','failed');
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "staff read msg" on public.messages for select to authenticated using (public.has_role(auth.uid(), 'staff'));
create policy "staff insert msg" on public.messages for insert to authenticated with check (public.has_role(auth.uid(), 'staff') and sender = 'humano');

create table public.message_status_events (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text not null,
  status text not null,
  status_ts timestamptz,
  errors jsonb,
  created_at timestamptz not null default now(),
  unique (wa_message_id, status)
);
grant all on public.message_status_events to service_role;
alter table public.message_status_events enable row level security;

create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  attempts int not null default 0,
  last_attempt_at timestamptz
);
create index on public.whatsapp_webhook_events (last_attempt_at) where processed_at is null;
grant select on public.whatsapp_webhook_events to authenticated;
grant all on public.whatsapp_webhook_events to service_role;
alter table public.whatsapp_webhook_events enable row level security;
create policy "staff read events" on public.whatsapp_webhook_events for select to authenticated using (public.has_role(auth.uid(), 'staff'));

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;