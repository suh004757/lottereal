-- Market Trend Report Tables for Supabase
-- Created: 2025-01-15

-- ====================
-- TABLE: market_reports
-- ====================
CREATE TABLE IF NOT EXISTS public.market_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  report_md TEXT NOT NULL,
  evidence_json JSONB,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  view_count INTEGER DEFAULT 0,
  metadata JSONB
);

-- Index for fast lookups
CREATE INDEX idx_market_reports_slug ON public.market_reports(slug);
CREATE INDEX idx_market_reports_status ON public.market_reports(status);
CREATE INDEX idx_market_reports_updated_at ON public.market_reports(updated_at DESC);

-- ====================
-- TABLE: report_revisions (Optional)
-- ====================
CREATE TABLE IF NOT EXISTS public.report_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES public.market_reports(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  diff_json JSONB,
  edited_by UUID REFERENCES auth.users(id),
  edited_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  summary TEXT
);

-- Index for revision history
CREATE INDEX idx_report_revisions_report_id ON public.report_revisions(report_id);
CREATE INDEX idx_report_revisions_edited_at ON public.report_revisions(edited_at DESC);

-- ====================
-- ROW LEVEL SECURITY POLICIES
-- ====================

-- Enable RLS
ALTER TABLE public.market_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_revisions ENABLE ROW LEVEL SECURITY;

-- Public read access for published reports
CREATE POLICY "Public can view published reports"
  ON public.market_reports
  FOR SELECT
  USING (status = 'published');

-- Admin/authenticated users can view all reports
CREATE POLICY "Authenticated users can view all reports"
  ON public.market_reports
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role or admin users can insert/update/delete
CREATE POLICY "Service role can manage reports"
  ON public.market_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users with admin role can manage (optional - requires role setup)
-- CREATE POLICY "Admin users can manage reports"
--   ON public.market_reports
--   FOR ALL
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM auth.users
--       WHERE id = auth.uid()
--       AND raw_user_meta_data->>'role' = 'admin'
--     )
--   )
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM auth.users
--       WHERE id = auth.uid()
--       AND raw_user_meta_data->>'role' = 'admin'
--     )
--   );

-- Revisions: Admins only
CREATE POLICY "Authenticated users can view revisions"
  ON public.report_revisions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage revisions"
  ON public.report_revisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- FUNCTIONS
-- ====================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_market_reports_updated_at
  BEFORE UPDATE ON public.market_reports
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

-- Increment view count
CREATE OR REPLACE FUNCTION increment_report_view_count(report_slug TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.market_reports
  SET view_count = view_count + 1
  WHERE slug = report_slug AND status = 'published';
END;
$$ LANGUAGE 'plpgsql' SECURITY DEFINER;

-- ====================
-- SAMPLE DATA (Optional)
-- ====================

-- Insert sample report
INSERT INTO public.market_reports (slug, title, summary, report_md, evidence_json, status)
VALUES (
  '2025-01-market-report',
  '2025년 1월 서울 부동산 시장 트렌드 리포트',
  '서울 주요 지역의 실거래 데이터, 정책 변화, 시장 신호를 종합 분석한 참고 자료입니다.',
  '## 1. 거시 환경 (Macro)

### 금리 및 정책 동향

최근 3개월간 한국은행 기준금리는 **3.50%에서 동결**된 상태를 유지하고 있습니다...

(Full markdown content here)',
  '[
    {
      "name": "국토교통부 실거래가 공개시스템",
      "url": "https://rt.molit.go.kr",
      "coverage": "서울 전역 아파트 실거래 데이터",
      "fetchedAt": "2025-01-15"
    }
  ]'::jsonb,
  'published'
)
ON CONFLICT (slug) DO NOTHING;

-- Insert sample revision
INSERT INTO public.report_revisions (report_id, version, summary)
SELECT
  id,
  '1.0',
  '2025년 1월 리포트 최초 작성 및 발행'
FROM public.market_reports
WHERE slug = '2025-01-market-report'
ON CONFLICT DO NOTHING;

-- ====================
-- NOTES
-- ====================

-- To use this in Supabase:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Create a new query
-- 3. Paste this entire file
-- 4. Click "Run"

-- Admin user setup (if not using service role):
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"admin"')
-- WHERE email = 'your-admin@email.com';
