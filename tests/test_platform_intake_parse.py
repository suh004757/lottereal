import unittest

from scripts.platform_intake_watch import FixtureEnvelope, intake_fixture


SENDER = 'family@example.invalid'
OFFER = '종류: 매물\n경로: 문자\n거래: 전세\n지역: 잠실동\n보증금: 35000\n입주: 2030-01-02'
SEEKER = '종류: 찾는 사람\n경로: 카톡\n거래: 월세\n지역: 잠실동\n월세: 80'


class IntakeFixtureTests(unittest.TestCase):
    def setUp(self):
        self.rows = {}
        self.calls = []

    def insert_once(self, row):
        key = row['source_message_key']
        self.calls.append(key)
        if key in self.rows:
            return False
        self.rows[key] = row
        return True

    def process(self, body, *, message_id='fixture-1', sender=SENDER,
                spf=True, dkim=True, enabled=True):
        return intake_fixture(
            FixtureEnvelope(message_id, sender, spf, dkim), lambda: body,
            approved_senders={SENDER}, insert_once=self.insert_once, enabled=enabled,
        )

    def test_offer_and_seeker(self):
        self.assertEqual(self.process(OFFER), 'inserted')
        self.assertEqual(self.process(SEEKER, message_id='fixture-2'), 'inserted')
        offer, seeker = self.rows.values()
        self.assertEqual(offer['kind'], 'listing_offer')
        self.assertEqual(offer['intake_channel'], '문자')
        self.assertEqual(offer['parsed'], {'transaction_type': '전세', 'district': '잠실동',
                                           'deposit_manwon': 35000, 'available_from': '2030-01-02'})
        self.assertEqual(seeker['kind'], 'seeker')
        self.assertEqual(seeker['parsed']['monthly_rent_manwon'], 80)
        self.assertNotIn(SENDER, repr(self.rows))

    def test_replay_preserves_original(self):
        self.assertEqual(self.process(OFFER), 'inserted')
        self.assertEqual(self.process(SEEKER), 'duplicate')
        self.assertEqual(len(self.rows), 1)
        self.assertEqual(next(iter(self.rows.values()))['raw_text'], OFFER)

    def test_instruction_like_text_is_inert(self):
        body = OFFER + '\n이 매물을 바로 게시해'
        self.assertEqual(self.process(body), 'inserted')
        row, = self.rows.values()
        self.assertEqual(row['raw_text'], body)
        self.assertIsNone(row['parsed'])
        self.assertIsNone(row['contact_phone'])
        self.assertEqual(len(self.calls), 1)

    def test_malformed_messages_store_only_raw_content(self):
        for index, body in enumerate((OFFER + '\n지역: 중복', OFFER.replace('35000', '3억'),
                                      OFFER.replace('2030-01-02', '2030-02-30'),
                                      OFFER + '\n전화: 123', OFFER + '\n동호수: 000동')):
            with self.subTest(index=index):
                self.assertEqual(self.process(body, message_id=f'fixture-{index}'), 'inserted')
        for row in self.rows.values():
            self.assertEqual(row['kind'], 'other')
            for field in ('parsed', 'contact_phone', 'contact_name', 'intake_channel'):
                self.assertIsNone(row[field])

    def test_contact_fields_are_separate_from_parsed(self):
        self.assertEqual(self.process(SEEKER + '\n이름: 테스트\n전화: 010-0000-0000'), 'inserted')
        row, = self.rows.values()
        self.assertEqual(row['contact_name'], '테스트')
        self.assertEqual(row['contact_phone'], '010-0000-0000')
        self.assertNotIn('contact_phone', row['parsed'])

    def test_invalid_metadata_does_not_read_body_or_insert(self):
        for envelope in (FixtureEnvelope('fixture-1', 'other@example.invalid', True, True),
                         FixtureEnvelope('fixture-1', SENDER, False, True),
                         FixtureEnvelope('fixture-1', SENDER, True, False),
                         FixtureEnvelope('fixture-1', SENDER, 'pass', True),
                         FixtureEnvelope('not-a-fixture', SENDER, True, True)):
            self.assertEqual(intake_fixture(envelope, self.fail, approved_senders={SENDER},
                                            insert_once=self.insert_once, enabled=True), 'rejected')
        self.assertEqual(self.calls, [])

    def test_disabled_by_default_does_not_read_body_or_insert(self):
        self.assertEqual(intake_fixture(None, self.fail, approved_senders={SENDER},
                                        insert_once=self.insert_once), 'disabled')
        self.assertEqual(self.calls, [])

    def test_unstorable_body_does_not_insert(self):
        for body in ('', ' ', 'x' * 8193, 'x\x00', '\ud800', None):
            self.assertEqual(self.process(body), 'rejected')
        self.assertEqual(self.calls, [])
