import tempfile
import unittest
from pathlib import Path
from scripts.card_factory.store import CardStore, FactoryError
from test_store import identity


class ScannerStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.front, self.back = self.root/'front.jpg', self.root/'back.jpg'
        self.front.write_bytes(b'front'); self.back.write_bytes(b'back')
        self.store = CardStore(self.root/'cards.sqlite3')
        self.payload = dict(source_key='capture-one',card_type='pokemon',front_image_path=str(self.front),
                            back_image_path=str(self.back),identification={'status':'unknown','fields':{}},
                            on_hand=2,listed=1)
    def tearDown(self):
        self.store.close(); self.tmp.cleanup()
    def stage(self, **kw):
        return self.store.stage_card(self.payload, fields=identity()['fields'], note='Checked both images',
                                     actor='verified-user', request_id='save-one', verified=True, **kw)
    def test_explicit_verification_preserves_model_result(self):
        card = self.stage()
        self.assertEqual(card['original_identification']['status'], 'unknown')
        self.assertEqual(card['status'], 'identified')
        self.assertEqual(card['verification']['outcome'], 'verified')
        self.assertEqual(card['verification']['actor'], 'verified-user')
        self.assertEqual(card['available'], 1)
        self.assertIsNotNone(card['collection_id'])
    def test_save_retry_has_single_card_and_correction(self):
        a,b = self.stage(),self.stage()
        self.assertEqual(a['id'], b['id'])
        self.assertEqual(len(b['review_history']),1)
        self.assertEqual(len(self.store.list_cards()),1)
    def test_changed_idempotency_payload_is_rejected(self):
        self.stage(); self.payload['on_hand']=5
        with self.assertRaises(FactoryError): self.stage()
    def test_invalid_review_rolls_back_entire_save(self):
        with self.assertRaises(FactoryError):
            self.store.stage_card(self.payload,fields={},note='Checked',actor='user',request_id='invalid',verified=True)
        self.assertEqual(self.store.list_cards(),[])
    def test_unverified_corrections_never_become_trusted_lessons(self):
        self.store.stage_card(self.payload,fields=identity()['fields'],note='Tentative',actor='user',request_id='draft',verified=False)
        self.assertEqual(self.store.learning_lessons(),[])
    def test_verified_lesson_is_not_automatically_trusted(self):
        self.stage()
        lesson=self.store.learning_lessons()[0]
        self.assertEqual(lesson['verification_outcome'],'verified')
        self.assertEqual(lesson['promotion_status'],'pending_regression')
        self.assertIsNone(lesson['test_result'])
        self.assertEqual(lesson['original']['status'],'unknown')
    def test_binder_page_location(self):
        binder=self.store.add_location('Binder A','binder')
        page=self.store.add_location('Page 2','binder_page',binder['id'])
        self.assertEqual(page['parent_id'],binder['id'])
    def test_manual_collection_reassignment_audited(self):
        a=self.stage()
        self.front.write_bytes(b'other'); self.payload['source_key']='other'
        other=self.store.add_card({**self.payload,'identification':identity(edition='First edition')})
        updated=self.store.reassign_collection(a['id'],other['collection_id'],'Owner selected collection','user')
        self.assertEqual(updated['collection_id'],other['collection_id'])
        self.assertEqual(updated['review_history'][-1]['action'],'collection_reassignment')

    def test_later_correction_preserves_original_and_both_events(self):
        first=self.stage()
        corrected=identity()['fields'];corrected['player']='Corrected character'
        card=self.store.stage_card(self.payload,fields=corrected,note='Corrected name',actor='verified-user',request_id='second-review',verified=True)
        self.assertEqual(card['id'],first['id'])
        self.assertEqual(len(card['review_history']),2)
        self.assertEqual(card['original_identification']['status'],'unknown')
        self.assertEqual(card['identification']['fields']['player'],'Corrected character')
    def test_cli_correction_clears_previous_scanner_verification(self):
        first=self.stage()
        updated=self.store.review_card(first['id'],identity(),'CLI correction')
        self.assertNotEqual(updated['verification'].get('outcome'),'verified')
