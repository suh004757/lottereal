-- Allow more than one daughter account without weakening the single-owner and
-- single-spouse guarantees. Existing members and permissions are preserved.

begin;

alter table public.family_listing_members
  drop constraint family_listing_members_family_role_key;

create unique index family_listing_members_single_owner_idx
  on public.family_listing_members (family_role)
  where family_role = 'owner';

create unique index family_listing_members_single_spouse_idx
  on public.family_listing_members (family_role)
  where family_role = 'spouse';

commit;
