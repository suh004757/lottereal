from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MIGRATION = ROOT / "supabase" / "migrations" / "029_listing_rent_and_audit.sql"


class ListingPhaseOneTests(unittest.TestCase):
    def test_migration_adds_public_rent_columns_and_append_only_audit(self):
        sql = MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("add column if not exists deposit numeric", sql)
        self.assertIn("add column if not exists monthly_rent numeric", sql)
        self.assertRegex(sql, r"grant\s+select\s*\(deposit,\s*monthly_rent\)")
        self.assertIn("create table if not exists public.listing_state_audit", sql)
        self.assertIn("actor_id uuid", sql)
        self.assertIn("previous_state jsonb", sql)
        self.assertIn("new_state jsonb", sql)
        self.assertIn("action text", sql)
        self.assertIn("created_at timestamptz", sql)
        self.assertGreaterEqual(sql.count("insert into public.listing_state_audit"), 2)
        self.assertIn("revoke delete on table public.property_listings from authenticated", sql)
        self.assertNotRegex(sql, r"grant\s+delete.*authenticated")

    def test_irreversible_delete_path_is_absent_and_privileged_actions_refresh(self):
        dashboard = (PUBLIC / "js" / "admin-dashboard.js").read_text(encoding="utf-8")
        adapter = (PUBLIC / "js" / "services" / "backendAdapter.js").read_text(encoding="utf-8")
        self.assertNotIn("deleteListing", dashboard)
        self.assertNotIn("deleteListing", adapter)
        confirm_block = dashboard[dashboard.index("[data-confirm]"):dashboard.index("[data-close]")]
        close_block = dashboard[dashboard.index("[data-close]"):dashboard.index("[data-edit]")]
        self.assertIn("await refreshAdminSession();", confirm_block)
        self.assertIn("await refreshAdminSession();", close_block)

    def test_listing_error_and_image_rendering_are_truthful_and_safe(self):
        listing_page = (PUBLIC / "js" / "listingsPage.js").read_text(encoding="utf-8")
        detail = (PUBLIC / "js" / "listingDetail.js").read_text(encoding="utf-8")
        adapter = (PUBLIC / "js" / "services" / "backendAdapter.js").read_text(encoding="utf-8")
        repository = (PUBLIC / "js" / "services" / "publicListingRepository.mjs").read_text(encoding="utf-8")
        self.assertIn("다시 시도", listing_page)
        self.assertIn("safeImageUrl", listing_page)
        self.assertNotIn("style=\"background-image:url('", listing_page)
        self.assertIn(".maybeSingle()", repository)
        self.assertIn("renderUnavailable", detail)
        self.assertIn('type="button"', detail)
        self.assertIn("aria-pressed", detail)
        listing_css = (PUBLIC / "style.css").read_text(encoding="utf-8")
        self.assertIn(".lr-detail__thumbnail:focus-visible", listing_css)

    def test_admin_image_processing_and_property_dialog_are_accessible(self):
        html = (PUBLIC / "admin" / "dashboard.html").read_text(encoding="utf-8")
        js = (PUBLIC / "js" / "admin-dashboard.js").read_text(encoding="utf-8")
        self.assertRegex(html, r'id="propertyModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="modalTitle"')
        self.assertIn("propertyImageGeneration", js)
        self.assertIn("await readFileAsDataUrl", js)
        self.assertIn("propertyModalReturnFocus", js)
        self.assertIn("trapModalFocus", js)
        self.assertIn("propertyImagesPending", js)

    def test_report_evidence_dialog_and_auxiliary_failures_are_independent(self):
        html = (PUBLIC / "report.html").read_text(encoding="utf-8")
        js = (PUBLIC / "js" / "reportPage.js").read_text(encoding="utf-8")
        self.assertRegex(html, r'id="evidence-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="evidence-modal-title"')
        self.assertIn("evidenceReturnFocus", js)
        self.assertIn("trapModalFocus", js)
        self.assertIn("event.key === 'Escape'", js)
        primary = js.index("renderReport();")
        auxiliary = js.index("listPublishedReports", primary)
        self.assertLess(primary, auxiliary)
        self.assertIn("renderAuxiliaryFallback", js)

    def test_journey_pauses_css_animations_when_not_autoplaying(self):
        js = (PUBLIC / "js" / "homeJourney.js").read_text(encoding="utf-8")
        css = (PUBLIC / "css" / "home-journey.css").read_text(encoding="utf-8")
        self.assertIn("is-motion-paused", js)
        self.assertRegex(css, r"\.lr-journey\.is-motion-paused[^{]*\{[^}]*animation-play-state:\s*paused")

    def test_public_media_risk_is_documented_without_private_bucket_move(self):
        risk = (ROOT / "docs" / "listing-media-risk.md").read_text(encoding="utf-8")
        self.assertIn("known URL", risk)
        self.assertIn("public", risk.lower())
        self.assertIn("remaining risk", risk.lower())


if __name__ == "__main__":
    unittest.main()
