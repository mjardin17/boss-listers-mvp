"""Read-only schema contract checks. Never execute migration SQL or a database write."""
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from .store import ROOT, FactoryError

# Only exported columns are required; this is a mapping, not a second DB schema.
EXPORT_TYPES = dict(sku='text', title='text', description='text', price='numeric',
                    quantity='integer', image_url='text', condition='text', status='text',
                    source='text', published='boolean', tenant_id='uuid')


def check_repository_schema(root=ROOT):
    paths = sorted((root / 'supabase/migrations').glob('*.sql'))
    columns, evidence, tenant_unique = {}, [], False
    for path in paths:
        raw = path.read_text(encoding='utf-8')
        sql = re.sub(r'--[^\n]*', '', raw)
        if not re.search(r'\bpublic\.products\b', sql, re.I):
            continue
        evidence.append(dict(path=str(path.relative_to(root)), sha256=hashlib.sha256(raw.encode()).hexdigest()))
        create = re.search(r'create table if not exists public\.products\s*\((.*?)\n\);', sql, re.I | re.S)
        if create:
            for line in create.group(1).splitlines():
                m = re.match(r'\s*(\w+)\s+(uuid|text|numeric\([^)]*\)|integer|boolean|timestamptz)(.*)', line, re.I)
                if m:
                    name, typename, rest = m.groups()
                    columns[name] = dict(type=typename.lower(), not_null='not null' in rest.lower(),
                                         has_default='default' in rest.lower())
        for alter in re.finditer(r'alter table public\.products\s+(.*?);', sql, re.I | re.S):
            body = alter.group(1)
            for m in re.finditer(r'add column if not exists\s+(\w+)\s+(uuid|text|numeric\([^)]*\)|integer|boolean|timestamptz)(.*?)(?=,\s*add column|$)', body, re.I | re.S):
                name, typename, rest = m.groups()
                columns[name] = dict(type=typename.lower(), not_null='not null' in rest.lower(),
                                     has_default='default' in rest.lower())
            for m in re.finditer(r'alter column (\w+) set not null', body, re.I):
                if m.group(1) in columns:
                    columns[m.group(1)]['not_null'] = True
            for m in re.finditer(r'alter column (\w+) set default', body, re.I):
                if m.group(1) in columns:
                    columns[m.group(1)]['has_default'] = True
            # Fail closed on changes this deliberately narrow reader cannot interpret.
            if re.search(r'\b(drop column|rename|alter column \w+ (?:type|drop))\b', body, re.I):
                raise FactoryError('Products schema changed beyond supported contract; review export mapping')
        if re.search(r'create unique index[^;]+on public\.products\s*\(tenant_id,\s*sku\)', sql, re.I):
            tenant_unique = True
    for name, expected in EXPORT_TYPES.items():
        if name not in columns or not columns[name]['type'].startswith(expected):
            raise FactoryError('Repository products schema does not match the export contract')
    if not tenant_unique or not columns['tenant_id']['not_null']:
        raise FactoryError('Tenant-scoped inventory key could not be verified')
    for name, details in columns.items():
        if details['not_null'] and not details['has_default'] and name not in EXPORT_TYPES:
            raise FactoryError('Products schema has an unsupported required column')
    return dict(mode='repository-only', target_table='public.products', live_verified=False,
                columns=columns, unique_key=['tenant_id', 'sku'], evidence=evidence,
                limitation='Checks checked-in migration declarations, not deployed RLS, triggers, tenant membership or migration application.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise FactoryError('Schema endpoint redirected; refused to forward credentials')


def check_live_schema():
    """Opt-in GET of PostgREST OpenAPI metadata. No rows queried, no writes/RPC."""
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY')
    token = os.environ.get('SUPABASE_SCHEMA_TOKEN') or key
    parsed = urlsplit(url)
    if not url or not key or not token:
        raise FactoryError('Live schema check needs SUPABASE_URL and an authorized environment key/token')
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
        raise FactoryError('SUPABASE_URL must be an HTTPS origin without credentials, path, or query')
    request = urllib.request.Request(url + '/rest/v1/', method='GET', headers={
        'apikey':key, 'Authorization':'Bearer ' + token, 'Accept':'application/openapi+json'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            document = json.load(response)
    except urllib.error.HTTPError as error:
        raise FactoryError(f'Live schema GET failed with HTTP {error.code}; response details withheld') from None
    except (OSError, ValueError):
        raise FactoryError('Live schema GET failed; details withheld to protect credentials') from None
    product = document.get('definitions', {}).get('products', {})
    properties = product.get('properties', {})
    json_types = dict(text='string', uuid='string', numeric='number', integer='integer', boolean='boolean')
    for name, expected in EXPORT_TYPES.items():
        actual = properties.get(name, {})
        if actual.get('type') != json_types[expected]:
            raise FactoryError('Live products schema is unavailable or incompatible with the export mapping')
    return dict(mode='live-openapi-get', target_table='public.products', live_verified=True,
                columns_checked=list(EXPORT_TYPES), production_written=False,
                limitation='Column/type visibility only; does not prove tenant membership, unique indexes, defaults, constraints or import permissions.')
