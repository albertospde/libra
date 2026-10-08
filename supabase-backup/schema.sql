-- ============================================================================
-- PDE Libra — backup struttura progetto Supabase "ORDINI LIBRAI"
-- (pvsoijmopdqozvutgtdm), generato l'8 ottobre 2026.
-- Per ricreare il progetto: eseguire questo file nell'SQL editor di un
-- progetto nuovo, poi ricaricare i dati da dati.json e ridistribuire le
-- edge function in ../supabase-backup/functions/.
-- Migrazioni originali: 20260706111416 schema_iniziale_portale_librerie,
--                       20260706130247 add_piva_citta_librerie
-- ============================================================================

create sequence if not exists public.ordini_numero_ordine_seq;

create table if not exists public.campagne (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  data_scadenza date,
  attivo boolean default true not null,
  created_at timestamp with time zone default now() not null
);
alter table public.campagne enable row level security;

create table if not exists public.giri (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  data_scadenza date,
  attivo boolean default true not null,
  created_at timestamp with time zone default now() not null
);
alter table public.giri enable row level security;

create table if not exists public.proposte (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  data_scadenza date,
  attivo boolean default true not null,
  created_at timestamp with time zone default now() not null
);
alter table public.proposte enable row level security;

create table if not exists public.librerie (
  id uuid default gen_random_uuid() not null,
  auth_user_id uuid,
  ragione_sociale text not null,
  cod_cliente text,
  email text not null,
  telefono text,
  indirizzo text,
  stato text default 'in_attesa'::text not null,
  note_admin text,
  created_at timestamp with time zone default now() not null,
  approvato_at timestamp with time zone,
  partita_iva text,
  citta text
);
alter table public.librerie enable row level security;

create table if not exists public.titoli (
  id uuid default gen_random_uuid() not null,
  sezione_tipo text not null,
  sezione_id uuid not null,
  ean text not null,
  titolo text not null,
  editore text,
  prezzo numeric,
  note text,
  created_at timestamp with time zone default now() not null,
  autore text,
  gemelli text,
  cedola text
);
alter table public.titoli enable row level security;

create table if not exists public.ordini (
  id uuid default gen_random_uuid() not null,
  libreria_id uuid not null,
  sezione_tipo text not null,
  sezione_id uuid not null,
  stato text default 'inviato'::text not null,
  created_at timestamp with time zone default now() not null,
  scaricato_at timestamp with time zone,
  numero_ordine integer default nextval('ordini_numero_ordine_seq'::regclass) not null
);
alter table public.ordini enable row level security;

create table if not exists public.ordini_dettaglio (
  id uuid default gen_random_uuid() not null,
  ordine_id uuid not null,
  ean text not null,
  titolo text not null,
  editore text,
  prezzo numeric,
  quantita integer default 1 not null,
  cedola text,
  autore text
);
alter table public.ordini_dettaglio enable row level security;

create table if not exists public.chat_conversazioni (
  id uuid default gen_random_uuid() not null,
  libreria_id uuid not null,
  stato text default 'aperta'::text not null,
  created_at timestamp with time zone default now() not null,
  archiviata_at timestamp with time zone
);
alter table public.chat_conversazioni enable row level security;

create table if not exists public.chat_messaggi (
  id uuid default gen_random_uuid() not null,
  libreria_id uuid not null,
  mittente text not null,
  testo text not null,
  letto_libreria boolean default false not null,
  letto_admin boolean default false not null,
  created_at timestamp with time zone default now() not null,
  conversazione_id uuid
);
alter table public.chat_messaggi enable row level security;

create table if not exists public.materiali_sezione (
  id uuid default gen_random_uuid() not null,
  sezione_tipo text not null,
  sezione_id uuid not null,
  tipo text not null,
  url text not null,
  nome_file text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.materiali_sezione enable row level security;

-- Vincoli -------------------------------------------------------------------
alter table campagne add constraint campagne_pkey PRIMARY KEY (id);
alter table giri add constraint giri_pkey PRIMARY KEY (id);
alter table proposte add constraint proposte_pkey PRIMARY KEY (id);
alter table librerie add constraint librerie_pkey PRIMARY KEY (id);
alter table librerie add constraint librerie_email_key UNIQUE (email);
alter table librerie add constraint librerie_auth_user_id_key UNIQUE (auth_user_id);
alter table librerie add constraint librerie_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table librerie add constraint librerie_stato_check CHECK ((stato = ANY (ARRAY['in_attesa'::text, 'approvato'::text, 'bloccato'::text])));
alter table titoli add constraint titoli_pkey PRIMARY KEY (id);
alter table titoli add constraint titoli_sezione_tipo_check CHECK ((sezione_tipo = ANY (ARRAY['giro'::text, 'campagna'::text, 'proposta'::text])));
alter table ordini add constraint ordini_pkey PRIMARY KEY (id);
alter table ordini add constraint ordini_libreria_id_fkey FOREIGN KEY (libreria_id) REFERENCES librerie(id) ON DELETE CASCADE;
alter table ordini add constraint ordini_stato_check CHECK ((stato = ANY (ARRAY['inviato'::text, 'elaborato'::text, 'scaricato'::text])));
alter table ordini add constraint ordini_sezione_tipo_check CHECK ((sezione_tipo = ANY (ARRAY['giro'::text, 'campagna'::text, 'proposta'::text])));
alter table ordini_dettaglio add constraint ordini_dettaglio_pkey PRIMARY KEY (id);
alter table ordini_dettaglio add constraint ordini_dettaglio_ordine_id_fkey FOREIGN KEY (ordine_id) REFERENCES ordini(id) ON DELETE CASCADE;
alter table chat_conversazioni add constraint chat_conversazioni_pkey PRIMARY KEY (id);
alter table chat_conversazioni add constraint chat_conversazioni_libreria_id_fkey FOREIGN KEY (libreria_id) REFERENCES librerie(id) ON DELETE CASCADE;
alter table chat_conversazioni add constraint chat_conversazioni_stato_check CHECK ((stato = ANY (ARRAY['aperta'::text, 'archiviata'::text])));
alter table chat_messaggi add constraint chat_messaggi_pkey PRIMARY KEY (id);
alter table chat_messaggi add constraint chat_messaggi_conversazione_id_fkey FOREIGN KEY (conversazione_id) REFERENCES chat_conversazioni(id) ON DELETE CASCADE;
alter table chat_messaggi add constraint chat_messaggi_libreria_id_fkey FOREIGN KEY (libreria_id) REFERENCES librerie(id) ON DELETE CASCADE;
alter table chat_messaggi add constraint chat_messaggi_mittente_check CHECK ((mittente = ANY (ARRAY['libreria'::text, 'admin'::text])));
alter table materiali_sezione add constraint materiali_sezione_pkey PRIMARY KEY (id);
alter table materiali_sezione add constraint materiali_sezione_sezione_tipo_sezione_id_tipo_key UNIQUE (sezione_tipo, sezione_id, tipo);
alter table materiali_sezione add constraint materiali_sezione_tipo_check CHECK ((tipo = ANY (ARRAY['banner'::text, 'locandina'::text])));
alter table materiali_sezione add constraint materiali_sezione_sezione_tipo_check CHECK ((sezione_tipo = ANY (ARRAY['giro'::text, 'campagna'::text])));

-- Indici --------------------------------------------------------------------
CREATE INDEX idx_titoli_sezione ON public.titoli USING btree (sezione_tipo, sezione_id);

-- Policy (ATTENZIONE: da rifare prima del lancio, vedi README) ----------------
create policy "authenticated full access titoli" on public.titoli as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated full access librerie" on public.librerie as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "anon puo registrarsi" on public.librerie as PERMISSIVE for INSERT to anon with check (true);
create policy "authenticated full access giri" on public.giri as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated full access campagne" on public.campagne as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated full access proposte" on public.proposte as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated full access ordini" on public.ordini as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated full access ordini_dettaglio" on public.ordini_dettaglio as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated full access chat" on public.chat_messaggi as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated full access chat_conversazioni" on public.chat_conversazioni as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy materiali_sezione_admin_write on public.materiali_sezione as PERMISSIVE for ALL to public using ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)) with check ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text));
create policy materiali_sezione_select_public on public.materiali_sezione as PERMISSIVE for SELECT to public using (true);

-- Storage -------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('materiali-sezione', 'materiali-sezione', true) on conflict (id) do nothing;
-- Il bucket 'giro-pdf' (PDF per EAN) è stato dismesso l'8/10/2026: le copertine
-- dei giri ora arrivano dai CDN librerie come per campagne e proposte.
create policy materiali_storage_select_public on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'materiali-sezione'::text));
create policy materiali_storage_admin_write on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'materiali-sezione'::text) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)));
create policy materiali_storage_admin_update on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'materiali-sezione'::text) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)));
