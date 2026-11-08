import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from test_store import identity
from test_feed import TENANT
from scripts.card_factory.store import ROOT


class CliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / 'factory.sqlite3'

    def tearDown(self):
        self.temp.cleanup()

    def run_cli(self, *args):
        env = {k:v for k,v in os.environ.items() if not k.startswith(('SUPABASE_', 'EBAY_', 'PRICECHARTING_', 'BOSS_'))}
        return subprocess.run(['python', '-m', 'scripts.card_factory', '--db', str(self.db), *args],
                              cwd=ROOT, env=env, capture_output=True, text=True)

    def test_help_and_init(self):
        help_result = self.run_cli('--help')
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertFalse(self.db.exists())
        initialized = self.run_cli('init')
        self.assertEqual(initialized.returncode, 0, initialized.stderr)
        self.assertTrue(self.db.exists())

    def test_local_end_to_end_no_credentials(self):
        self.run_cli('init')
        location = self.run_cli('location-add', '--name', 'Binder A', '--kind', 'binder')
        self.assertEqual(location.returncode, 0, location.stderr)
        loc_id = json.loads(location.stdout)['id']
        front, back = self.root / 'front.jpg', self.root / 'back.jpg'
        front.write_bytes(b'front-test')
        back.write_bytes(b'back-test')
        payload = dict(source_key='cli-test', card_type='pokemon', front_image_path=str(front),
                       back_image_path=str(back), identification=identity(), location_id=loc_id)
        src = self.root / 'card.json'
        src.write_text(json.dumps(payload))
        added = self.run_cli('add', '--input', str(src))
        self.assertEqual(added.returncode, 0, added.stderr)
        card = json.loads(added.stdout)
        priced = self.run_cli('seller-price', '--id', card['id'], '--amount', '7.50')
        self.assertEqual(priced.returncode, 0, priced.stderr)
        quote = self.run_cli('price', '--id', card['id'])
        self.assertEqual(quote.returncode, 0, quote.stderr)
        self.assertEqual(json.loads(quote.stdout)['price_history'][0]['verification'], 'unavailable')
        exported = self.run_cli('export', '--tenant-id', TENANT, '--output', str(self.root / 'exports'))
        self.assertEqual(exported.returncode, 0, exported.stderr)
        result = json.loads(exported.stdout)
        checked = self.run_cli('validate-feed', '--input', result['products_path'])
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(json.loads(checked.stdout)['rows_checked'], 1)
        self.assertEqual(len(json.loads(self.run_cli('list').stdout)), 1)

    def test_schema_check_without_db_or_credentials(self):
        result = self.run_cli('check-schema')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.db.exists())
        self.assertFalse(json.loads(result.stdout)['live_verified'])
        live = self.run_cli('check-schema', '--live')
        self.assertNotEqual(live.returncode, 0)
        self.assertFalse(self.db.exists())

    def test_invalid_input_returns_error_not_traceback(self):
        src = self.root / 'bad.json'
        src.write_text('{bad')
        result = self.run_cli('add', '--input', str(src))
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('Traceback', result.stderr)


if __name__ == '__main__':
    unittest.main()
