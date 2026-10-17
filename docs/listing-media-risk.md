# Public listing media: remaining risk

Listing photos stay in the existing **public** bucket in this patch. Open listings depend on
stable public URLs, and there is no proven zero-break migration for existing pages and cached
links.

This leaves a **remaining risk**: anyone who retains a known URL may continue to retrieve a
photo after a listing is closed, even though the listing row no longer appears in public reads.
A future migration should use an inventory, URL rewrite/redirect plan, cache-expiry analysis,
and rollback-tested signed delivery before changing bucket privacy.
