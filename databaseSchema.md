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
  tournaments_created_count integer null default 0,
  emails character varying null,
  constraint profiles_username_key unique (username),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.tournament_teams (
  id uuid not null default gen_random_uuid (),
  tournament_id uuid not null,
  team_name character varying(255) not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  total_points jsonb null default '{"wins": 0, "kill_points": 0, "matches_played": 0, "placement_points": 0}'::jsonb,
  members jsonb null default '[]'::jsonb,
  constraint tournament_teams_pkey primary key (id),
  constraint tournament_teams_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tournament_teams_tournament_id on public.tournament_teams using btree (tournament_id) TABLESPACE pg_default;

create table public.tournaments (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name character varying(255) not null,
  game character varying(50) not null,
  points_system jsonb not null,
  kill_points integer null default 1,
  status character varying(50) null default 'active'::character varying,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  share_id text null,
  is_public boolean null default false,
  selected_template_id uuid null,
  theme text null default 'darkBlue'::text,
  final_standings jsonb null default '[]'::jsonb,
  theme_config jsonb null default '{}'::jsonb,
  constraint tournaments_pkey primary key (id),
  constraint tournaments_share_id_key unique (share_id),
  constraint tournaments_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tournaments_user_id on public.tournaments using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_tournaments_status on public.tournaments using btree (status) TABLESPACE pg_default;

create index IF not exists idx_tournaments_share_id on public.tournaments using btree (share_id) TABLESPACE pg_default;

create trigger on_tournament_created
after INSERT on tournaments for EACH row
execute FUNCTION increment_tournament_count ();

create table public.themes (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  name text not null,
  url text not null,
  status text null default 'pending'::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  mapping_config jsonb null default '{}'::jso
  constraint themes_pkey primary key (id),
  constraint themes_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint themes_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'verified'::text,
          'rejected'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;