import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.card_factory.store import CardStore, FactoryError


def identity(card_type='pokemon', **overrides):
    fields = dict(cardGame='Pokémon' if card_type == 'pokemon' else None,
                  sport=None if card_type == 'pokemon' else card_type,
                  player='Example Card', set='Example Set', cardNumber='001',
                  manufacturer='Example Manufacturer', year='2024',
                  team='Example', parallel='Base', edition='Unlimited')
    fields.update(overrides)
    return dict(status='confirmed', confidenceScore=100, fields=fields,
                candidates=[], evidence={'frontOcrText': 'Example Card 001',
                                         'backOcrText': 'Example Set 2024'})


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.front = self.root / 'front.jpg'
        self.back = self.root / 'back.jpg'
        self.front.write_bytes(b'front-test-fixture')
        self.back.write_bytes(b'back-test-fixture')
        self.path = self.root / 'factory.sqlite3'
        self.store = CardStore(self.path)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def payload(self, **overrides):
        data = dict(source_key='scan-001', card_type='pokemon',
                    front_image_path=str(self.front), back_image_path=str(self.back),
                    identification=identity(), on_hand=1, listed=0,
                    evidence_sources=[{'kind': 'user-import', 'reference': 'scan-001'}])
        data.update(overrides)
        return data

    def test_schema_and_persistence(self):
        card = self.store.add_card(self.payload())
        self.store.close()
        self.store = CardStore(self.path)
        self.assertEqual(self.store.get_card(card['id'])['id'], card['id'])
        names = {r[0] for r in self.store.db.execute("select name from sqlite_master where type='table'")}
        self.assertTrue({'cards', 'collections', 'physical_locations'} <= names)
        self.assertEqual(self.store.db.execute('pragma integrity_check').fetchone()[0], 'ok')

    def test_identified_card_assigns_collection_and_set(self):
        card = self.store.add_card(self.payload())
        self.assertEqual(card['status'], 'identified')
        self.assertEqual(card['set_name'], 'Example Set')
        self.assertEqual(card['division'], 'Pokémon')
        self.assertEqual(card['variant'], 'Base')
        self.assertIsNotNone(card['collection_id'])
        self.assertEqual(card['price_history'], [])
        self.assertEqual(card['evidence_sources'][0]['kind'], 'user-import')

    def test_supported_types(self):
        for kind in ['pokemon', 'baseball', 'basketball', 'football', 'hockey', 'soccer', 'racing']:
            with self.subTest(kind=kind):
                self.front.write_bytes(kind.encode())
                c = self.store.add_card(self.payload(source_key=kind, card_type=kind, identification=identity(kind)))
                self.assertEqual(c['card_type'], kind)
                self.assertEqual(c['division'], 'Pokémon' if kind == 'pokemon' else 'Sports Cards')

    def test_unknown_is_needs_review_without_assignment(self):
        c = self.store.add_card(self.payload(identification={'status': 'unknown', 'fields': {}}))
        self.assertEqual(c['status'], 'needs-review')
        self.assertIsNone(c['collection_id'])
        self.assertIsNone(c['set_name'])

    def test_likely_remains_reviewable(self):
        result = identity()
        result['status'] = 'likely'
        c = self.store.add_card(self.payload(identification=result))
        self.assertEqual(c['status'], 'needs-review')
        self.assertIsNone(c['collection_id'])

    def test_claimed_confidence_cannot_override_missing_identity(self):
        c = self.store.add_card(self.payload(identification=identity(set=None, cardNumber=None)))
        self.assertEqual(c['status'], 'needs-review')

    def test_conflicting_card_type_cannot_assign(self):
        c = self.store.add_card(self.payload(card_type='baseball'))
        self.assertEqual(c['status'], 'needs-review')
        self.assertIsNone(c['collection_id'])

    def test_conflicting_evidence_cannot_assign(self):
        result = identity()
        result['evidence']['frontBackTextConflict'] = True
        self.assertEqual(self.store.add_card(self.payload(identification=result))['status'], 'needs-review')

    def test_malformed_identity_rejected(self):
        with self.assertRaises(FactoryError):
            self.store.add_card(self.payload(identification=identity(set={'guess': 'bad'})))

    def test_retries_idempotent_without_incrementing_stock(self):
        first = self.store.add_card(self.payload())
        second = self.store.add_card(self.payload())
        self.assertEqual(first['id'], second['id'])
        self.assertEqual(len(self.store.list_cards()), 1)
        self.assertEqual(second['on_hand'], 1)

    def test_changed_retry_cannot_overwrite(self):
        self.store.add_card(self.payload())
        with self.assertRaises(FactoryError):
            self.store.add_card(self.payload(on_hand=2))
        self.assertEqual(self.store.list_cards()[0]['on_hand'], 1)

    def test_same_photos_flag_duplicate_but_distinct_copies_allowed(self):
        first = self.store.add_card(self.payload())
        with self.assertRaises(FactoryError):
            self.store.add_card(self.payload(source_key='scan-002'))
        self.front.write_bytes(b'different-physical-copy')
        second = self.store.add_card(self.payload(source_key='scan-002'))
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['collection_id'], second['collection_id'])

    def test_counts_constrained(self):
        for changes in [dict(on_hand=-1), dict(listed=2), dict(listed=-1),
                        dict(on_hand=1.2), dict(on_hand=True)]:
            with self.subTest(changes=changes), self.assertRaises(FactoryError):
                self.store.add_card(self.payload(**changes))

    def test_location_hierarchy_and_stock_updates(self):
        box = self.store.add_location('Box A', 'box')
        row = self.store.add_location('Row 1', 'row', box['id'])
        card = self.store.add_card(self.payload(location_id=row['id'], on_hand=3))
        updated = self.store.update_stock(card['id'], on_hand=3, listed=2, location_id=box['id'])
        self.assertEqual(updated['listed'], 2)
        self.assertEqual(updated['location_id'], box['id'])
        self.assertEqual(len(self.store.list_locations()), 2)
        self.assertEqual(self.store.add_location('Box A', 'box')['id'], box['id'])
        with self.assertRaises(FactoryError):
            self.store.update_stock(card['id'], on_hand=1, listed=2)
        self.assertEqual(self.store.get_card(card['id'])['on_hand'], 3)

    def test_invalid_location_missing_photo_and_unsupported_type(self):
        for changes in [dict(location_id='missing'), dict(front_image_path='/missing'),
                        dict(card_type='magic'), dict(source_key=''),
                        dict(front_image_path=str(self.root))]:
            with self.subTest(changes=changes), self.assertRaises(FactoryError):
                self.store.add_card(self.payload(**changes))
        self.assertEqual(self.store.list_cards(), [])

    def test_money_is_exact_and_unknown_stays_null(self):
        card = self.store.add_card(self.payload(seller_price='12.34'))
        self.assertEqual(card['seller_price_cents'], 1234)
        for value in ['NaN', 'Infinity', '-1', '1.234', True, '100000000']:
            with self.subTest(value=value), self.assertRaises(FactoryError):
                self.store.set_seller_price(card['id'], value)
        self.store.set_seller_price(card['id'], None)
        self.assertIsNone(self.store.get_card(card['id'])['seller_price_cents'])

    def test_explicit_review_preserves_original(self):
        c = self.store.add_card(self.payload(identification={'status': 'unknown', 'fields': {}}))
        updated = self.store.review_card(c['id'], identity(), 'Owner checked front and back')
        self.assertEqual(updated['status'], 'identified')
        self.assertEqual(updated['original_identification']['status'], 'unknown')
        self.assertEqual(updated['review_history'][0]['note'], 'Owner checked front and back')

    def test_edition_and_year_do_not_merge_collections(self):
        first = self.store.add_card(self.payload())
        self.front.write_bytes(b'another-edition')
        second = self.store.add_card(self.payload(source_key='other', identification=identity(edition='First Edition')))
        self.assertNotEqual(first['collection_id'], second['collection_id'])

    def test_evidence_must_be_structured(self):
        with self.assertRaises(FactoryError):
            self.store.add_card(self.payload(evidence_sources='unsupported'))

    def test_sports_card_game_label_is_supported(self):
        card = self.store.add_card(self.payload(card_type='baseball',
            identification=identity('baseball', cardGame='Sports Cards')))
        self.assertEqual(card['status'], 'identified')

    def test_list_read_does_not_create_unknown_prices(self):
        card = self.store.add_card(self.payload())
        self.assertEqual(self.store.get_card(card['id'])['price_history'], [])

    def test_raw_sql_still_enforces_counts(self):
        card = self.store.add_card(self.payload())
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.db.execute('update cards set listed=5 where id=?', (card['id'],))
        self.store.db.rollback()


if __name__ == '__main__':
    unittest.main()
