from pathlib import Path
import unittest


class ExternalInquiryReceiptSurfaceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).parents[1]
        cls.index = (root / 'index.html').read_text(encoding='utf-8')
        cls.privacy = (root / 'privacy.html').read_text(encoding='utf-8')
        cls.adapter = (root / 'js' / 'services' / 'inquiryReceiptAdapter.js').read_text(encoding='utf-8')

    def test_home_explains_current_and_historical_interest_activity(self):
        self.assertIn('data-external-inquiry-receipts', self.index)
        self.assertIn('지금 고객들이 관심 있게 보고 있는 매물입니다', self.index)
        self.assertIn('현재는 직방 문의 중 공개 가능한 기록만 표시합니다', self.index)
        self.assertIn('비공개 채널 문의는 이 숫자에 포함하지 않습니다', self.index)
        self.assertIn('최근 24시간은 1시간 단위', self.index)
        self.assertIn('지난 기록은 접수 날짜만', self.index)
        self.assertIn('고객 이름·연락처·문의 내용·가격은 공개하지 않습니다', self.index)
        self.assertIn('js/homeInquiryReceipts.js', self.index)

    def test_public_adapter_uses_fixed_safe_activity_rpc(self):
        self.assertIn("rpc('get_external_inquiry_activity')", self.adapter)
        self.assertNotIn(".from('external_inquiry_receipts')", self.adapter)
        self.assertNotIn('source_message_hash', self.adapter)

    def test_privacy_policy_names_owner_and_describes_actual_processing(self):
        self.assertIn('개인정보 보호책임자: 서준혁', self.privacy)
        self.assertIn('개인정보 보호책임자 서준혁', self.index)
        self.assertIn('고객 이름·전화번호·이메일·연락처 확인 링크·문의 원문은 전송하지 않습니다', self.privacy)
        self.assertIn('거래유형(전세·월세·매매)', self.privacy)
        self.assertIn('가격·고객 식별정보·상세 문의 내용은 저장·공개하지 않습니다', self.privacy)
        self.assertIn('최근 1년 동안 공개', self.privacy)
        self.assertIn('24시간이 지난 기록은 접수 날짜만 공개', self.privacy)
        self.assertNotIn('개인정보 보호책임자 정보는 확인 후 반영', self.privacy)
        self.assertNotIn('개인정보 보호책임자 정보는 확인 후 반영', self.index)


if __name__ == '__main__':
    unittest.main()
