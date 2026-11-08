"""Phase 1B: disposable synthetic fixtures ONLY; never open configured owner stores.
Fixture setup deliberately writes temporary databases. Projection assertions do not.
"""
import ast
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.card_factory import commercial_readonly as projection

TENANT = '11111111-1111-4111-8111-111111111111'
OTHER_TENANT = '99999999-9999-4999-8999-999999999999'
USER = '22222222-2222-4222-8222-222222222222'
ITEM = '33333333-3333-4333-8333-333333333333'
CAPTURE = '44444444-4444-4444-8444-444444444444'
OTHER_ITEM = '55555555-5555-4555-8555-555555555555'
STAMP = '2026-01-01T00:00:00+00:00'
# Synthetic raster signatures, not identification acceptance images.
FRONT = b'\x89PNG\r\n\x1a\n' + b'F' * 32
BACK = b'\x89PNG\r\n\x1a\n' + b'B' * 32

def encode(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def fixture(root, tenant=TENANT, item=ITEM, schema_transform=lambda value: value):
    directory = Path(root) / tenant
    capture = directory / 'captures' / CAPTURE
    capture.mkdir(parents=True)
    (capture / 'front').write_bytes(FRONT)
    (capture / 'back').write_bytes(BACK)
    images = {side: dict(sha256=digest(data), mime='image/png') for side, data in [('front', FRONT), ('back', BACK)]}
    original = dict(status='unknown', fields={}, source='unavailable', model=None)
    metadata = dict(captureId=CAPTURE, fingerprint=digest((digest(FRONT) + digest(BACK)).encode()),
                    identification=original, images=images, createdAt=STAMP)
    (capture / 'capture.json').write_text(encode(metadata))
    fingerprint = digest(encode(sorted([digest(FRONT), digest(BACK)])).encode())
    fields = dict(player='Example Card', set='Synthetic Set', cardNumber='7', year='2024',
                  manufacturer='Fixture Maker', cardGame='pokemon', sport=None, variant=None, parallel=None, edition=None)
    identity = dict(status='needs_review', fields=fields, candidates=[], evidence=None, confidenceScore=0)
    verification = dict(outcome='verified', actor=USER, at=STAMP, note='Synthetic owner review')
    history = [dict(action='identification_correction', at=STAMP, original=original, corrected=identity,
                    verification=verification, evidence=dict(image_fingerprint=fingerprint), model=None, test_result=None)]
    # Reuse the actual checked-in schema string without importing/executing CardStore.
    tree = ast.parse((ROOT / 'scripts/card_factory/store.py').read_text())
    schema = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                  and any(isinstance(t, ast.Name) and t.id == 'SCHEMA' for t in n.targets))
    dbpath = directory / 'cards.sqlite3'
    with closing(sqlite3.connect(dbpath)) as db, db:
        db.executescript(schema_transform(schema))
        if schema_transform(schema) != schema: db.execute('PRAGMA ignore_check_constraints=ON')  # adversarial fixture only
        db.execute("ALTER TABLE cards ADD COLUMN verification TEXT NOT NULL DEFAULT '{}'")
        db.execute('ALTER TABLE physical_locations ADD COLUMN display_kind TEXT')
        db.execute('CREATE TABLE scanner_requests (request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, card_id TEXT NOT NULL REFERENCES cards(id))')
        db.execute('PRAGMA user_version=1')
        data = dict(id=item, source_key=CAPTURE, import_hash='a'*64,
                    front_image_path=str(capture/'front'), back_image_path=str(capture/'back'), image_fingerprint=fingerprint,
                    card_type='pokemon', division='Pokémon', set_name=fields['set'], card_number='7',
                    status='identified', on_hand=3, listed=1, identification=encode(identity),
                    original_identification=encode(original), evidence_sources=encode([dict(kind='scanner-capture',captureId=CAPTURE,images=images,model=None,source='unavailable')]),
                    review_history=encode(history), verification=encode(verification), created_at=STAMP, updated_at=STAMP)
        db.execute(f"INSERT INTO cards ({','.join(data)}) VALUES ({','.join('?' for _ in data)})", tuple(data.values()))
    return dbpath

def change(dbpath, **updates):
    with closing(sqlite3.connect(dbpath)) as db, db:
        db.execute('PRAGMA ignore_check_constraints=ON')  # Deliberately corrupt synthetic fixtures only.
        for key, value in updates.items():
            db.execute(f'UPDATE cards SET {key}=?', (value,))

def state(root):
    result = {}
    for path in [Path(root)] + sorted(Path(root).rglob('*')):
        stat = path.lstat()
        result[str(path.relative_to(root))] = (stat.st_mode, stat.st_ino, stat.st_size,
            stat.st_mtime_ns, stat.st_ctime_ns, digest(path.read_bytes()) if path.is_file() else None)
    return result  # Read-access time is deliberately not a write/integrity invariant.

@unittest.skipUnless(os.name == 'posix', 'Production worker deliberately fails closed without POSIX locking')
class ReadonlyProjectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='boss-commercial-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dbpath = fixture(self.root)

    def preview(self, ids=None):
        return projection.project(str(self.root), TENANT, [ITEM] if ids is None else ids)

    def excluded(self, reason):
        result = self.preview()
        self.assertEqual(result['rows'], [])
        self.assertEqual(result['excluded'], [dict(selectionIndex=0, reason=reason)])

    def test_valid_projection_bytes_metadata_and_directory_entries_unchanged(self):
        before = state(self.root)
        result = self.preview()
        self.assertEqual(state(self.root), before)
        row = result['rows'][0]['row']
        self.assertEqual(row['title'], '2024 Synthetic Set Example Card #7')
        self.assertEqual(row['quantity'], 2)
        self.assertTrue(row['titleVerified'])
        self.assertFalse(row['needsReview'])
        self.assertRegex(row['frontImage'], r'^bl-private:asset:[0-9a-f-]{36}$')
        self.assertRegex(row['snapshotHash'], r'^[0-9a-f]{64}$')
        self.assertNotIn(str(self.root), json.dumps(result))
        self.assertEqual(self.preview(), result)

    def test_memory_boundary_query_only_and_authorizer_block_persistent_writes(self):
        before = state(self.root)
        with projection.open_readonly(self.dbpath) as db:
            self.assertEqual(db.execute('PRAGMA query_only').fetchone()[0], 1)
            for sql in ['UPDATE cards SET listed=0', 'CREATE TABLE forbidden(x)', 'PRAGMA user_version=2', 'PRAGMA journal_mode=WAL', 'ATTACH DATABASE ":memory:" AS other']:
                with self.subTest(sql=sql), self.assertRaises(sqlite3.DatabaseError): db.execute(sql)
            db.set_authorizer(None)
            # query_only independently rejects writes in the memory snapshot.
            with self.assertRaises(sqlite3.OperationalError): db.execute('UPDATE cards SET listed=0')
            db.execute('PRAGMA query_only=OFF')
            # Even deliberately disabling SQL defenses edits only transient RAM.
            db.execute('UPDATE cards SET listed=0')
            self.assertEqual(db.execute('SELECT listed FROM cards').fetchone()[0], 0)
        self.assertEqual(state(self.root), before)

    def test_missing_database_and_tenant_are_not_created(self):
        self.dbpath.unlink()
        before = state(self.root)
        with self.assertRaises(projection.ProjectionError): self.preview()
        self.assertEqual(state(self.root), before)
        with self.assertRaises(projection.ProjectionError): projection.project(str(self.root), OTHER_TENANT, [ITEM])
        self.assertFalse((self.root / OTHER_TENANT).exists())

    def test_empty_selection_does_not_open_database(self):
        with patch.object(projection.sqlite3, 'connect', side_effect=AssertionError('must not open')):
            self.assertEqual(self.preview([])['rows'], [])
            self.assertEqual(self.preview([])['excluded'], [])

    def test_cross_tenant_selection_is_a_safe_whole_request_error(self):
        fixture(self.root, OTHER_TENANT, OTHER_ITEM)
        before = state(self.root)
        with self.assertRaisesRegex(projection.ProjectionError, '^SELECTION_NOT_FOUND$'): self.preview([ITEM, OTHER_ITEM])
        self.assertEqual(state(self.root), before)

    def test_unverified_and_review_required_excluded(self):
        change(self.dbpath, verification='{}')
        self.excluded('REVIEW_UNVERIFIED')
        change(self.dbpath, status='needs-review')
        self.excluded('NEEDS_REVIEW')

    def test_changed_reviewed_fields_missing_title_and_missing_review_event_excluded(self):
        with closing(sqlite3.connect(self.dbpath)) as db, db:
            ident, history = db.execute('SELECT identification,review_history FROM cards').fetchone()
        altered = json.loads(ident); altered['fields']['player'] = 'Changed'
        change(self.dbpath, identification=encode(altered))
        self.excluded('REVIEW_MISMATCH')
        altered['fields']['player'] = ''
        events = json.loads(history); events[-1]['corrected'] = altered
        change(self.dbpath, identification=encode(altered), review_history=encode(events))
        self.excluded('TITLE_UNVERIFIED')
        change(self.dbpath, identification=ident, review_history='[]')
        self.excluded('REVIEW_UNVERIFIED')

    def test_quantities_fail_closed(self):
        for on_hand, listed in [(0,0),(-1,0),(1.5,0),('invalid',0),(3,-1),(3,0.5),(3,4),(3,3),(2147483648,0)]:
            with self.subTest(on_hand=on_hand, listed=listed):
                change(self.dbpath,on_hand=on_hand,listed=listed)
                self.excluded('NO_AVAILABLE_STOCK' if (on_hand,listed) in [(0,0),(3,3)] else 'INVALID_STOCK')

    def test_reservation_extension_is_not_silently_ignored(self):
        with closing(sqlite3.connect(self.dbpath)) as db, db: db.execute('ALTER TABLE cards ADD COLUMN reserved INTEGER DEFAULT 1')
        with self.assertRaisesRegex(projection.ProjectionError, '^UNSUPPORTED_SCHEMA$'): self.preview()
        # Baseline has no reservation ledger. This proves rejection of schema drift, not external reservations.

    def test_missing_or_cross_associated_image(self):
        change(self.dbpath, front_image_path=str(self.dbpath.parent/'captures'/CAPTURE/'back'))
        self.excluded('IMAGE_ASSOCIATION_INVALID')
        change(self.dbpath, front_image_path=str(self.dbpath.parent/'captures'/CAPTURE/'front'))
        (self.dbpath.parent/'captures'/CAPTURE/'front').unlink()
        self.excluded('IMAGE_MISSING')

    def test_replaced_photo_and_missing_or_invalid_fingerprint(self):
        front = self.dbpath.parent/'captures'/CAPTURE/'front'
        front.write_bytes(FRONT + b'changed')
        self.excluded('IMAGE_INTEGRITY_INVALID')
        front.write_bytes(FRONT)
        for value in ['', 'not-a-hash', 'a'*64]:
            change(self.dbpath, image_fingerprint=value)
            self.excluded('SNAPSHOT_INVALID')

    def test_capture_manifest_evidence_and_original_association(self):
        path = self.dbpath.parent/'captures'/CAPTURE/'capture.json'
        original = path.read_text(); data = json.loads(original)
        data['captureId'] = OTHER_ITEM; path.write_text(encode(data))
        self.excluded('IMAGE_ASSOCIATION_INVALID')
        path.write_text(original)
        change(self.dbpath, evidence_sources='[]')
        self.excluded('IMAGE_ASSOCIATION_INVALID')

    def test_symlink_database_and_image_rejected_without_following(self):
        front = self.dbpath.parent/'captures'/CAPTURE/'front'
        other = self.root/'other'; other.write_bytes(FRONT)
        front.unlink(); front.symlink_to(other)
        self.excluded('IMAGE_ASSOCIATION_INVALID')
        original = self.root/'moved.sqlite3'; self.dbpath.rename(original); self.dbpath.symlink_to(original)
        with self.assertRaises(projection.ProjectionError): self.preview()

    def test_sidecars_are_refused_before_sqlite_connect(self):
        for suffix in ['-wal','-shm','-journal']:
            sidecar = Path(str(self.dbpath)+suffix); sidecar.write_bytes(b'synthetic sidecar')
            before = state(self.root)
            with patch.object(projection.sqlite3, 'connect', side_effect=AssertionError('must not open')):
                with self.assertRaisesRegex(projection.ProjectionError, '^WAL_OR_JOURNAL_UNSUPPORTED$'): self.preview()
            self.assertEqual(state(self.root), before)
            sidecar.unlink()

    def test_wal_header_without_sidecars_is_refused(self):
        db = sqlite3.connect(self.dbpath)
        db.execute('PRAGMA journal_mode=WAL'); db.close()  # Fixture setup only.
        before = state(self.root)
        with patch.object(projection.sqlite3, 'connect', side_effect=AssertionError('must not open')):
            with self.assertRaisesRegex(projection.ProjectionError, '^WAL_OR_JOURNAL_UNSUPPORTED$'): self.preview()
        self.assertEqual(state(self.root), before)

    def test_corrupt_database_and_old_schema_fail_without_repair(self):
        with closing(sqlite3.connect(self.dbpath)) as db, db: db.execute('PRAGMA user_version=0')
        before = state(self.root)
        with self.assertRaisesRegex(projection.ProjectionError, '^UNSUPPORTED_SCHEMA$'): self.preview()
        self.assertEqual(state(self.root), before)
        self.dbpath.write_bytes(b'not sqlite')
        before = state(self.root)
        with self.assertRaises(projection.ProjectionError): self.preview()
        self.assertEqual(state(self.root), before)

    def test_query_error_is_not_returned_as_empty_or_partial_success(self):
        before = state(self.root)
        with patch.object(projection, 'eligible_row', side_effect=sqlite3.DatabaseError('PRIVATE DATABASE DETAIL')):
            with self.assertRaisesRegex(projection.ProjectionError, '^DATABASE_READ_FAILED$'): self.preview()
        self.assertEqual(state(self.root), before)

    def test_posix_guard_blocks_a_competing_sqlite_reserved_lock(self):
        code = 'import os,fcntl,sys; f=os.open(sys.argv[1],os.O_RDWR); fcntl.lockf(f,fcntl.LOCK_EX|fcntl.LOCK_NB,512,0x40000000)'
        with projection.open_readonly(self.dbpath):
            result = subprocess.run([sys.executable,'-I','-B','-c',code,str(self.dbpath)],capture_output=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn(b'BlockingIOError',result.stderr)

    def test_no_network_capability_used(self):
        import socket
        with patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')):
            self.assertEqual(len(self.preview()['rows']), 1)

    def test_stock_change_changes_snapshot_without_changing_reviewed_identity(self):
        first = self.preview()['rows'][0]['row']
        change(self.dbpath, on_hand=4)
        before = state(self.root)
        second = self.preview()['rows'][0]['row']
        self.assertEqual(second['quantity'], 3)
        self.assertNotEqual(first['snapshotHash'], second['snapshotHash'])
        self.assertNotEqual(first['frontImage'], second['frontImage'])
        self.assertEqual(state(self.root), before)

    def test_invalid_updated_timestamp_excludes_snapshot(self):
        change(self.dbpath, updated_at='unknown')
        self.excluded('SNAPSHOT_INVALID')

    def test_missing_schema_is_not_initialized(self):
        with closing(sqlite3.connect(self.dbpath)) as db, db:
            db.execute('DROP TABLE scanner_requests')
        before = state(self.root)
        with self.assertRaisesRegex(projection.ProjectionError, '^UNSUPPORTED_SCHEMA$'): self.preview()
        self.assertEqual(state(self.root), before)

    def test_unsupported_locking_fails_before_sqlite_open(self):
        with patch.object(projection, 'fcntl', None), patch.object(projection.sqlite3, 'connect', side_effect=AssertionError('must not open')):
            with self.assertRaisesRegex(projection.ProjectionError, '^READONLY_PLATFORM_UNSUPPORTED$'): self.preview()

    def test_existing_competing_write_lock_fails_closed(self):
        code = 'import os,fcntl,sys; f=os.open(sys.argv[1],os.O_RDWR); fcntl.lockf(f,fcntl.LOCK_EX|fcntl.LOCK_NB,1,0x40000001); print("ready",flush=True); sys.stdin.read(1); os.close(f)'
        before = state(self.root)
        with subprocess.Popen([sys.executable,'-I','-B','-c',code,str(self.dbpath)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) as child:
            self.assertEqual(child.stdout.readline().strip(), 'ready')
            with self.assertRaisesRegex(projection.ProjectionError, '^STORE_BUSY$'): self.preview()
            child.communicate('x', timeout=3)
        self.assertEqual(state(self.root), before)

    def test_source_has_no_application_imports_or_write_open_paths(self):
        tree = ast.parse(Path(projection.__file__).read_text())
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import): imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom): imports.add(node.module)
        self.assertEqual(imports, {'contextlib','datetime','hashlib','json','os','pathlib','re','sqlite3','stat','sys','uuid','fcntl','resource','ctypes'})
        source = Path(projection.__file__).read_text()
        self.assertNotIn('mkdir(', source)
        self.assertNotIn('executescript(', source)
        self.assertNotIn('write_bytes(', source)
        self.assertNotIn('write_text(', source)

    def test_selection_and_root_inputs_fail_closed(self):
        for ids in [[ITEM,ITEM], [ITEM]*51, ['../escape'], [dict(itemId=ITEM)], 'not an array']:
            with self.subTest(ids=ids), self.assertRaises(projection.ProjectionError): self.preview(ids)
        with self.assertRaises(projection.ProjectionError): projection.project('relative-root',TENANT,[ITEM])

class AdditionalSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='boss-phase0-security-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dbpath = fixture(self.root)

    def project(self, **kwargs):
        return projection.project(str(self.root), TENANT, [ITEM], **kwargs)

    def test_sqlite_only_opens_memory_and_never_reopens_inventory_path(self):
        before = state(self.root)
        connect = sqlite3.connect
        calls = []
        def memory_only(name, *args, **kwargs):
            calls.append(name)
            self.assertEqual(name, ':memory:')
            return connect(name, *args, **kwargs)
        with patch.object(projection.sqlite3, 'connect', side_effect=memory_only):
            self.assertEqual(len(self.project()['rows']), 1)
        self.assertEqual(calls, [':memory:'])
        self.assertEqual(state(self.root), before)

    def test_replacement_after_validation_never_opens_wal_or_creates_sidecars(self):
        replacement = self.root/'replacement.sqlite3'
        with closing(sqlite3.connect(replacement)) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA user_version=77')
        self.assertFalse(Path(str(replacement)+'-wal').exists())
        before = state(self.root)
        connect = sqlite3.connect
        attacker_state = None
        def swap(name, *args, **kwargs):
            nonlocal attacker_state
            self.assertEqual(name, ':memory:')
            self.dbpath.rename(self.root/'original.sqlite3')
            replacement.rename(self.dbpath)
            attacker_state = state(self.root)
            return connect(name, *args, **kwargs)
        with patch.object(projection.sqlite3, 'connect', side_effect=swap):
            with self.assertRaises(projection.ProjectionError):
                with projection.open_readonly(self.dbpath) as db:
                    self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 1)
        self.assertNotEqual(before, attacker_state, 'only the attacker changed the tree')
        self.assertEqual(state(self.root), attacker_state)
        for path in self.root.rglob('*'):
            self.assertFalse(path.name.endswith(('-wal','-shm','-journal')))

    def test_replacement_between_entry_check_and_open_is_rejected_before_read(self):
        original_open = os.open
        replacement = self.root/'replacement'
        replacement.write_bytes(b'foreign tenant database bytes')
        attacker_state = None
        def swap(name, flags, *args, **kwargs):
            nonlocal attacker_state
            if name == 'cards.sqlite3':
                self.dbpath.rename(self.root/'original.sqlite3')
                replacement.rename(self.dbpath)
                attacker_state = state(self.root)
            return original_open(name, flags, *args, **kwargs)
        with patch.object(projection.os, 'open', side_effect=swap), patch.object(projection, 'read_descriptor', side_effect=AssertionError('must not read')):
            with self.assertRaisesRegex(projection.ProjectionError, 'EVIDENCE_CHANGED'):
                self.project()
        self.assertEqual(state(self.root), attacker_state)

    def test_ancestor_swaps_never_return_other_tenant_bytes(self):
        fixture(self.root, OTHER_TENANT, OTHER_ITEM)
        other = self.root/OTHER_TENANT/'captures'/CAPTURE
        (other/'front').write_bytes(b'FOREIGN SYNTHETIC TENANT BYTES')
        for level in ('capture', 'captures', 'tenant'):
            with self.subTest(level=level):
                # Use fresh isolated trees for each attack.
                with tempfile.TemporaryDirectory(prefix='boss-phase0-ancestor-') as temp:
                    root = Path(temp); dbpath = fixture(root)
                    fixture(root, OTHER_TENANT, OTHER_ITEM)
                    foreign = root/OTHER_TENANT/'captures'/CAPTURE
                    (foreign/'front').write_bytes(b'FOREIGN SYNTHETIC TENANT BYTES')
                    original_open = os.open; returned = []; attacker_state = []
                    target = root/TENANT/'captures'/CAPTURE
                    if level == 'captures': target = target.parent
                    if level == 'tenant': target = target.parent.parent
                    foreign_target = root/OTHER_TENANT/target.relative_to(root/TENANT)
                    def swap(name, flags, *args, **kwargs):
                        if name == 'front' and not attacker_state:
                            target.rename(target.with_name(target.name+'-old'))
                            target.symlink_to(foreign_target, target_is_directory=True)
                            attacker_state.append(state(root))
                        return original_open(name, flags, *args, **kwargs)
                    read = projection.read_private
                    def observe(*args):
                        data = read(*args); returned.append(data); return data
                    with patch.object(projection.os, 'open', side_effect=swap), patch.object(projection, 'read_private', side_effect=observe):
                        with self.assertRaises(projection.ProjectionError):
                            projection.project(str(root), TENANT, [ITEM])
                    self.assertNotIn(b'FOREIGN SYNTHETIC TENANT BYTES', returned)
                    self.assertIn(FRONT, returned, 'pinned parent still reads original evidence')
                    self.assertEqual(state(root), attacker_state[0])

    def test_component_symlink_swap_before_directory_open_fails_closed(self):
        capture = self.dbpath.parent/'captures'/CAPTURE
        foreign = self.root/'foreign'; foreign.mkdir(); (foreign/'front').write_bytes(b'foreign')
        original_open = os.open
        attacker_state = []
        def swap(name, flags, *args, **kwargs):
            if name == CAPTURE:
                capture.rename(capture.with_name(CAPTURE+'-old'))
                capture.symlink_to(foreign, target_is_directory=True)
                attacker_state.append(state(self.root))
            return original_open(name, flags, *args, **kwargs)
        with patch.object(projection.os, 'open', side_effect=swap):
            with self.assertRaises(projection.ProjectionError): self.project()
        self.assertEqual(state(self.root), attacker_state[0])

    def test_schema_rejects_changed_types_constraints_keys_and_fk_actions(self):
        variants = {
            'type': ('on_hand INTEGER', 'on_hand TEXT'),
            'check': ("CHECK(typeof(on_hand)='integer' AND on_hand BETWEEN 0 AND 2147483647)", ''),
            'primary-key': ('id TEXT PRIMARY KEY, collection_key', 'id TEXT, collection_key'),
            'unique': ('collection_key TEXT NOT NULL UNIQUE', 'collection_key TEXT NOT NULL'),
            'foreign-key': ('REFERENCES collections(id)', 'REFERENCES collections(id) ON DELETE CASCADE'),
            'default': ("review_history TEXT NOT NULL DEFAULT '[]'", "review_history TEXT NOT NULL DEFAULT '{}'"),
            'not-null': ('name TEXT NOT NULL, set_name', 'name TEXT, set_name'),
        }
        for label, (old,new) in variants.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix='boss-phase0-schema-') as root:
                fixture(root, schema_transform=lambda sql: sql.replace(old,new))
                before = state(root)
                with self.assertRaises(projection.ProjectionError): projection.project(root,TENANT,[ITEM])
                self.assertEqual(state(root), before)

    def test_schema_rejects_missing_extra_and_changed_indexes_and_other_columns(self):
        variants = [
            'DROP INDEX location_identity',
            'DROP INDEX prices_by_card',
            'CREATE INDEX unexpected ON cards(status)',
            'ALTER TABLE physical_locations ADD COLUMN reserved INTEGER DEFAULT 2',
            'CREATE VIEW unexpected AS SELECT id FROM cards',
            'CREATE TRIGGER unexpected AFTER UPDATE ON cards BEGIN SELECT 1; END',
            'CREATE TABLE unexpected(x)',
        ]
        for sql in variants:
            with self.subTest(sql=sql), tempfile.TemporaryDirectory(prefix='boss-phase0-schema-') as root:
                dbpath = fixture(root)
                with closing(sqlite3.connect(dbpath)) as db, db: db.execute(sql)
                before = state(root)
                with self.assertRaises(projection.ProjectionError): projection.project(root,TENANT,[ITEM])
                self.assertEqual(state(root), before)

    def test_schema_rejects_broken_foreign_key_rows(self):
        change(self.dbpath, location_id=OTHER_ITEM)
        before = state(self.root)
        with self.assertRaisesRegex(projection.ProjectionError, 'UNSUPPORTED_SCHEMA'): self.project()
        self.assertEqual(state(self.root), before)

    def test_schema_accepts_exact_existing_contract(self):
        before = state(self.root)
        self.assertEqual(len(self.project()['rows']),1)
        self.assertEqual(state(self.root),before)

    def test_unchanged_revision_revalidates_and_changed_stock_is_stale(self):
        first = self.project()
        self.assertEqual(self.project(expected=first['revision']), first)
        change(self.dbpath,on_hand=4)
        before = state(self.root)
        with self.assertRaisesRegex(projection.ProjectionError, 'SNAPSHOT_STALE'):
            self.project(expected=first['revision'])
        self.assertEqual(state(self.root),before)

    def test_changed_image_and_missing_review_invalidate_expected_manifest(self):
        for mutation in ('image','review'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory(prefix='boss-phase0-revision-') as root:
                dbpath=fixture(root)
                first=projection.project(root,TENANT,[ITEM])
                if mutation=='image': (Path(root)/TENANT/'captures'/CAPTURE/'front').write_bytes(FRONT+b'changed')
                else: change(dbpath,verification='{}')
                before=state(root)
                with self.assertRaisesRegex(projection.ProjectionError,'SNAPSHOT_STALE'):
                    projection.project(root,TENANT,[ITEM],expected=first['revision'])
                self.assertEqual(state(root),before)

    def test_asset_changes_with_tenant_item_revision_and_image_hash(self):
        base=projection.asset_id(TENANT,ITEM,'a'*64,'b'*64)
        for args in [(OTHER_TENANT,ITEM,'a'*64,'b'*64),(TENANT,OTHER_ITEM,'a'*64,'b'*64),
                     (TENANT,ITEM,'c'*64,'b'*64),(TENANT,ITEM,'a'*64,'d'*64)]:
            self.assertNotEqual(projection.asset_id(*args),base)

    def test_database_size_limit_fails_before_sqlite_connect(self):
        before=state(self.root)
        with patch.object(projection,'MAX_DATABASE_BYTES',10), patch.object(projection.sqlite3,'connect',side_effect=AssertionError('must not open')):
            with self.assertRaisesRegex(projection.ProjectionError,'RESOURCE_LIMIT'): self.project()
        self.assertEqual(state(self.root),before)

    def test_runtime_site_initialization_and_version_mismatch_fail_closed(self):
        request=dict(root=str(self.root),tenant=TENANT,ids=[ITEM],expected=None,
                     runtime=dict(python='.'.join(map(str,sys.version_info[:3])),sqlite=sqlite3.sqlite_version))
        worker=str(ROOT/'scripts/card_factory/commercial_readonly.py')
        before=state(self.root)
        for args in [['-I','-B'],['-I','-S','-B']]:
            payload={**request}
            if '-S' in args: payload['runtime']={**request['runtime'],'python':'0.0.0'}
            result=subprocess.run([sys.executable,*args,worker],input=encode(payload),capture_output=True,text=True,timeout=5)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(json.loads(result.stdout)['code'],'RUNTIME_UNVERIFIED')
        self.assertEqual(state(self.root),before)

class PlatformBoundaryTests(unittest.TestCase):
    def test_unrecognised_filesystem_refused_without_changes(self):
        with tempfile.TemporaryDirectory(prefix='boss-phase0-fs-') as root:
            fixture(root);before=state(root)
            with patch.object(projection,'LOCAL_FILESYSTEMS',set()):
                with self.assertRaisesRegex(projection.ProjectionError,'READONLY_PLATFORM_UNSUPPORTED'):
                    projection.project(root,TENANT,[ITEM])
            self.assertEqual(state(root),before)

    def test_descriptor_traversal_unavailable_refused_without_changes(self):
        with tempfile.TemporaryDirectory(prefix='boss-phase0-fs-') as root:
            fixture(root);before=state(root)
            with patch.object(projection,'OPENAT_SUPPORTED',False):
                with self.assertRaisesRegex(projection.ProjectionError,'READONLY_PLATFORM_UNSUPPORTED'):
                    projection.project(root,TENANT,[ITEM])
            self.assertEqual(state(root),before)

    def test_readonly_snapshot_blocks_real_sqlite_writer_but_allows_reader(self):
        with tempfile.TemporaryDirectory(prefix='boss-phase0-lock-') as root:
            dbpath=fixture(root);before=state(root)
            with projection.open_readonly(dbpath):
                read=subprocess.run([sys.executable,'-I','-S','-B','-c',
                    'import sqlite3,sys;db=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True,timeout=0);print(db.execute("SELECT on_hand FROM cards").fetchone()[0]);db.close()',
                    str(dbpath)],capture_output=True,text=True,timeout=3)
                self.assertEqual(read.returncode,0);self.assertEqual(read.stdout.strip(),'3')
                write=subprocess.run([sys.executable,'-I','-S','-B','-c',
                    'import sqlite3,sys;db=sqlite3.connect(sys.argv[1],timeout=0);db.execute("BEGIN IMMEDIATE")',
                    str(dbpath)],capture_output=True,text=True,timeout=3)
                self.assertNotEqual(write.returncode,0);self.assertIn('database is locked',write.stderr)
            self.assertEqual(state(root),before)

if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'fixture':
        fixture(Path(sys.argv[2]))
    else:
        unittest.main()
