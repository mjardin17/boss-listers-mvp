"""Trusted Node-to-Python bridge. Path/tenant are supplied by the authenticated service, never the client."""
import json
import sys
from pathlib import Path
from .store import CardStore, FactoryError
from .feed import export_feed


def main():
    store = None
    try:
        request = json.loads(sys.stdin.read(2_000_001))
        store = CardStore(sys.argv[1])
        op, data = request['operation'], request.get('data', {})
        if op == 'list':
            result = dict(cards=store.list_cards(),collections=store.list_collections(),locations=store.list_locations())
        elif op == 'stage':
            result = store.stage_card(**data)
        elif op == 'location':
            result = store.add_location(**data)
        elif op == 'stock':
            result = store.update_stock(**data)
        elif op == 'reassign':
            result = store.reassign_collection(**data)
        elif op == 'price':
            result = store.refresh_price(**data)
        elif op == 'lessons':
            result = store.learning_lessons()
        elif op == 'preview':
            exported = export_feed(store, store.path.parent/'exports', request['tenant_id'])
            result = dict(products=json.loads(Path(exported['products_path']).read_text()),
                          metadata=json.loads(Path(exported['metadata_path']).read_text()),
                          schema=json.loads(Path(exported['schema_check_path']).read_text()),
                          pending=exported['pending'],production_written=False)
        else:
            raise FactoryError('Unsupported local operation')
        print(json.dumps(dict(ok=True,result=result),ensure_ascii=False,allow_nan=False))
    except FactoryError as error:
        print(json.dumps(dict(ok=False,error=str(error))))
        return 1
    except Exception:
        print(json.dumps(dict(ok=False,error='Local staging failed; check local runtime and disk permissions.')))
        return 1
    finally:
        if store:
            store.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
