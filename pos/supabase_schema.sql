-- Archer Farms POS schema. Run in Supabase Dashboard -> SQL Editor.
-- Non-destructive: creates only what is missing. If your project already has
-- an older POS schema (columns like fname / gov_id / p8), those old tables must be
-- renamed or removed by you in the Table Editor first (check they are empty).

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  first_name text, last_name text, phone text, dob date,
  med_card_number text, gov_id text, notes text,
  card_photo_url text, id_photo_url text,
  created_at timestamptz default now()
);
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text not null, description text,
  price numeric(10,2), price_gram numeric(10,2),
  price_eighth numeric(10,2), price_quarter numeric(10,2),
  price_half numeric(10,2), price_oz numeric(10,2),
  created_at timestamptz default now()
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  patient_name text default 'Walk-in',
  patient_phone text, patient_card text,
  total numeric(10,2) default 0,
  status text default 'placed' check (status in ('placed','ready','completed')),
  created_at timestamptz default now(),
  completed_at timestamptz, updated_at timestamptz
);
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  item_name text not null, quantity integer default 1,
  unit_price numeric(10,2) not null,
  created_at timestamptz default now()
);

-- Open policies so the browser (anon key) can read/write. Lock down once you add staff login.
do $$ declare t text; begin
  foreach t in array array['patients','inventory','orders','order_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "pos_anon_all" on %I', t);
    execute format('create policy "pos_anon_all" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
