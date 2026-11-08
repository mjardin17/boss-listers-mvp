"""Export product rows, never import them. The metadata sidecar is NOT a DB row."""
import hashlib
import json
import uuid
from pathlib import Path

from .schema import EXPORT_TYPES, check_repository_schema
from .store import FactoryError, counts, encode, money, now, text


def tenant_uuid(value):
    try:
        result = uuid.UUID(value)
        if result.int == 0:
            raise ValueError
        return str(result)
    except (ValueError, TypeError, AttributeError):
        raise FactoryError('Provide the real BossListers tenant UUID; no default tenant is assumed') from None


def validate_product_rows(rows, schema=None):
    schema = schema or check_repository_schema()
    seen = set()
    if not isinstance(rows, list):
        raise FactoryError('Products feed must be a JSON array')
    for row in rows:
        if not isinstance(row, dict) or set(row) != set(EXPORT_TYPES):
            raise FactoryError('Feed columns do not match the products export mapping')
        for name in ('sku', 'title'):
            text(row[name], name)
        tenant = tenant_uuid(row['tenant_id'])
        key = (tenant, row['sku'])
        if key in seen:
            raise FactoryError('Duplicate tenant/SKU in feed')
        seen.add(key)
        if type(row['price']) not in (int, float) or money(row['price']) is None:
            raise FactoryError('A numeric seller price is required by products')
        counts(row['quantity'], 0)
        if row['status'] != 'draft' or row['source'] != 'manual' or row['published'] is not False:
            raise FactoryError('Local exports must remain unpublished manual drafts')
        if row['image_url'] is not None:
            raise FactoryError('Local images require a separate approved upload; export image_url must be null')
        for name in ('condition', 'description'):
            if row[name] is not None and not isinstance(row[name], str):
                raise FactoryError('Invalid optional product text')
        if not set(row) <= set(schema['columns']):
            raise FactoryError('Export has a column absent from the checked schema')
    return dict(ok=True, rows_checked=len(rows), mode='repository-only', live_verified=False)


def export_feed(store, output_dir, tenant_id):
    tenant_id = tenant_uuid(tenant_id)
    schema = check_repository_schema()
    cards = store.list_cards()
    rows, pending = [], []
    for card in cards:
        reasons = []
        if card['status'] != 'identified':
            reasons.append('needs-review')
        if card['seller_price_cents'] is None:
            reasons.append('seller-price-required')
        if not all(Path(card[key]).is_file() for key in ('front_image_path', 'back_image_path')):
            reasons.append('image-file-missing')
        else:
            hashes = []
            for key in ('front_image_path', 'back_image_path'):
                with Path(card[key]).open('rb') as stream:
                    hashes.append(hashlib.file_digest(stream, 'sha256').hexdigest())
            if hashlib.sha256(encode(sorted(hashes)).encode()).hexdigest() != card['image_fingerprint']:
                reasons.append('image-content-changed')
        if reasons:
            pending.append(dict(id=card['id'], sku='CF-' + card['id'], reasons=reasons))
            continue
        f = card['identification']['fields']
        title = ' '.join(str(v) for v in (f['year'], f['set'], f['player'],
                                         '#' + f['cardNumber'], card['variant'], f['edition']) if v)
        details = [f'{k}: {f[k]}' for k in ('manufacturer','language','gradingCompany','grade','conditionNotes') if f.get(k)]
        rows.append(dict(tenant_id=tenant_id, sku='CF-' + card['id'], title=title,
                         description='; '.join(details) or None,
                         price=card['seller_price_cents'] / 100, quantity=card['on_hand'],
                         image_url=None, condition=card['condition'], status='draft', source='manual', published=False))
    check = validate_product_rows(rows, schema)
    # Each export gets an immutable, separate directory; existing files are never replaced.
    directory = Path(output_dir).expanduser().resolve() / ('export-' + str(uuid.uuid4()))
    directory.mkdir(parents=True, exist_ok=False)
    products = directory / 'products.json'
    products.write_text(json.dumps(rows, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    metadata = dict(format='bosslisters-card-factory-v1', target_table='public.products',
                    created_at=now(), tenant_id=tenant_id, production_written=False,
                    price_semantics='seller-set asking price, not verified market value',
                    import_warning='No importer is run. Do not POST this file to /api/inventory: that endpoint publishes active products.',
                    product_sha256=hashlib.sha256(products.read_bytes()).hexdigest(),
                    cards=cards, collections=store.list_collections(), locations=store.list_locations(), pending=pending)
    meta = directory / 'metadata.json'
    meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    report = directory / 'schema-check.json'
    report.write_text(json.dumps(dict(schema=schema, validation=check), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return dict(products_path=str(products), metadata_path=str(meta), schema_check_path=str(report),
                exported=len(rows), pending=pending, production_written=False)
