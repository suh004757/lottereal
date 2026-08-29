-- Apply only after the RPC-based frontend is live and verified.
-- This removes direct browser access to base-table timestamps and server-only columns.

begin;

revoke all privileges on table public.external_inquiry_receipts from anon, authenticated, public;

revoke all on function public.get_external_inquiry_activity() from public;
grant execute on function public.get_external_inquiry_activity() to anon, authenticated;

commit;
