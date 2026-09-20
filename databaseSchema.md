create table public.profiles (
  id uuid not null,
  username text null,
  display_name text null,
  avatar_url text null,
  subscription_tier text not null default 'free'::text,
  subscription_status text not null default 'active'::text,
  subscription_expires_at timestamp with time zone null,
  feature_flags jsonb not null default '{}'::jsonb,
  theme_config jsonb not null default '{}'::jsonb,
  is_admin boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  lobbies_created_count integer null default 0,
  emails character varying null,
  expo_push_token text null,
  phone bigint[] null,
  whatsapp_access_token text null,
  whatsapp_refresh_token text null,
  flux_balance numeric null default 0,
  ads_watched_count integer null default 0, -- Temporary counter for current reward cycle (resets to 0 once reward is claimed)
  last_ad_watched_at timestamp with time zone null,
  constraint profiles_pkey primary key (id),
  constraint profiles_phone_key unique (phone),
  constraint profiles_username_key unique (username),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.teams (
  id uuid not null default gen_random_uuid (),
  name text not null,
  game text not null,
  members jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  analytics_snapshot jsonb null default '{}'::jsonb,
  lobbies_played uuid[] not null default '{}'::uuid[],
  lobbies_count integer not null default 0,
  owner_user_id uuid null,
  constraint teams_pkey primary key (id),
  constraint teams_unique_name_game unique (name, game),
  constraint teams_owner_user_id_fkey foreign KEY (owner_user_id) references team_profiles (id) on delete set null
) TABLESPACE pg_default;

create table public.team_profiles (
  id uuid not null default gen_random_uuid (),
  username text null,
  email text null,
  firebase_uid text null,
  team_id uuid null,
  subscription_tier text not null default 'free'::text,
  fcm_token text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint team_profiles_pkey primary key (id),
  constraint team_profiles_team_id_fkey foreign KEY (team_id) references teams (id) on delete set null
) TABLESPACE pg_default;

create table public.themes (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  name text not null,
  url text not null,
  status text null default 'pending'::text,
  mapping_config jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint themes_pkey primary key (id),
  constraint themes_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint themes_status_check check (
    (status = any (array['pending'::text, 'verified'::text, 'rejected'::text]))
  )
) TABLESPACE pg_default;

create table public.lobbies (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name character varying(255) not null,
  game character varying(50) not null,
  points_system jsonb not null,
  kill_points integer null default 1,
  status character varying(50) null default 'active'::character varying,
  final_standings jsonb null default '[]'::jsonb,
  metadata jsonb null default '{}'::jsonb,
  is_promoted boolean null default false,
  form_data jsonb null default '{}'::jsonb,
  share_id text null,
  is_public boolean null default false,
  selected_template_id uuid null,
  theme text null default 'darkBlue'::text,
  theme_config jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint lobbies_pkey primary key (id),
  constraint lobbies_share_id_key unique (share_id),
  constraint lobbies_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_lobbies_user_id on public.lobbies using btree (user_id) TABLESPACE pg_default;
create index IF not exists idx_lobbies_status on public.lobbies using btree (status) TABLESPACE pg_default;
create index IF not exists idx_lobbies_share_id on public.lobbies using btree (share_id) TABLESPACE pg_default;

create table public.lobby_teams (
  id uuid not null default gen_random_uuid (),
  lobby_id uuid not null,
  team_name character varying(255) not null,
  total_points jsonb null default '{"wins": 0, "kill_points": 0, "matches_played": 0, "placement_points": 0}'::jsonb,
  members jsonb null default '[]'::jsonb,
  respective_slotlist_postion integer not null default 0,
  team_id uuid null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint lobby_teams_pkey primary key (id),
  constraint lobby_teams_lobby_id_fkey foreign KEY (lobby_id) references lobbies (id) on delete CASCADE,
  constraint lobby_teams_team_id_fkey foreign KEY (team_id) references teams (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_lobby_teams_lobby_id on public.lobby_teams using btree (lobby_id) TABLESPACE pg_default;

create table public.ocr_jobs (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  lobby_id uuid null,
  job_type text not null,
  status text not null default 'pending'::text,
  result jsonb null default '{}'::jsonb,
  error text null,
  token_usage jsonb null default '{}'::jsonb,
  image_urls text[] null default '{}'::text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ocr_jobs_pkey primary key (id),
  constraint ocr_jobs_user_id_fkey foreign KEY (user_id) references profiles (id) on delete set null,
  constraint ocr_jobs_lobby_id_fkey foreign KEY (lobby_id) references lobbies (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_ocr_jobs_user_id on public.ocr_jobs using btree (user_id);
create index IF not exists idx_ocr_jobs_lobby_id on public.ocr_jobs using btree (lobby_id);
create index IF not exists idx_ocr_jobs_job_type on public.ocr_jobs using btree (job_type);
create index IF not exists idx_ocr_jobs_status on public.ocr_jobs using btree (status);

create table public.lobby_history (
  id uuid not null default gen_random_uuid (),
  original_lobby_id uuid null,
  created_by uuid null,
  lobby_name text not null,
  game text not null,
  status text null,
  points_system jsonb null,
  kill_points integer null default 1,
  final_standings jsonb null default '[]'::jsonb,
  analytics_snapshot jsonb null default '{}'::jsonb,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint lobby_history_pkey primary key (id),
  constraint lobby_history_created_by_fkey foreign KEY (created_by) references profiles (id) on delete set null
) TABLESPACE pg_default;

create table public.chat_messages (
  id uuid not null default gen_random_uuid (),
  sender_number text not null,
  user_id uuid null,
  role text not null,
  content text not null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default now(),
  constraint chat_messages_pkey primary key (id),
  constraint chat_messages_user_id_fkey foreign KEY (user_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;
