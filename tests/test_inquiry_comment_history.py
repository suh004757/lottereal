import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
PUBLIC = REPO / 'public'
MIGRATION = REPO / 'supabase' / 'migrations' / '026_inquiry_comment_history.sql'


class InquiryCommentHistoryTests(unittest.TestCase):
    def test_private_append_only_comment_table_is_admin_role_scoped(self):
        self.assertTrue(MIGRATION.exists(), 'missing inquiry comment migration')
        sql = MIGRATION.read_text(encoding='utf-8').lower()
        self.assertIn('create table if not exists public.inquiry_comments', sql)
        self.assertIn('references public.inquiries(id) on delete cascade', sql)
        self.assertIn('author_id uuid not null default auth.uid()', sql)
        self.assertIn('char_length(body) <= 1000', sql)
        self.assertIn('char_length(btrim(body)) >= 1', sql)
        self.assertIn('alter table public.inquiry_comments enable row level security', sql)
        self.assertIn('revoke all privileges on table public.inquiry_comments from public, anon, authenticated', sql)
        self.assertIn('grant select, insert on table public.inquiry_comments to authenticated', sql)
        self.assertGreaterEqual(sql.count("auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'"), 2)
        self.assertIn('author_id = auth.uid()', sql)
        self.assertIn('revoke all privileges on table public.inquiry_comments from service_role', sql)
        self.assertIn('grant select on table public.inquiry_comments to service_role', sql)
        self.assertIn('comments follow the parent inquiry retention lifecycle', sql)
        self.assertNotIn('grant update', sql)
        self.assertNotIn('grant delete', sql)
        self.assertNotIn('for update', sql)
        self.assertNotIn('for delete', sql)

    def test_admin_modal_exposes_comment_timeline_and_bounded_form(self):
        html = (PUBLIC / 'admin' / 'dashboard.html').read_text(encoding='utf-8')
        self.assertIn('role="dialog" aria-modal="true" aria-labelledby="inquiryModalTitle"', html)
        self.assertIn('data-inquiry-comments', html)
        self.assertIn('id="inquiryCommentForm"', html)
        self.assertIn('name="inquiryComment"', html)
        self.assertIn('maxlength="1000"', html)
        self.assertIn('내부 코멘트', html)
        self.assertIn('고객에게 노출되지 않습니다', html)

    def test_admin_dashboard_renders_comments_as_text_and_tracks_selected_inquiry(self):
        source = (PUBLIC / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        self.assertIn('listInquiryCommentsAdmin', source)
        self.assertIn('createInquiryCommentAdmin', source)
        self.assertIn('activeInquiryId', source)
        self.assertIn('commentBody.textContent = comment.body', source)
        self.assertIn('commentMeta.textContent =', source)
        self.assertNotIn('commentBody.innerHTML', source)
        self.assertIn('댓글을 저장하지 못했습니다.', source)
        self.assertIn('inquiryCommentSubmitGeneration', source)
        self.assertIn('inquiryCommentSubmitting', source)
        self.assertIn('isCurrentInquiryCommentSubmit(submitGeneration, inquiryId)', source)
        self.assertIn('if (inquiryCommentSubmitting) return;', source)
        self.assertIn('inquiryCommentInput.value === submittedInputValue', source)

    def test_backend_adapter_exposes_only_list_and_append_comment_operations(self):
        source = (PUBLIC / 'js' / 'services' / 'backendAdapter.js').read_text(encoding='utf-8')
        self.assertIn('export async function listInquiryCommentsAdmin', source)
        self.assertIn('export async function createInquiryCommentAdmin', source)
        self.assertIn(".from('inquiry_comments')", source)
        self.assertIn(".select('id,inquiry_id,body,author_id,created_at')", source)
        self.assertIn(".order('created_at', { ascending: true })", source)
        self.assertIn(".insert([{ inquiry_id: inquiryId, body: normalizedBody }])", source)
        self.assertIn("if (!normalizedBody || normalizedBody.length > 1000)", source)
        self.assertNotIn('updateInquiryComment', source)
        self.assertNotIn('deleteInquiryComment', source)


if __name__ == '__main__':
    unittest.main()
