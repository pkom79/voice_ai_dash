create table if not exists deleted_calls (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  highlevel_call_id text not null,
  deleted_at timestamptz default now(),
  unique(user_id, highlevel_call_id)
);

alter table deleted_calls enable row level security;

create policy "Admins can view deleted calls"
  on deleted_calls for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );

create policy "Admins can insert deleted calls"
  on deleted_calls for insert
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );
