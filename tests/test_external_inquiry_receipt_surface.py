from pathlib import Path
import unittest


class ExternalInquiryReceiptSurfaceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).parents[1]
        cls.index = (root / 'index.html').read_text(encoding='utf-8')
        cls.privacy = (root / 'privacy.html').read_text(encoding='utf-8')
        cls.adapter = (root / 'js' / 'services' / 'inquiryReceiptAdapter.js').read_text(encoding='utf-8')

    def test_home_discloses_limited_24_hour_receipt_status(self):
        self.assertIn('data-external-inquiry-receipts', self.index)
        self.assertIn('매물번호와 접수 시간대', self.index)
        self.assertIn('고객 이름·연락처·문의 내용은 공개하지 않습니다', self.index)
        self.assertIn('24시간 후 자동으로 숨겨집니다', self.index)
        self.assertIn('js/homeInquiryReceipts.js', self.index)

    def test_public_adapter_requests_only_granted_columns(self):
        self.assertIn(
            "select('source, listing_number, received_hour, status, expires_at')",
            self.adapter,
        )
        self.assertNotIn('source_message_hash', self.adapter)

    def test_privacy_policy_names_owner_and_describes_actual_processing(self):
        self.assertIn('개인정보 보호책임자: 서준혁', self.privacy)
        self.assertIn('개인정보 보호책임자 서준혁', self.index)
        self.assertIn('고객 이름·전화번호·이메일·연락처 확인 링크·문의 원문은 전송하지 않습니다', self.privacy)
        self.assertIn('24시간 후 자동으로 숨깁니다', self.privacy)
        self.assertNotIn('개인정보 보호책임자 정보는 확인 후 반영', self.privacy)
        self.assertNotIn('개인정보 보호책임자 정보는 확인 후 반영', self.index)


if __name__ == '__main__':
    unittest.main()
