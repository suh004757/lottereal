-- Minimize the browser-readable property listing projection.
-- The public UI uses only the columns granted below. Per-record contact and owner
-- fields stay available to authenticated ADMIN workflows but not to anon clients.

begin;

alter table public.property_listings enable row level security;

revoke all privileges on table public.property_listings from anon;

grant select (
  id,
  title,
  description,
  price,
  currency,
  property_type,
  address,
  city,
  district,
  latitude,
  longitude,
  images,
  created_at
) on table public.property_listings to anon;

commit;
