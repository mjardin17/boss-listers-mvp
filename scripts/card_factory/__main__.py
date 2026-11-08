"""python -m scripts.card_factory --help (local-only CLI, no production writer)."""
import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

from .feed import export_feed, validate_product_rows
from .schema import check_live_schema, check_repository_schema
from .store import CardStore, FactoryError


def read_json(path):
    try:
        with Path(path).expanduser().open(encoding='utf-8') as stream:
            return json.load(stream)
    except (OSError, ValueError):
        raise FactoryError('Cannot read valid input JSON; no input content was logged') from None


def parser():
    root = argparse.ArgumentParser(description='BossListers local card storage and draft inventory export. No production writes.')
    root.add_argument('--db', default=os.environ.get('BOSS_CARD_FACTORY_DB', str(Path.home() / 'BossListers/card-factory.sqlite3')),
                      help='Local SQLite path (default: ~/BossListers/card-factory.sqlite3)')
    commands = root.add_subparsers(dest='command', required=True)
    commands.add_parser('init', help='Create/open the local database')
    commands.add_parser('list', help='Show local cards')
    commands.add_parser('locations', help='Show physical locations')
    commands.add_parser('collections', help='Show automatically assigned collections')
    add = commands.add_parser('add', help='Import one card with local front/back paths and an existing identification result')
    add.add_argument('--input', required=True)
    location = commands.add_parser('location-add', help='Add a box, binder, row or container')
    location.add_argument('--name', required=True)
    location.add_argument('--kind', choices=['box','binder','row','container','shelf','other'], required=True)
    location.add_argument('--parent-id')
    stock = commands.add_parser('stock', help='Explicit local stock/location update; never creates listings')
    stock.add_argument('--id', required=True)
    stock.add_argument('--on-hand', required=True, type=int)
    stock.add_argument('--listed', required=True, type=int)
    stock.add_argument('--location-id')
    seller = commands.add_parser('seller-price', help='Set an asking price, separate from market evidence')
    seller.add_argument('--id', required=True)
    group = seller.add_mutually_exclusive_group(required=True)
    group.add_argument('--amount')
    group.add_argument('--clear', action='store_true')
    review = commands.add_parser('review', help='Explicitly replace an identification, preserving original and history')
    review.add_argument('--id', required=True)
    review.add_argument('--input', required=True, help='Existing corrected identification JSON')
    review.add_argument('--note', required=True)
    price = commands.add_parser('price', help='Reuse eBay asking-price adapter; offline unless explicitly enabled')
    price.add_argument('--id', required=True)
    price.add_argument('--allow-network', action='store_true', help='Permit existing eBay Browse API GET using EBAY_APP_TOKEN from environment')
    export = commands.add_parser('export', help='Write products.json, metadata.json and schema-check.json; no import')
    export.add_argument('--tenant-id', required=True, help='Your actual BossListers tenant UUID; never inferred')
    export.add_argument('--output', required=True, help='Parent folder for a new, immutable export directory')
    check = commands.add_parser('check-schema', help='Read-only repository schema check')
    check.add_argument('--live', action='store_true', help='Also GET Supabase OpenAPI metadata using environment credentials')
    validate = commands.add_parser('validate-feed', help='Check an existing products JSON array, offline and read-only')
    validate.add_argument('--input', required=True)
    return root


def execute(args):
    if args.command == 'check-schema':
        result = check_repository_schema()
        if args.live:
            result = dict(repository=result, live=check_live_schema())
        return result
    if args.command == 'validate-feed':
        return validate_product_rows(read_json(args.input))
    # Parse input before touching the database, so malformed JSON creates nothing.
    data = read_json(args.input) if args.command in ('add', 'review') else None
    store = CardStore(args.db)
    try:
        if args.command == 'init':
            return dict(ok=True, database=str(store.path), production_written=False)
        if args.command == 'list':
            return store.list_cards()
        if args.command == 'locations':
            return store.list_locations()
        if args.command == 'collections':
            return store.list_collections()
        if args.command == 'add':
            return store.add_card(data)
        if args.command == 'location-add':
            return store.add_location(args.name, args.kind, args.parent_id)
        if args.command == 'stock':
            return store.update_stock(args.id, on_hand=args.on_hand, listed=args.listed, location_id=args.location_id)
        if args.command == 'seller-price':
            return store.set_seller_price(args.id, None if args.clear else args.amount)
        if args.command == 'review':
            return store.review_card(args.id, data, args.note)
        if args.command == 'price':
            return store.refresh_price(args.id, args.allow_network)
        if args.command == 'export':
            return export_feed(store, args.output, args.tenant_id)
        raise FactoryError('Unsupported command')
    finally:
        store.close()


def main():
    args = parser().parse_args()
    try:
        result = execute(args)
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except FactoryError as error:
        print(f'Card factory: {error}', file=sys.stderr)
    except (OSError, sqlite3.Error, ValueError, TypeError):
        print('Card factory: local operation failed; details withheld. Check input, disk space, and permissions.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
