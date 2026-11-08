import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.card_factory.feed import export_feed, validate_product_rows
from scripts.card_factory.schema import check_repository_schema, check_live_schema
from scripts.card_factory.store import CardStore, FactoryError
from test_store import identity

TENANT = '11111111-2222-4333-8444-555555555555'  # synthetic test tenant, never used remotely


class FeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.front, self.back = self.root / 'front.jpg', self.root / 'back.jpg'
        self.front.write_bytes(b'front')
        self.back.write_bytes(b'back')
        self.store = CardStore(self.root / 'factory.sqlite3')
        self.data = dict(source_key='sample', card_type='pokemon', front_image_path=str(self.front),
                         back_image_path=str(self.back), identification=identity(), seller_price='12.34',
                         on_hand=2, listed=1)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def export(self):
        return export_feed(self.store, self.root / 'exports', TENANT)

    def test_exact_products_shape_with_separate_metadata(self):
        card = self.store.add_card(self.data)
        result = self.export()
        rows = json.loads(Path(result['products_path']).read_text())
        row = rows[0]
        self.assertEqual(row['sku'], 'CF-' + card['id'])
        self.assertEqual(row['tenant_id'], TENANT)
        self.assertEqual(row['price'], 12.34)
        self.assertEqual(row['quantity'], 2)  # posted stock remains physically on hand
        self.assertEqual(row['status'], 'draft')
        self.assertFalse(row['published'])
        self.assertIsNone(row['image_url'])  # never fake an https URL from a local path
        self.assertNotIn('location_id', row)
        meta = json.loads(Path(result['metadata_path']).read_text())
        self.assertEqual(meta['cards'][0]['front_image_path'], str(self.front))
        self.assertEqual(meta['cards'][0]['listed'], 1)
        self.assertEqual(meta['price_semantics'], 'seller-set asking price, not verified market value')
        self.assertFalse(meta['production_written'])
        self.assertEqual(validate_product_rows(rows)['rows_checked'], 1)

    def test_unknown_price_withheld_not_zero(self):
        self.data['seller_price'] = None
        self.store.add_card(self.data)
        result = self.export()
        self.assertEqual(json.loads(Path(result['products_path']).read_text()), [])
        self.assertIn('seller-price-required', result['pending'][0]['reasons'])

    def test_unknown_identity_withheld(self):
        self.data['identification'] = {'status': 'unknown', 'fields': {}}
        self.store.add_card(self.data)
        self.assertIn('needs-review', self.export()['pending'][0]['reasons'])

    def test_repeat_export_stable_sku_new_bundle_no_overwrite(self):
        self.store.add_card(self.data)
        a, b = self.export(), self.export()
        self.assertNotEqual(a['products_path'], b['products_path'])
        self.assertEqual(Path(a['products_path']).read_bytes(), Path(b['products_path']).read_bytes())
        self.assertEqual(len(self.store.list_cards()), 1)

    def test_invalid_tenant_rejected(self):
        for tenant in ['', 'main', None, '00000000-0000-0000-0000-000000000000']:
            with self.subTest(tenant=tenant), self.assertRaises(FactoryError):
                export_feed(self.store, self.root / 'exports', tenant)

    def test_row_validation_rejects_unknown_columns_duplicates_bad_types(self):
        self.store.add_card(self.data)
        result = self.export()
        rows = json.loads(Path(result['products_path']).read_text())
        for mutation in [dict(secret='no'), dict(price=None), dict(quantity=-1), dict(quantity=True),
                         dict(price=1.234), dict(published=True), dict(source='ebay'), dict(status='active'),
                         dict(image_url='/local/file.jpg'), dict(tenant_id='bad')]:
            with self.subTest(mutation=mutation), self.assertRaises(FactoryError):
                validate_product_rows([{**rows[0], **mutation}])
        with self.assertRaises(FactoryError):
            validate_product_rows(rows + rows)

    def test_local_schema_check_identifies_actual_contract(self):
        result = check_repository_schema()
        self.assertEqual(result['target_table'], 'public.products')
        self.assertEqual(result['mode'], 'repository-only')
        self.assertFalse(result['live_verified'])
        self.assertTrue({'sku','title','price','quantity','tenant_id'} <= set(result['columns']))
        self.assertEqual(result['unique_key'], ['tenant_id','sku'])

    def test_schema_drift_fails_closed(self):
        from scripts.card_factory.store import ROOT
        repo = self.root / 'repo'
        dst = repo / 'supabase/migrations'
        dst.mkdir(parents=True)
        for path in (ROOT / 'supabase/migrations').glob('*.sql'):
            (dst / path.name).write_bytes(path.read_bytes())
        p = dst / '0001_init_inventory.sql'
        p.write_text(p.read_text().replace('price             numeric(10, 2)', 'cost              numeric(10, 2)'))
        with self.assertRaises(FactoryError):
            check_repository_schema(repo)

    def test_live_check_missing_env_does_not_connect(self):
        with patch.dict('os.environ', {}, clear=True), patch('urllib.request.OpenerDirector.open') as opened:
            with self.assertRaises(FactoryError):
                check_live_schema()
            opened.assert_not_called()

    def test_price_history_never_promotes_unverified_price(self):
        c = self.store.add_card(self.data)
        quote = dict(provider='ebay', market=18.25, status='provider_estimate',
                     fetchedAt='2026-11-04T12:00:00Z', confidenceScore=80,
                     matchedListing={'itemId':'synthetic-1'}, explanation='Asking price')
        self.store.record_price(c['id'], quote)
        self.store.record_price(c['id'], {**quote, 'market': None, 'status': 'insufficient'})
        updated = self.store.get_card(c['id'])
        self.assertEqual(len(updated['price_history']), 2)
        self.assertEqual(updated['price_history'][0]['verification'], 'unverified')
        self.assertEqual(updated['price_history'][0]['amount_cents'], 1825)
        self.assertEqual(updated['price_history'][1]['verification'], 'unavailable')
        self.assertEqual(updated['seller_price_cents'], 1234)
        self.assertEqual(updated['price_history'][0]['identity_snapshot']['fields']['cardNumber'], '001')

    def test_claimed_verified_provider_price_still_unverified(self):
        c = self.store.add_card(self.data)
        self.store.record_price(c['id'], dict(provider='ebay', market=10, status='verified_sales', confidenceScore=100))
        self.assertEqual(self.store.get_card(c['id'])['price_history'][0]['verification'], 'unverified')

    def test_bad_price_cannot_enter_history(self):
        c = self.store.add_card(self.data)
        for amount in [-1, float('nan'), float('inf'), 'invented']:
            with self.subTest(amount=amount), self.assertRaises(FactoryError):
                self.store.record_price(c['id'], dict(provider='ebay', market=amount))

    def test_price_for_needs_review_blocked_before_adapter(self):
        self.data['identification'] = {'status': 'unknown', 'fields': {}}
        c = self.store.add_card(self.data)
        with patch('scripts.card_factory.store.adapter') as call:
            with self.assertRaises(FactoryError):
                self.store.refresh_price(c['id'])
            call.assert_not_called()

    def test_missing_images_at_export_go_pending(self):
        self.store.add_card(self.data)
        self.back.unlink()
        self.assertIn('image-file-missing', self.export()['pending'][0]['reasons'])

    def test_replaced_images_cannot_reuse_old_identity_in_feed(self):
        self.store.add_card(self.data)
        self.front.write_bytes(b'different-image')
        self.assertIn('image-content-changed', self.export()['pending'][0]['reasons'])

    def test_export_detects_schema_required_column_and_type_changes(self):
        from scripts.card_factory.store import ROOT
        repo = self.root / 'repo-drift'
        dst = repo / 'supabase/migrations'
        dst.mkdir(parents=True)
        for path in (ROOT / 'supabase/migrations').glob('*.sql'):
            (dst / path.name).write_bytes(path.read_bytes())
        p = dst / '9999_drift.sql'
        p.write_text('alter table public.products add column if not exists required_new text not null;')
        with self.assertRaises(FactoryError):
            check_repository_schema(repo)
        p.write_text('alter table public.products alter column price type text;')
        with self.assertRaises(FactoryError):
            check_repository_schema(repo)

    def test_schema_read_only_http_method_and_secret_redaction(self):
        import io
        import urllib.error
        with patch.dict('os.environ', {'SUPABASE_URL':'https://example.supabase.co',
                                      'SUPABASE_SERVICE_ROLE_KEY':'test-secret-only'}, clear=True):
            with patch('urllib.request.OpenerDirector.open', side_effect=urllib.error.HTTPError(
                    'https://example.supabase.co', 401, 'Unauthorized', {}, io.BytesIO(b'test-secret-only'))) as call:
                with self.assertRaises(FactoryError) as error:
                    check_live_schema()
                self.assertEqual(call.call_args.args[0].get_method(), 'GET')
                self.assertNotIn('test-secret-only', str(error.exception))


if __name__ == '__main__':
    unittest.main()
