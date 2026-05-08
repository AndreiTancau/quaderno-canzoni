alter table public.songs
add column if not exists sort_order integer;

with ordered as (
  select
    id,
    row_number() over (
      order by title asc, created_at asc, id asc
    ) as rn
  from public.songs
)
update public.songs s
set sort_order = ordered.rn
from ordered
where s.id = ordered.id
  and s.sort_order is null;

create index if not exists songs_sort_order_idx
on public.songs(sort_order);
