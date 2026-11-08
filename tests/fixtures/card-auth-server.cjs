// Test-only Supabase-shaped auth fixture. Never loaded by application code.
if(process.env.BOSS_SCANNER_TEST_FIXTURE!=='1') throw new Error('Explicit test-fixture opt-in required');
const http=require('node:http');
http.createServer((req,res)=>{
 if(req.method==='GET' && req.url==='/health'){res.setHeader('Content-Type','application/json');return res.end('{"ok":true,"synthetic":true}');}
 const match=/^Bearer fixture-([0-9a-f-]{36})$/.exec(req.headers.authorization || '');
 res.setHeader('Content-Type','application/json');
 if(!match){res.statusCode=401;return res.end('{"error":"fixture unauthorized"}');}
 if(req.method!=='GET'){res.statusCode=405;return res.end('{"error":"read only fixture"}');}
 if(req.url==='/auth/v1/user')return res.end(JSON.stringify({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'fixture@example.invalid'}));
 if(req.url.startsWith('/rest/v1/tenant_members?'))return res.end(JSON.stringify([{tenant_id:match[1],role:'owner'}]));
 res.statusCode=404;res.end('{"error":"fixture route unavailable"}');
}).listen(3112,'127.0.0.1',()=>console.log('Read-only synthetic auth fixture listening on loopback:3112'));
