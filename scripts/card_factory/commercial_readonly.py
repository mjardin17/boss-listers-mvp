"""Dedicated Phase 1B repository. No CardStore/importer/exporter/application imports.
Only existing version-1 rollback-journal tenant stores are supported. Linux
descriptor-bound in-memory snapshots only: guard SQLite's pending/reserved/shared lock bytes against writers before
reading; SQLite receives only bytes in memory, with query_only and a SQL authorizer. WAL, journal
sidecars, recovery, unknown schemas and unsupported locking fail closed. No
immutable=1, checkpoints, schema changes, directory creation or image serving.

Internal worker input comes ONLY from the trusted Node service, not an API body.
Returned rows are internal builder inputs; no paths or image bytes are returned.
OS access-time updates from reads are not controlled. Content/mtime/ctime/identity
are checked; this is a point-in-time preview, not a persistent stock reservation.
"""
from contextlib import contextmanager, ExitStack
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import sys
import uuid
import ctypes
try:
    import resource
except ImportError:
    resource = None
try:
    import fcntl
except ImportError:
    fcntl = None

UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')
HASH = re.compile(r'[0-9a-f]{64}')
TABLES = {'cards', 'collections', 'physical_locations', 'price_history', 'scanner_requests'}
COLUMNS = set('id source_key import_hash front_image_path back_image_path image_fingerprint card_type division set_name card_number variant condition grade collection_id location_id status on_hand listed seller_price_cents identification original_identification evidence_sources review_history created_at updated_at verification'.split())
READ_COLUMNS = 'id,source_key,front_image_path,back_image_path,image_fingerprint,card_type,status,on_hand,listed,identification,original_identification,evidence_sources,review_history,verification,updated_at'
SPORTS = {'baseball', 'basketball', 'football', 'hockey', 'soccer', 'racing'}

class ProjectionError(Exception):
    """Constant safe code only, never raw SQLite/OS error messages."""

class Excluded(Exception):
    """Known record-level evidence failure, not a swallowed database error."""

def valid(pattern, value):
    return isinstance(value, str) and pattern.fullmatch(value) is not None

def encode(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)

def digest(value):
    return hashlib.sha256(value).hexdigest()

def strict_json(text):
    def pairs(entries):
        result = {}
        for key, value in entries:
            if key in result: raise ValueError('duplicate key')
            result[key] = value
        return result
    def constant(_): raise ValueError('nonfinite JSON')
    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)

def signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)

# Security boundary: SQLite NEVER receives an inventory pathname or file URI.
# Linux + CPython 3.11+ deserialize required. A <=64 MiB validated, locked file
# is read through one descriptor and deserialized into :memory:. No persistent
# copy, immutable=1, journal recovery, database constructor or migration.
# Local filesystems with working POSIX record locks and trusted OS/runtime are
# required. Hostile kernel/root, mount changes and non-cooperating writers are
# outside the deployment trust boundary. Read atime is not controlled.
MAX_DATABASE_BYTES = 64 * 1024 * 1024
OPENAT_SUPPORTED = os.open in os.supports_dir_fd
SCHEMA_FINGERPRINT = '4cfca172aa0ab6dbde0b0853fac1d1fbc3e9731cbfd4a479000ce3e25c926bc5'

def platform_check():
    if (sys.platform != 'linux' or sys.maxsize <= 2**32 or fcntl is None or resource is None or not hasattr(os, 'O_NOFOLLOW')
            or not hasattr(os, 'O_DIRECTORY') or not hasattr(sqlite3.Connection, 'deserialize')
            or sys.version_info < (3, 11) or not OPENAT_SUPPORTED):
        raise ProjectionError('READONLY_PLATFORM_UNSUPPORTED')

# Fail closed for network, FUSE and unrecognised filesystems. Linux 64-bit
# statfs begins with signed long f_type; an oversized buffer avoids ABI-sized
# struct writes. Only local ext-family, XFS, Btrfs, tmpfs and overlay are allowed.
LOCAL_FILESYSTEMS = {0xef53, 0x58465342, 0x9123683e, 0x01021994, 0x794c7630}
def require_local_filesystem(fd):
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        call = libc.fstatfs
        call.argtypes = [ctypes.c_int, ctypes.c_void_p]
        call.restype = ctypes.c_int
        data = ctypes.create_string_buffer(512)
        if call(fd, data) != 0: raise ProjectionError('READONLY_PLATFORM_UNSUPPORTED')
        kind = ctypes.cast(data, ctypes.POINTER(ctypes.c_long)).contents.value & 0xffffffff
        if kind not in LOCAL_FILESYSTEMS: raise ProjectionError('READONLY_PLATFORM_UNSUPPORTED')
    except (AttributeError, OSError):
        raise ProjectionError('READONLY_PLATFORM_UNSUPPORTED') from None

class PrivateTree:
    """Pin every directory from /; all subsequent accesses are openat-style.

    No resolve-then-open. Comparing an entry before/after open protects the
    component being opened; retaining parent FDs prevents ancestor redirection.
    Postchecks detect changes, but are NOT the boundary preventing foreign reads.
    """
    def __init__(self):
        platform_check()
        self.dirs = {}
        self.files = []

    def __enter__(self):
        self.directory(Path('/'))
        return self

    def __exit__(self, *args):
        for fd, _, _, _ in self.files: os.close(fd)
        for fd, _ in reversed(list(self.dirs.values())): os.close(fd)

    def directory(self, path):
        path = Path(path)
        if not path.is_absolute() or '..' in path.parts:
            raise ProjectionError('PRIVATE_PATH_INVALID')
        if path in self.dirs: return self.dirs[path][0]
        parent = None if path == Path('/') else self.directory(path.parent)
        name = '/' if parent is None else path.name
        before = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISDIR(before.st_mode): raise ProjectionError('PRIVATE_PATH_INVALID')
        fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
        try:
            require_local_filesystem(fd)
            current = os.fstat(fd)
        except BaseException:
            os.close(fd)
            raise
        if signature(before) != signature(current):
            os.close(fd)
            raise ProjectionError('EVIDENCE_CHANGED')
        self.dirs[path] = (fd, current)
        return fd

    def open_file(self, path):
        path = Path(path)
        parent = self.directory(path.parent)
        before = os.stat(path.name, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise Excluded('IMAGE_ASSOCIATION_INVALID')
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent)
        try:
            require_local_filesystem(fd)
            current = os.fstat(fd)
        except BaseException:
            os.close(fd)
            raise
        if signature(before) != signature(current):
            os.close(fd)
            raise ProjectionError('EVIDENCE_CHANGED')
        self.files.append((fd, current, parent, path.name))
        return fd, current

    def verify(self):
        for path, (fd, original) in self.dirs.items():
            parent = None if path == Path('/') else self.dirs[path.parent][0]
            name = '/' if parent is None else path.name
            entry = os.stat(name, dir_fd=parent, follow_symlinks=False)
            # Ancestors like /tmp may have unrelated concurrent directory writes.
            # Verify their identity, not their mtime; retained file FDs below
            # verify complete signatures/content changes for evidence.
            identity = lambda st: (st.st_dev, st.st_ino, st.st_mode)
            if identity(entry) != identity(original) or identity(os.fstat(fd)) != identity(original):
                raise ProjectionError('EVIDENCE_CHANGED')
        for fd, original, parent, name in self.files:
            if (signature(os.fstat(fd)) != signature(original) or
                    signature(os.stat(name, dir_fd=parent, follow_symlinks=False)) != signature(original)):
                raise ProjectionError('EVIDENCE_CHANGED')

def checked_directory(path, tracked):
    return tracked.directory(path)

def ensure_no_sidecars(database, tree):
    parent = tree.directory(Path(database).parent)
    for suffix in ('-wal', '-shm', '-journal'):
        try: os.stat(Path(database).name + suffix, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError: continue
        raise ProjectionError('WAL_OR_JOURNAL_UNSUPPORTED')

def read_descriptor(fd, initial, limit):
    if not 0 < initial.st_size <= limit: raise ProjectionError('RESOURCE_LIMIT')
    chunks = []; size = 0
    os.lseek(fd, 0, os.SEEK_SET)
    while True:
        chunk = os.read(fd, min(65536, limit + 1 - size))
        if not chunk: break
        chunks.append(chunk); size += len(chunk)
        if size > limit: raise ProjectionError('RESOURCE_LIMIT')
    if size != initial.st_size or signature(os.fstat(fd)) != signature(initial):
        raise ProjectionError('EVIDENCE_CHANGED')
    return b''.join(chunks)

def authorizer(action, first, second, database, origin):
    if action == sqlite3.SQLITE_SELECT: return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_READ and database == 'main' and first in TABLES | {'sqlite_master', 'sqlite_schema'}:
        return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_FUNCTION and second == 'count': return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_PRAGMA:
        if first in ('user_version', 'query_only', 'foreign_keys') and second is None: return sqlite3.SQLITE_OK
        if first in ('table_xinfo', 'foreign_key_list', 'index_list') and second in TABLES: return sqlite3.SQLITE_OK
        if first == 'index_xinfo' and second in SCHEMA_INDEXES: return sqlite3.SQLITE_OK
        if first == 'foreign_key_check' and second is None: return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_TRANSACTION and first in ('BEGIN', 'ROLLBACK'): return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY

SCHEMA_INDEXES = {'location_identity', 'prices_by_card',
    'sqlite_autoindex_collections_1', 'sqlite_autoindex_collections_2',
    'sqlite_autoindex_physical_locations_1', 'sqlite_autoindex_cards_1',
    'sqlite_autoindex_cards_2', 'sqlite_autoindex_cards_3',
    'sqlite_autoindex_price_history_1', 'sqlite_autoindex_scanner_requests_1'}

@contextmanager
def open_readonly(database, tree=None):
    platform_check()
    with ExitStack() as stack:
        tree = tree or stack.enter_context(PrivateTree())
        connection = None
        try:
            try: descriptor, initial = tree.open_file(database)
            except Excluded: raise ProjectionError('STORE_UNAVAILABLE') from None
            try:
                fcntl.lockf(descriptor, fcntl.LOCK_SH | fcntl.LOCK_NB, 512, 0x40000000, os.SEEK_SET)
            except OSError: raise ProjectionError('STORE_BUSY') from None
            ensure_no_sidecars(database, tree)
            data = read_descriptor(descriptor, initial, MAX_DATABASE_BYTES)
            if len(data) < 100 or data[:16] != b'SQLite format 3\x00':
                raise ProjectionError('DATABASE_READ_FAILED')
            if data[18:20] != b'\x01\x01': raise ProjectionError('WAL_OR_JOURNAL_UNSUPPORTED')
            tree.verify()
            connection = sqlite3.connect(':memory:', isolation_level=None)
            connection.deserialize(data)
            del data
            connection.row_factory = sqlite3.Row
            connection.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 1_000_000)
            connection.execute('PRAGMA temp_store=MEMORY')
            connection.execute('PRAGMA foreign_keys=ON')
            connection.execute('PRAGMA query_only=ON')
            connection.execute('PRAGMA trusted_schema=OFF')
            connection.set_authorizer(authorizer)
            budget = [0]
            def progress():
                budget[0] += 1
                return int(budget[0] > 1000)
            connection.set_progress_handler(progress, 1000)
            connection.execute('BEGIN')
            yield connection
            ensure_no_sidecars(database, tree)
            tree.verify()
        except ProjectionError: raise
        except FileNotFoundError: raise ProjectionError('STORE_UNAVAILABLE') from None
        except (OSError, sqlite3.Error): raise ProjectionError('DATABASE_READ_FAILED') from None
        finally:
            if connection is not None: connection.close()

# Exact supported v1 contract: all sqlite_schema objects (including SQL CHECK,
# defaults, COLLATE, REFERENCES and index expressions), plus table_xinfo,
# foreign_key_list, index_list and index_xinfo. The pinned fingerprint is from
# the reviewed existing schema, NOT derived from a candidate DB or store import.
# Only whitespace OUTSIDE quoted SQL tokens is ignored. Unknown objects fail.
def normalized_sql(sql):
    if sql is None: return None
    tokens = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|\S", sql)
    return ''.join(tokens)

def schema_description(db):
    objects = [tuple(r) for r in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')]
    if ({r[1] for r in objects if r[0] == 'table'} != TABLES or
            {r[1] for r in objects if r[0] == 'index'} != SCHEMA_INDEXES or
            any(r[0] not in ('table', 'index') for r in objects)):
        raise ProjectionError('UNSUPPORTED_SCHEMA')
    result = {'objects': [(a,b,c,normalized_sql(d)) for a,b,c,d in objects], 'tables': {}, 'indexes': {}}
    for table in sorted(TABLES):
        result['tables'][table] = {p: [tuple(r) for r in db.execute(f'PRAGMA {p}("{table}")')]
            for p in ('table_xinfo', 'foreign_key_list', 'index_list')}
    for index in sorted(SCHEMA_INDEXES):
        result['indexes'][index] = [tuple(r) for r in db.execute(f'PRAGMA index_xinfo("{index}")')]
    return result

def check_schema(db):
    if db.execute('PRAGMA user_version').fetchone()[0] != 1:
        raise ProjectionError('UNSUPPORTED_SCHEMA')
    if digest(encode(schema_description(db)).encode()) != SCHEMA_FINGERPRINT:
        raise ProjectionError('UNSUPPORTED_SCHEMA')
    if db.execute('PRAGMA foreign_keys').fetchone()[0] != 1 or db.execute('PRAGMA foreign_key_check').fetchone() is not None:
        raise ProjectionError('UNSUPPORTED_SCHEMA')

def read_private(path, limit, tracked):
    try:
        fd, info = tracked.open_file(path)
        if not 0 < info.st_size <= limit: raise Excluded('EVIDENCE_INVALID')
        return read_descriptor(fd, info, limit)
    except FileNotFoundError: raise Excluded('IMAGE_MISSING') from None
    except OSError: raise ProjectionError('ASSET_READ_FAILED') from None

def timestamp(value):
    if not isinstance(value, str) or len(value) > 64: return False
    try: return datetime.fromisoformat(value).tzinfo is not None
    except ValueError: return False

# Signature checks only. No safe server-side decoder is declared in this
# checkout. Truncated/malformed raster payloads may pass this check. Full
# bounded decoding/dimensions MUST be added before any image consumer; this
# module neither serves nor processes images and makes no decodability claim.
def mime_of(data):
    if len(data) >= 24 and data[:8] == b'\x89PNG\r\n\x1a\n': return 'image/png'
    if len(data) >= 4 and data[:3] == b'\xff\xd8\xff': return 'image/jpeg'
    if len(data) >= 16 and data[:4] == b'RIFF' and data[8:12] == b'WEBP': return 'image/webp'
    raise Excluded('IMAGE_INTEGRITY_INVALID')

def eligible_row(db, card, tenant_directory, tenant, tracked):
    try:
        if card['status'] != 'identified': raise Excluded('NEEDS_REVIEW')
        verification = strict_json(card['verification'])
        history = strict_json(card['review_history'])
        identity = strict_json(card['identification'])
        if not isinstance(verification, dict) or verification.get('outcome') != 'verified': raise Excluded('REVIEW_UNVERIFIED')
        if not valid(UUID, verification.get('actor')) or not timestamp(verification.get('at')) or not isinstance(verification.get('note'), str) or not verification['note'].strip():
            raise Excluded('REVIEW_UNVERIFIED')
        if not isinstance(history, list): raise Excluded('REVIEW_UNVERIFIED')
        reviews = [e for e in history if isinstance(e, dict) and e.get('action') == 'identification_correction']
        if not reviews: raise Excluded('REVIEW_UNVERIFIED')
        latest = reviews[-1]
        if latest.get('verification') != verification or latest.get('corrected') != identity: raise Excluded('REVIEW_MISMATCH')
        on_hand, listed = card['on_hand'], card['listed']
        if type(on_hand) is not int or type(listed) is not int or not 0 <= listed <= on_hand <= 2147483647:
            raise Excluded('INVALID_STOCK')
        available = on_hand - listed  # EXACT existing CardStore.get_card() semantics; no invented reservation ledger.
        if available <= 0: raise Excluded('NO_AVAILABLE_STOCK')
        fields = identity.get('fields')
        if not isinstance(fields, dict) or any(not isinstance(fields.get(k), str) or not fields[k].strip() or fields[k] != fields[k].strip() for k in ('year','set','player','cardNumber','manufacturer')):
            raise Excluded('TITLE_UNVERIFIED')
        category = card['card_type']
        if (category == 'pokemon' and not str(fields.get('cardGame') or '').lower().replace('é','e').startswith('pokemon')) or (category != 'pokemon' and (category not in SPORTS or fields.get('sport') != category)):
            raise Excluded('REVIEW_MISMATCH')
        fingerprint = card['image_fingerprint']
        if not valid(HASH, fingerprint) or latest.get('evidence', {}).get('image_fingerprint') != fingerprint or not timestamp(card['updated_at']):
            raise Excluded('SNAPSHOT_INVALID')
        capture_id = card['source_key']
        if not valid(UUID, capture_id): raise Excluded('IMAGE_ASSOCIATION_INVALID')
        if db.execute('SELECT count(*) FROM cards WHERE source_key=? OR image_fingerprint=?', (capture_id, fingerprint)).fetchone()[0] != 1:
            raise Excluded('IMAGE_ASSOCIATION_INVALID')
        capture_dir = tenant_directory/'captures'/capture_id
        try:
            checked_directory(tenant_directory/'captures', tracked)
            checked_directory(capture_dir, tracked)
        except FileNotFoundError:
            raise Excluded('IMAGE_MISSING') from None
        if any(card[side+'_image_path'] != str(capture_dir/side) for side in ('front','back')):
            raise Excluded('IMAGE_ASSOCIATION_INVALID')
        metadata = strict_json(read_private(capture_dir/'capture.json', 1_000_000, tracked))
        evidence = strict_json(card['evidence_sources'])
        if not isinstance(metadata, dict) or metadata.get('captureId') != capture_id or metadata.get('identification') != strict_json(card['original_identification']):
            raise Excluded('IMAGE_ASSOCIATION_INVALID')
        images = metadata.get('images')
        if not isinstance(images, dict) or set(images) != {'front','back'}: raise Excluded('IMAGE_ASSOCIATION_INVALID')
        if not isinstance(evidence, list) or not any(isinstance(e, dict) and e.get('kind') == 'scanner-capture' and e.get('captureId') == capture_id and e.get('images') == images for e in evidence):
            raise Excluded('IMAGE_ASSOCIATION_INVALID')
        hashes = []
        for side in ('front','back'):
            image = images[side]
            if not isinstance(image, dict) or not valid(HASH, image.get('sha256')): raise Excluded('SNAPSHOT_INVALID')
            data = read_private(capture_dir/side, 4*1024*1024, tracked)
            actual = digest(data)
            if actual != image['sha256'] or mime_of(data) != image.get('mime'): raise Excluded('IMAGE_INTEGRITY_INVALID')
            hashes.append(actual)
        if digest(encode(sorted(hashes)).encode()) != fingerprint or metadata.get('fingerprint') != digest(''.join(hashes).encode()):
            raise Excluded('SNAPSHOT_INVALID')
        extras = [fields.get('variant') or fields.get('parallel'), fields.get('edition')]
        if any(v is not None and not isinstance(v, str) for v in extras): raise Excluded('TITLE_UNVERIFIED')
        title = ' '.join(v for v in [fields['year'],fields['set'],fields['player'],'#'+fields['cardNumber'],*extras] if v)
        snapshot = digest(encode(dict(tenant=tenant, item=card['id'], capture=capture_id, identity=identity,
            verification=verification, fingerprint=fingerprint, images=images, on_hand=on_hand, listed=listed, updated_at=card['updated_at'])).encode())
        asset = asset_id(tenant, card['id'], snapshot, hashes[0])
        return dict(itemId=card['id'], title=title, titleVerified=True, quantity=available, needsReview=False,
                    frontImage='bl-private:asset:'+asset, snapshotHash=snapshot), dict(frontSha256=hashes[0], backSha256=hashes[1])
    except Excluded:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        raise Excluded('EVIDENCE_INVALID') from None

def asset_id(tenant, item, snapshot, front_hash):
    raw = bytearray(hashlib.sha256(f'bosslisters:commercial-front:{tenant}:{item}:{snapshot}:{front_hash}'.encode()).digest()[:16])
    raw[6] = (raw[6] & 15) | 128  # UUID v8: content/revision binding, NOT an access token.
    raw[8] = (raw[8] & 63) | 128
    return str(uuid.UUID(bytes=bytes(raw)))

def project(root, tenant, ids, expected=None):
    if not valid(UUID, tenant) or not isinstance(ids, list) or len(ids) > 50 or any(not valid(UUID, i) for i in ids) or len(set(ids)) != len(ids):
        raise ProjectionError('INVALID_SELECTION')
    if not isinstance(root, str) or not Path(root).is_absolute() or '..' in Path(root).parts:
        raise ProjectionError('PRIVATE_PATH_INVALID')
    if expected is not None and not valid(HASH, expected): raise ProjectionError('INVALID_SELECTION')
    try:
        rows, excluded = [], []
        if ids:
            with PrivateTree() as tracked:
                directory = Path(root)
                public = Path(__file__).resolve().parents[2]/'public'
                if directory == public or public in directory.parents: raise ProjectionError('PRIVATE_PATH_INVALID')
                checked_directory(directory, tracked)
                tenant_directory = directory/tenant
                checked_directory(tenant_directory, tracked)
                with open_readonly(tenant_directory/'cards.sqlite3', tracked) as db:
                    check_schema(db)
                    records = db.execute(f'SELECT {READ_COLUMNS} FROM cards WHERE id IN ({",".join("?" for _ in ids)})', ids).fetchall()
                    found = {r['id']: r for r in records}
                    if set(found) != set(ids): raise ProjectionError('SELECTION_NOT_FOUND')
                    for index, item in enumerate(ids):
                        try:
                            row, hashes = eligible_row(db, found[item], tenant_directory, tenant, tracked)
                            rows.append(dict(selectionIndex=index, row=row, binding={**row, **hashes}))
                        except Excluded as error:
                            excluded.append(dict(selectionIndex=index, reason=str(error)))
                    tracked.verify()
        result = dict(rows=rows, excluded=excluded)
        revision = digest(encode(result).encode())
        if expected is not None and expected != revision: raise ProjectionError('SNAPSHOT_STALE')
        return dict(**result, revision=revision)
    except ProjectionError: raise
    except FileNotFoundError: raise ProjectionError('STORE_UNAVAILABLE') from None
    except (OSError, sqlite3.Error): raise ProjectionError('DATABASE_READ_FAILED') from None

def main():
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384: raise ProjectionError('INVALID_SELECTION')
        request = strict_json(raw)
        if not isinstance(request, dict) or set(request) != {'root','tenant','ids','expected','runtime'}: raise ProjectionError('INVALID_SELECTION')
        runtime = request['runtime']
        if (not sys.flags.isolated or not sys.flags.no_site or not sys.flags.dont_write_bytecode
                or 'site' in sys.modules or not isinstance(runtime, dict)
                or runtime != dict(python='.'.join(map(str, sys.version_info[:3])), sqlite=sqlite3.sqlite_version)):
            raise ProjectionError('RUNTIME_UNVERIFIED')
        # CPU/address-space/descriptor limits; no network or application imports.
        resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
        resource.setrlimit(resource.RLIMIT_AS, (512*1024*1024, 512*1024*1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (512, 512))
        result = dict(ok=True, **project(request['root'],request['tenant'],request['ids'],request['expected']))
        output = encode(result)
        if len(output.encode()) > 131072: raise ProjectionError('RESPONSE_TOO_LARGE')
        print(output)
        return 0
    except ProjectionError as error:
        print(encode(dict(ok=False, code=str(error))))
    except Exception:
        print(encode(dict(ok=False, code='DATABASE_READ_FAILED')))
    return 1

if __name__ == '__main__':
    sys.exit(main())
