import { withSession } from '../../../../lib/requireSessionApp';
import { createScannerService } from '../../../../lib/cardScanner/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const service = createScannerService();
const headers = {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function bounded(request, limit) {
  if(Number(request.headers.get('content-length'))>limit) throw Object.assign(new Error('Upload too large'),{status:413});
  const reader=request.body?.getReader(); let length=0;const chunks=[];
  if(reader) while(true) {
    const {done,value}=await reader.read();if(done)break;
    length+=value.byteLength;if(length>limit){await reader.cancel();throw Object.assign(new Error('Upload too large'),{status:413});}
    chunks.push(value);
  }
  return new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type') || 'application/json'},body:Buffer.concat(chunks)});
}
async function handler(request, context, session) {
  try {
    const {action}=await context.params;
    let result;
    if(request.method==='GET') {
      if(action==='context') result=await service.context(session);
      else if(action==='capture') result=await service.getCapture(session,new URL(request.url).searchParams.get('id'));
      else if(action==='list') result=await service.list(session);
      else if(action==='photo') {
        const url=new URL(request.url), photo=await service.photo(session,url.searchParams.get('id'),url.searchParams.get('side'));
        return new Response(new Uint8Array(photo.bytes),{headers:{...headers,'Content-Type':photo.mime,'Content-Security-Policy':"default-src 'none'"}});
      } else throw Object.assign(new Error('Unknown action'),{status:404});
    } else if(action==='capture') {
      // Auth runs before any request body is read. Bound even chunked requests.
      const boundedRequest=await bounded(request,9*1024*1024),form=await boundedRequest.formData();
      const front=form.get('front'),back=form.get('back');
      if(!front?.arrayBuffer || !back?.arrayBuffer) throw Object.assign(new Error('Both front and back photos are required'),{status:400});
      result=await service.capture(session,{captureId:form.get('captureId'),front:{bytes:Buffer.from(await front.arrayBuffer()),mime:front.type},back:{bytes:Buffer.from(await back.arrayBuffer()),mime:back.type}});
    } else {
      const body=await (await bounded(request,200000)).json();
      if(action==='stage') result=await service.stage(session,body);
      else if(action==='location') result=await service.location(session,body);
      else if(action==='stock') result=await service.stock(session,body);
      else if(action==='reassign') result=await service.reassign(session,body);
      else if(action==='preview') result=await service.preview(session);
      else if(action==='price') result=await service.price(session,body.id);
      else if(action==='lessons') result=await service.lessons(session);
      else if(action==='sync') result=await service.sync(session,body);
      else throw Object.assign(new Error('Unknown action'),{status:404});
    }
    return new Response(JSON.stringify({ok:true,...(Array.isArray(result)?{items:result}:result)}),{headers});
  } catch(error) {
    const validation=error?.name==='ZodError' || error instanceof SyntaxError;
    const status=validation?400:(error.status || 500);
    return new Response(JSON.stringify({ok:false,error:validation?'Invalid scanner input; check fields and quantities.':status<500?error.message:'Local scanner unavailable. Check runtime configuration and retry; your phone draft is retained.'}),{status,headers});
  }
}
export const GET = withSession(handler);
export const POST = withSession(handler);
