// Node-only service: authenticated routes supply the session. No cloud inventory writer.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { z } = require('zod');
const { identifyCard } = require('../cardIdentification');
const { emptyCardFields } = require('../cardFields');
const { normalizeIdentification } = require('../cardFactoryAdapters');
const uuid = z.string().uuid();
const TYPES = ['pokemon','baseball','basketball','football','hockey','soccer','racing'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function identifier(value) { if (!uuid.safeParse(value).success) fail('Invalid identifier'); return value.toLowerCase(); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function image(input) {
  if (!input || !Buffer.isBuffer(input.bytes) || !input.bytes.length || input.bytes.length > MAX_IMAGE_BYTES) fail('Both image sides are required, each at most 4 MB.');
  const b = input.bytes;
  let mime;
  if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255) mime = 'image/jpeg';
  else if (b.length >= 16 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') mime = 'image/webp';
  else fail('Use a JPEG, PNG or WebP photo; SVG and unconverted HEIC are not accepted.');
  return { bytes:b, mime, sha256:digest(b) };
}
function publicCard(card) {
  const { front_image_path, back_image_path, import_hash, ...rest } = card;
  return rest;
}
function runBridge(database, request, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ env.CARD_FACTORY_PYTHON || 'python', ['-m','scripts.card_factory.bridge',database], {
      cwd:process.cwd(), env:{...process.env,...env}, stdio:['pipe','pipe','pipe'], windowsHide:true,
    });
    let stdout = '', done = false;
    const finish = (error, result) => { if(done) return; done=true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    const timer=setTimeout(()=>{child.kill();finish(Object.assign(new Error('Local staging timed out. Retry with the same save request.'),{status:503}));},60000);
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16_000_000){child.kill();finish(new Error('Local response too large'));}});
    // Never log Python stderr: it could contain environment/library diagnostics.
    child.stderr.resume();
    child.on('error',()=>finish(Object.assign(new Error('Local Python runtime unavailable'),{status:503})));
    child.on('close',()=>{
      try { const response=JSON.parse(stdout); if(!response.ok) finish(Object.assign(new Error(response.error || 'Local operation failed'),{status:409}));else finish(null,response.result); }
      catch { finish(Object.assign(new Error('Local runtime returned an invalid response'),{status:503})); }
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify(request));
  });
}
function createScannerService({env=process.env, identify=identifyCard}={}) {
  async function scope(session) {
    if(env.CARD_FACTORY_LOCAL_ENABLED !== '1' || !env.BOSS_CARD_FACTORY_ROOT || !path.isAbsolute(env.BOSS_CARD_FACTORY_ROOT)) fail('Local staging is not enabled. Configure the existing BossListers desktop runtime.',503);
    const tenantId=identifier(session?.tenantId), userId=identifier(session?.userId);
    const root=path.resolve(env.BOSS_CARD_FACTORY_ROOT), publicRoot=path.resolve(process.cwd(),'public');
    if(root===publicRoot || root.startsWith(publicRoot+path.sep)) fail('Staging needs a private directory outside public assets.',503);
    await fs.mkdir(root,{recursive:true,mode:0o700});
    const realRoot=await fs.realpath(root);
    if(realRoot===publicRoot || realRoot.startsWith(publicRoot+path.sep)) fail('Staging needs a private directory outside public assets.',503);
    const directory=path.join(realRoot,tenantId);
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    return {directory,tenantId,userId,database:path.join(directory,'cards.sqlite3')};
  }
  async function call(session,operation,data) {
    const scoped=await scope(session);
    return runBridge(scoped.database,{operation,data,tenant_id:scoped.tenantId},env);
  }
  function owner(session) {
    return env.PLATFORM_OWNER_TENANT_ID && session.tenantId.toLowerCase() === env.PLATFORM_OWNER_TENANT_ID.toLowerCase();
  }
  async function getCapture(session,id) {
    const s=await scope(session), captureId=identifier(id);
    try {return JSON.parse(await fs.readFile(path.join(s.directory,'captures',captureId,'capture.json'),'utf8'));}
    catch {fail('Capture not found or still processing. Retry shortly.',404);}
  }
  async function capture(session, input) {
    const s=await scope(session), id=identifier(input.captureId), front=image(input.front), back=image(input.back);
    const fingerprint=digest(front.sha256+back.sha256), directory=path.join(s.directory,'captures',id);
    await fs.mkdir(path.dirname(directory),{recursive:true,mode:0o700});
    try {await fs.mkdir(directory,{mode:0o700});} catch(error) {
      if(error.code!=='EEXIST') throw error;
      const previous=await getCapture(session,id);
      if(previous.fingerprint!==fingerprint) fail('Capture ID already has different photos; create a new scan.',409);
      return previous;
    }
    try {
      await fs.writeFile(path.join(directory,'front'),front.bytes,{flag:'wx',mode:0o600});
      await fs.writeFile(path.join(directory,'back'),back.bytes,{flag:'wx',mode:0o600});
      let identification={status:'unknown',confidenceScore:0,fields:emptyCardFields(),candidates:[],evidence:null};
      let source='unavailable', model=null, notice='Automatic identification is disabled or unavailable. Save for review or enter verified details.';
      if(env.CARD_FACTORY_ALLOW_PAID_AI==='approved' && env.GEMINI_API_KEY && owner(session)) {
        try {
          const response=await identify({frontBytes:front.bytes,frontMime:front.mime,backBytes:back.bytes,backMime:back.mime,
            apiKey:env.GEMINI_API_KEY,model:env.GEMINI_CARD_MODEL || 'gemini-2.0-flash',
            fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})});
          identification=normalizeIdentification(response);
          source='gemini-vision'; model=env.GEMINI_CARD_MODEL || 'gemini-2.0-flash';
          notice=identification.status==='unknown' ? 'No reliable identity. Retake clear photos or save for review.' : 'Check the identity and variant against both photos before verifying.';
        } catch {notice='Recognition failed safely. Photos retained; no identity was invented.';}
      }
      const result={captureId:id,fingerprint,identification:{...identification,source,model},notice,
        confidences:{identification:identification.confidenceScore,variant:null,condition:null,valuation:null},
        images:{front:{mime:front.mime,sha256:front.sha256},back:{mime:back.mime,sha256:back.sha256}},createdAt:new Date().toISOString()};
      await fs.writeFile(path.join(directory,'capture.json'),JSON.stringify(result),{flag:'wx',mode:0o600});
      return result;
    } catch(error) {
      // Only our new, incomplete capture directory is removed; no prior inventory is touched.
      await fs.rm(directory,{recursive:true,force:true}); throw error;
    }
  }
  async function stage(session, raw) {
    const body=z.object({captureId:uuid,requestId:uuid,cardType:z.enum(TYPES),
      fields:z.record(z.string(),z.unknown()).nullable(),verified:z.boolean(),note:z.string().trim().min(1).max(2000),
      onHand:z.number().int().min(0).max(2147483647),listed:z.number().int().min(0).max(2147483647),
      locationId:uuid.nullable(),condition:z.string().max(2000).nullable(),sellerPrice:z.string().max(32).nullable(),
    }).strict().parse(raw);
    if(body.listed>body.onHand) fail('Listed quantity cannot exceed on-hand quantity.');
    const s=await scope(session), source=await getCapture(session,body.captureId);
    const fields=body.fields ? normalizeIdentification({status:'needs_review',fields:body.fields}).fields : null;
    const data={source_key:source.captureId,card_type:body.cardType,
      front_image_path:path.join(s.directory,'captures',source.captureId,'front'),
      back_image_path:path.join(s.directory,'captures',source.captureId,'back'),
      identification:source.identification,evidence_sources:[{kind:'scanner-capture',captureId:source.captureId,
        images:source.images,model:source.identification.model,source:source.identification.source}],
      on_hand:body.onHand,listed:body.listed,location_id:body.locationId,condition:body.condition,seller_price:body.sellerPrice};
    if(body.verified && !fields) fail('Verification requires reviewed fields.');
    const card=await call(session,'stage',{data,fields,note:body.note,actor:s.userId,request_id:body.requestId,verified:body.verified});
    return publicCard(card);
  }
  async function location(session,raw) {
    const body=z.object({name:z.string().trim().min(1).max(120),kind:z.enum(['box','binder','binder_page','row','container','shelf','other']),parent_id:uuid.nullable()}).strict().parse(raw);
    return call(session,'location',body);
  }
  async function list(session) {
    const result=await call(session,'list');return {...result,cards:result.cards.map(publicCard)};
  }
  async function preview(session) {
    const result=await call(session,'preview');
    result.metadata.cards=result.metadata.cards.map(publicCard);
    return {...result,mode:'preview-only',syncEnabled:false};
  }
  async function photo(session,id,side) {
    if(!['front','back'].includes(side)) fail('Invalid photo side');
    const source=await getCapture(session,id), s=await scope(session);
    return {bytes:await fs.readFile(path.join(s.directory,'captures',identifier(id),side)),mime:source.images[side].mime};
  }
  async function price(session,id) {
    if(env.CARD_FACTORY_ALLOW_EBAY !== 'approved' || !owner(session)) fail('Pricing requests require explicit server approval for the owner tenant.',403);
    return publicCard(await call(session,'price',{card_id:identifier(id),allow_network:true}));
  }
  async function stock(session,raw) {
    const body=z.object({card_id:uuid,on_hand:z.number().int().min(0),listed:z.number().int().min(0),location_id:uuid.nullable()}).strict().parse(raw);
    return publicCard(await call(session,'stock',body));
  }
  async function reassign(session,raw) {
    const body=z.object({card_id:uuid,collection_id:uuid,note:z.string().trim().min(1).max(2000)}).strict().parse(raw);
    return publicCard(await call(session,'reassign',{...body,actor:(await scope(session)).userId}));
  }
  return {capture,getCapture,stage,location,list,preview,photo,price,stock,reassign,
    async context(session) {await scope(session);return {scope:`${session.tenantId}:${session.userId}`,localStaging:true,
      recognitionEnabled:env.CARD_FACTORY_ALLOW_PAID_AI==='approved' && !!env.GEMINI_API_KEY && !!owner(session),
      pricingEnabled:env.CARD_FACTORY_ALLOW_EBAY==='approved' && !!owner(session),syncEnabled:false};},
    async lessons(session) {return call(session,'lessons');},
    async sync() {fail('Cloud sync is disabled pending schema verification and write approval. No data was sent.',409);},
  };
}
module.exports={createScannerService,MAX_IMAGE_BYTES,publicCard};
