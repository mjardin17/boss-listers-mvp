// Transient offline drafts, not a second inventory. No credentials are stored here.
const DB='boss-card-capture-drafts';
function database() {return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Private browser storage is unavailable.'));
});}
async function transaction(mode,action) {
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',mode);const request=action(tx.objectStore('drafts'));
    tx.oncomplete=()=>{resolve(request.result);db.close();};
    tx.onerror=()=>{reject(new Error('Could not preserve the phone draft. Check available storage.'));db.close();};
    tx.onabort=tx.onerror;
  });
}
async function bindingKey(token) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return 'binding:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function bindScope(token,scope) {
  const key=await bindingKey(token);return transaction('readwrite',store=>store.put(scope,key));
}
export async function cachedScope(token) {
  const key=await bindingKey(token);return transaction('readonly',store=>store.get(key));
}
// Store bytes rather than Blob/File handles: WebKit can leave Blob transactions
// pending across navigation. Reconstruct File objects only after a successful read.
const queues=new Map();
function ordered(scope,operation) {
  const next=(queues.get(scope) || Promise.resolve()).catch(()=>{}).then(operation);
  queues.set(scope,next);return next;
}
export async function loadDraft(scope) {
  const draft=await transaction('readonly',store=>store.get('draft:'+scope));
  if(!draft)return null;
  for(const side of ['front','back']) if(draft[side]?.bytes) {
    draft[side]=new File([draft[side].bytes],draft[side].name || 'card.jpg',{type:draft[side].mime || 'image/jpeg'});
  }
  return draft;
}
export function saveDraft(scope,draft) {return ordered(scope,async()=>{
  const stored={...draft};
  for(const side of ['front','back']) if(draft[side]) stored[side]={bytes:await draft[side].arrayBuffer(),mime:draft[side].type,name:draft[side].name};
  return transaction('readwrite',store=>store.put(stored,'draft:'+scope));
});}
export function forgetDraft(scope) {return ordered(scope,()=>transaction('readwrite',store=>store.delete('draft:'+scope)));}
