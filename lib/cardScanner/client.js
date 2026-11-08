import imageCompression from 'browser-image-compression';
import {authedFetch} from '../clientAuth';
export async function preparePhoto(file) {
  if(!file || !file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if(file.size>24*1024*1024) throw new Error('Choose an image smaller than 24 MB.');
  try {
    const compressed=await imageCompression(file,{maxSizeMB:3.8,maxWidthOrHeight:2400,
      initialQuality:0.94,maxIteration:3,fileType:'image/jpeg',useWebWorker:false,preserveExif:false});
    if(compressed.size>4*1024*1024) throw new Error('Image remains too large.');
    return new File([compressed],'card.jpg',{type:'image/jpeg'});
  } catch {throw new Error('This image could not be prepared. Try a JPEG or take a fresh camera photo.');}
}
export async function scannerRequest(action,body,options={}) {
  const multipart=typeof FormData!=='undefined' && body instanceof FormData;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
  try {
    const response=await authedFetch(`/api/card-factory/${action}`,{method:body===undefined?'GET':'POST',
      ...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)}),
      headers:multipart?{}:{'Content-Type':'application/json'},signal:controller.signal,...options});
    const result=await response.json();
    if(!response.ok || !result.ok) throw new Error(result.error || 'Scanner request failed.');
    return result;
  } catch(error) {
    if(error.name==='AbortError') throw new Error('Request timed out. Your draft is retained; retry uses the same request ID.');
    throw error;
  } finally {clearTimeout(timer);}
}
