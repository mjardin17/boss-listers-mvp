"""Explicit local persistence only; imported identities are not new AI calls."""
from contextlib import contextmanager
import hashlib
import json
import sqlite3
import subprocess
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARD_TYPES = ('pokemon', 'baseball', 'basketball', 'football', 'hockey', 'soccer', 'racing')


class FactoryError(ValueError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)


def text(value, name):
    if not isinstance(value, str) or not value.strip():
        raise FactoryError(f'{name} must be nonempty text')
    return value.strip()


def money(value):
    if value is None:
        return None
    if isinstance(value, bool):
        raise FactoryError('Invalid seller price')
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > Decimal('99999999.99'):
            raise InvalidOperation
        if amount * 100 != (amount * 100).to_integral_value():
            raise InvalidOperation
        return int(amount * 100)
    except (InvalidOperation, ValueError):
        raise FactoryError('Price must fit numeric(10,2); unknown prices must be null') from None


def counts(on_hand, listed):
    if any(type(v) is not int or v < 0 or v > 2147483647 for v in (on_hand, listed)) or listed > on_hand:
        raise FactoryError('Counts must be integers: 0 <= listed <= on_hand <= 2147483647')


def adapter(request):
    try:
        result = subprocess.run(['node', str(ROOT / 'scripts/card-factory-adapter.js')],
                                input=encode(request), text=True, capture_output=True,
                                timeout=45, cwd=ROOT)
    except (OSError, subprocess.TimeoutExpired):
        raise FactoryError('Node adapter unavailable; install Node 20+ and run npm ci') from None
    if result.returncode:
        raise FactoryError('Invalid card adapter input or missing dependencies; run npm ci')
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise FactoryError('Invalid adapter response') from None


def classify(card_type, identification):
    result = adapter({'operation': 'normalize', 'identification': identification})
    fields = result['fields']
    game = (fields.get('cardGame') or '').casefold().replace('é', 'e')
    sport = (fields.get('sport') or '').casefold()
    matching_type = (game in ('pokemon', 'pokemon tcg', 'pokemon cards') and not sport) if card_type == 'pokemon' else (
        sport == card_type and game in ('', 'sports', 'sports card', 'sports cards'))
    evidence = result.get('evidence') or {}
    identified = (result['status'] == 'confirmed' and matching_type
                  and all(fields.get(k) for k in ('set', 'cardNumber', 'player', 'year', 'manufacturer'))
                  and bool(evidence.get('frontOcrText') or fields.get('frontOcrText'))
                  and bool(evidence.get('backOcrText') or fields.get('backOcrText')))
    return result, 'identified' if identified else 'needs-review'


SCHEMA = '''
CREATE TABLE IF NOT EXISTS collections (
 id TEXT PRIMARY KEY, collection_key TEXT NOT NULL UNIQUE,
 division TEXT NOT NULL CHECK(division IN ('Pokémon','Sports Cards')),
 card_type TEXT NOT NULL, name TEXT NOT NULL, set_name TEXT NOT NULL,
 year TEXT, manufacturer TEXT, edition TEXT, language TEXT
);
CREATE TABLE IF NOT EXISTS physical_locations (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('box','binder','row','container','shelf','other')),
 parent_id TEXT REFERENCES physical_locations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS location_identity ON physical_locations(COALESCE(parent_id,''),kind,name);
CREATE TABLE IF NOT EXISTS cards (
 id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, import_hash TEXT NOT NULL,
 front_image_path TEXT NOT NULL, back_image_path TEXT NOT NULL,
 image_fingerprint TEXT NOT NULL UNIQUE,
 card_type TEXT NOT NULL CHECK(card_type IN ('pokemon','baseball','basketball','football','hockey','soccer','racing')),
 division TEXT NOT NULL CHECK(division IN ('Pokémon','Sports Cards')),
 set_name TEXT, card_number TEXT, variant TEXT, condition TEXT, grade TEXT,
 collection_id TEXT REFERENCES collections(id), location_id TEXT REFERENCES physical_locations(id),
 status TEXT NOT NULL CHECK(status IN ('identified','needs-review')),
 on_hand INTEGER NOT NULL CHECK(typeof(on_hand)='integer' AND on_hand BETWEEN 0 AND 2147483647),
 listed INTEGER NOT NULL CHECK(typeof(listed)='integer' AND listed BETWEEN 0 AND on_hand),
 seller_price_cents INTEGER CHECK(seller_price_cents IS NULL OR
   (typeof(seller_price_cents)='integer' AND seller_price_cents BETWEEN 0 AND 9999999999)),
 identification TEXT NOT NULL CHECK(json_valid(identification)),
 original_identification TEXT NOT NULL CHECK(json_valid(original_identification)),
 evidence_sources TEXT NOT NULL CHECK(json_valid(evidence_sources)),
 review_history TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(review_history)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS price_history (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id),
 amount_cents INTEGER CHECK(amount_cents IS NULL OR (typeof(amount_cents)='integer' AND amount_cents>=0)),
 currency TEXT NOT NULL CHECK(currency='USD'),
 provider TEXT NOT NULL, verification TEXT NOT NULL CHECK(verification IN ('unverified','unavailable')),
 observed_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
 evidence TEXT NOT NULL CHECK(json_valid(evidence)),
 identity_snapshot TEXT NOT NULL CHECK(json_valid(identity_snapshot))
);
CREATE INDEX IF NOT EXISTS prices_by_card ON price_history(card_id,recorded_at);
'''


class CardStore:
    def __init__(self, path):
        self.path = Path(path).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, timeout=10)
        self.db.row_factory = sqlite3.Row
        self._transaction_depth = 0
        self.db.execute('PRAGMA foreign_keys=ON')
        version = self.db.execute('PRAGMA user_version').fetchone()[0]
        if version not in (0, 1):
            self.db.close()
            raise FactoryError('Unsupported local schema version; database not modified')
        self.db.executescript(SCHEMA)
        # Additive local-only extensions; no table replacement or data deletion.
        card_columns = {r[1] for r in self.db.execute('PRAGMA table_info(cards)')}
        if 'verification' not in card_columns:
            self.db.execute("ALTER TABLE cards ADD COLUMN verification TEXT NOT NULL DEFAULT '{}'")
        location_columns = {r[1] for r in self.db.execute('PRAGMA table_info(physical_locations)')}
        if 'display_kind' not in location_columns:
            self.db.execute('ALTER TABLE physical_locations ADD COLUMN display_kind TEXT')
        self.db.execute('''CREATE TABLE IF NOT EXISTS scanner_requests (
            request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, card_id TEXT NOT NULL REFERENCES cards(id))''')
        self.db.execute('PRAGMA user_version=1')
        self.db.commit()

    @contextmanager
    def transaction(self):
        outer = self._transaction_depth == 0
        self._transaction_depth += 1
        if outer:
            self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            if outer:
                self.db.commit()
        except Exception:
            if outer:
                self.db.rollback()
            raise
        finally:
            self._transaction_depth -= 1

    def close(self):
        self.db.close()

    def _collection(self, card_type, result, status):
        if status != 'identified':
            return None
        f = result['fields']
        parts = [card_type] + [f.get(k) for k in ('set', 'year', 'manufacturer', 'edition', 'language')]
        key = encode(parts)  # Do not collapse potentially different sets/editions by fuzzy matching.
        row = self.db.execute('SELECT id FROM collections WHERE collection_key=?', (key,)).fetchone()
        if row:
            return row['id']
        cid = str(uuid.uuid4())
        self.db.execute('INSERT INTO collections VALUES (?,?,?,?,?,?,?,?,?,?)', (
            cid, key, 'Pokémon' if card_type == 'pokemon' else 'Sports Cards', card_type,
            ' / '.join(str(p) for p in parts if p), f['set'], f['year'], f['manufacturer'],
            f['edition'], f['language']))
        return cid

    def _location(self, location_id):
        if location_id is not None and not self.db.execute('SELECT 1 FROM physical_locations WHERE id=?', (location_id,)).fetchone():
            raise FactoryError('Unknown physical location')

    def add_location(self, name, kind, parent_id=None):
        name = text(name, 'Location name')
        display_kind = kind
        if kind == 'binder_page':
            kind = 'row'
        if kind not in ('box', 'binder', 'row', 'container', 'shelf', 'other'):
            raise FactoryError('Unsupported location kind')
        self._location(parent_id)
        with self.transaction():
            self.db.execute('INSERT OR IGNORE INTO physical_locations (id,name,kind,parent_id,display_kind) VALUES (?,?,?,?,?)', (str(uuid.uuid4()), name, kind, parent_id, display_kind))
        row = self.db.execute('SELECT * FROM physical_locations WHERE name=? AND kind=? AND parent_id IS ?', (name, kind, parent_id)).fetchone()
        return {**dict(row), 'kind': row['display_kind'] or row['kind']}

    def list_locations(self):
        return [{**dict(r), 'kind': r['display_kind'] or r['kind']} for r in self.db.execute('SELECT * FROM physical_locations ORDER BY name,id')]

    def list_collections(self):
        return [dict(r) for r in self.db.execute('SELECT * FROM collections ORDER BY name,id')]

    def add_card(self, data):
        if not isinstance(data, dict):
            raise FactoryError('Card input must be an object')
        source_key = text(data.get('source_key'), 'source_key')
        card_type = data.get('card_type')
        if card_type not in CARD_TYPES:
            raise FactoryError('Unsupported card_type')
        on_hand, listed = data.get('on_hand', 1), data.get('listed', 0)
        counts(on_hand, listed)
        seller_price = money(data.get('seller_price'))
        self._location(data.get('location_id'))
        evidence = data.get('evidence_sources', [])
        if not isinstance(evidence, list) or any(not isinstance(item, dict) for item in evidence):
            raise FactoryError('evidence_sources must be an array of objects')
        condition = data.get('condition')
        if condition is not None:
            condition = text(condition, 'condition')
        paths, hashes = [], []
        for side in ('front', 'back'):
            path = Path(text(data.get(f'{side}_image_path'), f'{side}_image_path')).expanduser().resolve()
            if not path.is_file():
                raise FactoryError(f'{side} image file does not exist')
            # Read in chunks; no image is uploaded or copied to the cloud.
            with path.open('rb') as stream:
                hashes.append(hashlib.file_digest(stream, 'sha256').hexdigest())
            paths.append(str(path))
        fingerprint = hashlib.sha256(encode(sorted(hashes)).encode()).hexdigest()
        import_hash = hashlib.sha256(encode({'input': data, 'images': hashes}).encode()).hexdigest()
        existing = self.db.execute('SELECT id,import_hash FROM cards WHERE source_key=?', (source_key,)).fetchone()
        if existing:
            if existing['import_hash'] != import_hash:
                raise FactoryError('source_key already exists with different content; use explicit review/update')
            return self.get_card(existing['id'])
        raw = data.get('identification') or {'status': 'unknown', 'fields': {}}
        result, status = classify(card_type, raw)
        f = result['fields']
        card_id, timestamp = str(uuid.uuid4()), now()
        try:
            with self.transaction():
                cid = self._collection(card_type, result, status)
                row = dict(id=card_id, source_key=source_key, import_hash=import_hash,
                           front_image_path=paths[0], back_image_path=paths[1], image_fingerprint=fingerprint,
                           card_type=card_type, division='Pokémon' if card_type == 'pokemon' else 'Sports Cards',
                           set_name=f['set'] if cid else None, card_number=f['cardNumber'],
                           variant=f['variant'] or f['parallel'], condition=condition, grade=f['grade'],
                           collection_id=cid, location_id=data.get('location_id'), status=status,
                           on_hand=on_hand, listed=listed, seller_price_cents=seller_price,
                           identification=encode(result), original_identification=encode(raw),
                           evidence_sources=encode(evidence), review_history='[]', created_at=timestamp, updated_at=timestamp)
                self.db.execute(f"INSERT INTO cards ({','.join(row)}) VALUES ({','.join('?' for _ in row)})", tuple(row.values()))
        except sqlite3.IntegrityError:
            raise FactoryError('Duplicate image pair/source key or invalid local record; nothing overwritten') from None
        return self.get_card(card_id)

    def get_card(self, card_id):
        row = self.db.execute('SELECT * FROM cards WHERE id=?', (card_id,)).fetchone()
        if row is None:
            raise FactoryError('Unknown card ID')
        card = dict(row)
        for key in ('identification', 'original_identification', 'evidence_sources', 'review_history', 'verification'):
            card[key] = json.loads(card[key])
        card['available'] = card['on_hand'] - card['listed']
        card['price_history'] = self.price_history(card_id)
        return card

    def price_history(self, card_id):
        rows = []
        for row in self.db.execute('SELECT * FROM price_history WHERE card_id=? ORDER BY recorded_at,rowid', (card_id,)):
            item = dict(row)
            for key in ('evidence', 'identity_snapshot'):
                item[key] = json.loads(item[key])
            rows.append(item)
        return rows

    def record_price(self, card_id, quote):
        current = self.get_card(card_id)
        amount = money(quote.get('market'))
        provider = text(quote.get('provider'), 'Pricing provider')
        if quote.get('currency', 'USD') != 'USD':
            raise FactoryError('Only explicitly USD pricing can be recorded')
        timestamp = now()
        with self.transaction():
            self.db.execute('INSERT INTO price_history VALUES (?,?,?,?,?,?,?,?,?,?)', (
                str(uuid.uuid4()), card_id, amount, 'USD', provider,
                'unverified' if amount is not None else 'unavailable',
                quote.get('fetchedAt') or timestamp, timestamp, encode(quote), encode({**current['identification'], 'observed_condition': current['condition'], 'verification': current['verification']})))
        return self.get_card(card_id)

    def refresh_price(self, card_id, allow_network=False):
        current = self.get_card(card_id)
        if current['status'] != 'identified':
            raise FactoryError('Review the card identity before pricing')
        quote = adapter(dict(operation='price', identification=current['identification'], allowNetwork=allow_network,
                             verifiedIdentity=current['verification'].get('outcome') == 'verified'))
        return self.record_price(card_id, quote)

    def list_cards(self):
        return [self.get_card(r['id']) for r in self.db.execute('SELECT id FROM cards ORDER BY created_at,id')]

    def update_stock(self, card_id, *, on_hand, listed, location_id=None):
        current = self.get_card(card_id)
        counts(on_hand, listed)
        location_id = current['location_id'] if location_id is None else location_id
        self._location(location_id)
        with self.transaction():
            self.db.execute('UPDATE cards SET on_hand=?,listed=?,location_id=?,updated_at=? WHERE id=?',
                            (on_hand, listed, location_id, now(), card_id))
        return self.get_card(card_id)

    def set_seller_price(self, card_id, value):
        self.get_card(card_id)
        cents = money(value)
        with self.transaction():
            self.db.execute('UPDATE cards SET seller_price_cents=?,updated_at=? WHERE id=?', (cents, now(), card_id))
        return self.get_card(card_id)

    def review_card(self, card_id, identification, note):
        current = self.get_card(card_id)
        note = text(note, 'Review note')
        result, status = classify(current['card_type'], identification)
        history = current['review_history'] + [dict(at=now(), note=note, original=current['identification'], corrected=result)]
        f = result['fields']
        with self.transaction():
            cid = self._collection(current['card_type'], result, status)
            self.db.execute('''UPDATE cards SET identification=?,review_history=?,verification='{}',status=?,collection_id=?,
                set_name=?,card_number=?,variant=?,grade=?,updated_at=? WHERE id=?''',
                (encode(result), encode(history), status, cid, f['set'] if cid else None,
                 f['cardNumber'], f['variant'] or f['parallel'], f['grade'], now(), card_id))
        return self.get_card(card_id)


    def stage_card(self, data, *, fields, note, actor, request_id, verified=False):
        request_id = text(request_id, 'request_id')
        actor = text(actor, 'actor')
        payload_hash = hashlib.sha256(encode([data, fields, note, actor, verified]).encode()).hexdigest()
        with self.transaction():
            prior = self.db.execute('SELECT * FROM scanner_requests WHERE request_id=?', (request_id,)).fetchone()
            if prior:
                if prior['request_hash'] != payload_hash:
                    raise FactoryError('Save request already exists with different content')
                return self.get_card(prior['card_id'])
            existing = self.db.execute('SELECT id FROM cards WHERE source_key=?',(data.get('source_key'),)).fetchone()
            if existing:
                card = self.get_card(existing['id'])
                if any(str(Path(data[k]).resolve()) != card[k] for k in ('front_image_path','back_image_path')):
                    raise FactoryError('Correction cannot replace the original image pair')
                if data['card_type'] not in CARD_TYPES:
                    raise FactoryError('Unsupported card_type')
                counts(data.get('on_hand',1),data.get('listed',0))
                self._location(data.get('location_id'))
                price = money(data.get('seller_price'))
                self.db.execute('UPDATE cards SET card_type=?,division=?,on_hand=?,listed=?,location_id=?,condition=?,seller_price_cents=? WHERE id=?',
                    (data['card_type'],'Pokémon' if data['card_type']=='pokemon' else 'Sports Cards',data.get('on_hand',1),data.get('listed',0),
                     data.get('location_id'),data.get('condition'),price,card['id']))
                card = self.get_card(card['id'])
            else:
                card = self.add_card(data)
            if fields is not None:
                note = text(note, 'Review note')
                corrected, _ = classify(card['card_type'], dict(status='needs_review', fields=fields,
                                                               evidence=card['identification'].get('evidence')))
                f = corrected['fields']
                if verified:
                    required = ('player', 'set', 'cardNumber', 'year', 'manufacturer')
                    if not all(f.get(k) for k in required):
                        raise FactoryError('Verification requires player, set, number, year and manufacturer')
                    game = (f.get('cardGame') or '').lower().replace('é','e')
                    if (card['card_type'] == 'pokemon' and not game.startswith('pokemon')) or (
                        card['card_type'] != 'pokemon' and f.get('sport') != card['card_type']):
                        raise FactoryError('Verification does not match the selected card type')
                status = 'identified' if verified else 'needs-review'
                cid = self._collection(card['card_type'], corrected, status)
                verification = dict(outcome='verified' if verified else 'unverified',actor=actor,at=now(),note=note)
                history = card['review_history'] + [dict(action='identification_correction', at=now(),
                    original=card['identification'], corrected=corrected, verification=verification,
                    evidence=dict(image_fingerprint=card['image_fingerprint']),
                    model=card['original_identification'].get('model'), test_result=None)]
                self.db.execute('''UPDATE cards SET identification=?,review_history=?,verification=?,status=?,
                  collection_id=?,set_name=?,card_number=?,variant=?,grade=?,updated_at=? WHERE id=?''',
                  (encode(corrected),encode(history),encode(verification),status,cid,f['set'] if cid else None,
                   f['cardNumber'],f['variant'] or f['parallel'],f['grade'],now(),card['id']))
            self.db.execute('INSERT INTO scanner_requests VALUES (?,?,?)',(request_id,payload_hash,card['id']))
            return self.get_card(card['id'])

    def reassign_collection(self, card_id, collection_id, note, actor):
        card = self.get_card(card_id)
        collection = self.db.execute('SELECT * FROM collections WHERE id=?',(collection_id,)).fetchone()
        if not collection or collection['card_type'] != card['card_type']:
            raise FactoryError('Collection must exist and match the card type')
        history = card['review_history'] + [dict(action='collection_reassignment',at=now(),
            original_collection=card['collection_id'],corrected_collection=collection_id,
            note=text(note,'Reassignment note'),actor=text(actor,'actor'))]
        with self.transaction():
            self.db.execute('UPDATE cards SET collection_id=?,review_history=?,updated_at=? WHERE id=?',
                            (collection_id,encode(history),now(),card_id))
        return self.get_card(card_id)

    def learning_lessons(self):
        lessons = []
        for card in self.list_cards():
            for index, event in enumerate(card['review_history']):
                if event.get('verification',{}).get('outcome') != 'verified':
                    continue
                lessons.append(dict(id=card['id']+':'+str(index),card_id=card['id'],
                    original=event['original'],corrected=event['corrected'],evidence=event['evidence'],
                    model=event.get('model'),confidence=event['original'].get('confidenceScore'),
                    verification_outcome='verified',verification=event['verification'],
                    test_result=event.get('test_result'),promotion_status='pending_regression'))
        return lessons
