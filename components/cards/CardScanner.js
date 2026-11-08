import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import Head from 'next/head';
import {requireSession,clearSession,authedFetch} from '../../lib/clientAuth';
import {newDraft,replacePhoto,canIdentify,reviewState,inferredType,stagePayload,CARD_TYPES} from '../../lib/cardScanner/workflow';
import {preparePhoto,scannerRequest} from '../../lib/cardScanner/client';
import {bindScope,cachedScope,loadDraft,saveDraft,forgetDraft} from '../../lib/cardScanner/draftRepository';
import CardFieldsEditor from './CardFieldsEditor';
import CameraCapture from './CameraCapture';
import StagingInventory from './StagingInventory';
import styles from './CardScanner.module.css';
function Photo({file,side}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!file){setUrl('');return;}const value=URL.createObjectURL(file);setUrl(value);return()=>URL.revokeObjectURL(value);},[file]);
  return url?<img src={url} alt={`${side} of card`} />:<div className="photo-empty"><span>＋</span><p>{side==='front'?'Name & artwork':'Set, number & details'}</p></div>;
}
export default function CardScanner() {
  const [draft,setDraft]=useState(null),[scope,setScope]=useState(null),[capabilities,setCapabilities]=useState(null);
  const [inventory,setInventory]=useState({cards:[],collections:[],locations:[]});
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[online,setOnline]=useState(true),[camera,setCamera]=useState(null);
  const [draftStatus,setDraftStatus]=useState('');
  const initialized=useRef(false),draftRef=useRef(null);
  async function refresh() {try {const result=await scannerRequest('list');setInventory(result);}catch(e){setError(e.message);}}
  useEffect(()=>{
    let alive=true;const session=requireSession();if(!session)return;
    async function boot() {
      let binding;
      try {const context=await scannerRequest('context');if(!alive)return;setCapabilities(context);binding=context.scope;await bindScope(session.accessToken,binding);}
      catch(e){if(alive)setError(e.message);try{binding=await cachedScope(session.accessToken);}catch{/* No usable private storage. */}}
      if(!alive)return;
      if(!binding){setDraft(newDraft());setNotice('Connect to the authenticated desktop runtime before saving. Photos can be captured in this tab.');return;}
      try {const saved=await loadDraft(binding);if(!alive)return;setDraft(saved || newDraft());setScope(binding);initialized.current=true;if(saved)setNotice('Your pending phone draft was restored.');}
      catch(e){setDraft(newDraft());setError(e.message);}
      await refresh();
    }
    boot();
    const connection=()=>setOnline(navigator.onLine);connection();window.addEventListener('online',connection);window.addEventListener('offline',connection);
    return()=>{alive=false;window.removeEventListener('online',connection);window.removeEventListener('offline',connection);};
  },[]);
  useEffect(()=>{
    draftRef.current=draft;
    if(!scope || !draft || !initialized.current)return;
    setDraftStatus('Saving phone draft…');
    const timer=setTimeout(()=>saveDraft(scope,draft).then(()=>setDraftStatus('Phone draft saved on this device')).catch(e=>{setDraftStatus('Draft not saved');setError(e.message);}),200);
    return()=>clearTimeout(timer);
  },[scope,draft]);
  useEffect(()=>{const persist=()=>{if(scope && draftRef.current)saveDraft(scope,draftRef.current).catch(()=>{});};window.addEventListener('pagehide',persist);return()=>window.removeEventListener('pagehide',persist);},[scope]);
  function update(values){setDraft(current=>({...current,...values}));}
  async function photo(side,file){if(!file)return;setBusy('Preparing photo');setError('');try{const prepared=await preparePhoto(file);setDraft(current=>replacePhoto(current,side,prepared));}catch(e){setError(e.message);}finally{setBusy('');}}
  async function capture(){setBusy('Saving photos and checking identity');setError('');try{
    const form=new FormData();form.set('captureId',draft.captureId);form.set('front',draft.front,'front.jpg');form.set('back',draft.back,'back.jpg');
    const result=await scannerRequest('capture',form);update({result,fields:result.identification.fields,cardType:inferredType(result.identification.fields,draft.cardType),saved:null,verified:false});setNotice(result.notice);
  }catch(e){setError(e.message);}finally{setBusy('');}}
  async function stage(){setBusy('Saving to local SQLite');setError('');try{const card=await scannerRequest('stage',stagePayload(draft));update({saved:card});setNotice('Saved to the desktop SQLite staging store. Not yet in cloud inventory.');await refresh();}catch(e){setError(e.message);}finally{setBusy('');}}
  async function reset(){if(!draft.saved && (draft.front || draft.back) && !window.confirm('Discard this unsaved phone draft and start another card?'))return;if(scope)await forgetDraft(scope);setDraft(newDraft());setError('');setNotice('Ready for your next card.');}
  async function editCard(card) {
    if(!draft.saved && (draft.front || draft.back) && !window.confirm('Replace the current phone draft with this saved card?'))return;
    setBusy('Loading saved evidence');setError('');
    try {
      const result=await scannerRequest('capture?id='+encodeURIComponent(card.source_key));
      const photos=await Promise.all(['front','back'].map(async side=>{
        const response=await authedFetch(`/api/card-factory/photo?id=${encodeURIComponent(card.source_key)}&side=${side}`);
        if(!response.ok)throw new Error('Saved photo could not be loaded.');
        const blob=await response.blob();return new File([blob],`${side}.jpg`,{type:blob.type});
      }));
      setDraft({...newDraft(),captureId:card.source_key,front:photos[0],back:photos[1],result,
        fields:card.identification.fields,cardType:card.card_type,onHand:card.on_hand,listed:card.listed,
        locationId:card.location_id,condition:card.condition || '',sellerPrice:card.seller_price_cents===null?'':String(card.seller_price_cents/100)});
      setNotice('Editing the existing staged card. The original identification and every correction are retained.');
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function signout(){if(scope)await forgetDraft(scope);clearSession();window.location.href='/login';}
  if(!draft)return <main className={styles.scanner}><p role="status">Opening your card workspace…</p></main>;
  return <main className={styles.scanner}>
    <Head><title>Card scanner · BossListers</title><meta name="description" content="Capture, verify and stage trading cards in your existing BossListers workspace."/></Head>
    <header className="top"><Link href="/capture" className="brand">B<span>·</span>L <small>BOSSLISTERS</small></Link><div><Link href="/capture">All items</Link><button type="button" onClick={signout}>Sign out</button></div></header>
    <section className="intro"><span className="eyebrow">CARD FACTORY / CAPTURE</span><div className="intro-line"><h1>One card.<br/><span>Every detail.</span></h1><div className="local-label"><i/> Local staging<br/><small>Cloud inventory stays in BossListers</small></div></div><p>Front. Back. Verify. Keep your collection organized without guessing.</p></section>
    <nav className="steps" aria-label="Scan progress">{['Front','Back','Review','Stage'].map((name,index)=><span className={(index===0&&draft.front)||(index===1&&draft.back)||(index===2&&draft.result)||(index===3&&draft.saved)?'complete':''} key={name}><b>0{index+1}</b>{name}</span>)}</nav>
    {!online && <p className="notice" role="status">Offline. Keep taking photos; identification and desktop saving need a connection. {scope?'Your phone draft is retained.':'This tab has not yet been paired to an authenticated workspace.'}</p>}
    {error && <div className="error" role="alert">{error}<button type="button" onClick={()=>setError('')}>Dismiss</button></div>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {draftStatus && <p className="muted" role="status">{draftStatus}</p>}
    {busy && <p role="status" aria-live="polite" className="busy">{busy}…</p>}
    <section className="panel" aria-labelledby="capture-heading"><div className="section-heading"><div><span className="eyebrow">01 / CAPTURE BOTH SIDES</span><h2 id="capture-heading">A clear pair makes the difference.</h2></div><span className="status-tag">{reviewState(draft)}</span></div>
      <div className="photos">{['front','back'].map(side=><div className="photo-card" key={side}><div className="photo-heading"><h3>{side==='front'?'Front of card':'Back of card'}</h3><span>{draft[side]?'Captured':'Required'}</span></div><div className="photo-preview"><Photo file={draft[side]} side={side}/></div>
        <button type="button" disabled={!!busy} onClick={()=>setCamera(side)}>{draft[side]?'Retake':'Open rear camera for'} {side}</button>
        <div className="file-options"><label>Upload {side} photo<input aria-label={`Upload ${side} photo`} type="file" accept="image/*" disabled={!!busy} onChange={e=>{photo(side,e.target.files?.[0]);e.target.value='';}}/></label>
        <label>Phone camera<input aria-label={`Use phone camera for ${side}`} type="file" accept="image/*" capture="environment" disabled={!!busy} onChange={e=>{photo(side,e.target.files?.[0]);e.target.value='';}}/></label></div>
      </div>)}</div>
      <p className="muted">Include all corners and small printed text. Avoid glare. Photos are resized up to 2400 px, never replaced by a fabricated image.</p>
      <button type="button" className="primary wide" disabled={!canIdentify(draft)||!!busy||!online} onClick={capture}>{draft.result?'Retry capture request':'Identify / save photo pair'} <span>→</span></button>
      <p className="muted">{capabilities?.recognitionEnabled?'Approved recognition is enabled for this workspace.':'AI recognition is gated off until approved. You can capture, manually verify and stage cards without spending API credits.'}</p>
    </section>
    {draft.result && <section className="panel" aria-labelledby="review-heading"><span className="eyebrow">02 / VERIFY THE EVIDENCE</span><h2 id="review-heading">What’s on the card?</h2>
      <div className="confidence-grid"><div><strong>{draft.result.confidences?.identification ?? 0}%</strong><span>Identification evidence score</span></div>{['Variant','Condition','Value'].map(v=><div key={v}><strong>—</strong><span>{v}: not assessed</span></div>)}</div>
      <p className="muted">Source: {draft.result.identification.source} · Model: {draft.result.identification.model || 'None'} · This evidence-completeness score is not a calibrated accuracy probability.</p>
      {!!draft.result.identification.candidates?.length && <details><summary>Candidate matches — no automatic choice</summary>{draft.result.identification.candidates.map((candidate,index)=><button key={index} type="button" onClick={()=>update({fields:candidate,verified:false})}>Review {candidate.player || 'candidate'} · {candidate.set || 'set unknown'} · {candidate.variant || candidate.parallel || 'variant unknown'}</button>)}</details>}
      <label>Storage category<select disabled={!!busy||!!draft.saved} value={draft.cardType} onChange={e=>{const kind=e.target.value;update({cardType:kind,verified:false,fields:{...draft.fields,cardGame:kind==='pokemon'?'Pokémon':null,sport:kind==='pokemon'?null:kind}});}}>{CARD_TYPES.map(type=><option key={type} value={type}>{type==='pokemon'?'Pokémon':type[0].toUpperCase()+type.slice(1)}</option>)}</select></label>
      <CardFieldsEditor fields={draft.fields} disabled={!!busy||!!draft.saved} onChange={(key,value)=>update({fields:{...draft.fields,[key]:value},verified:false})}/>
      <details><summary>Original AI result (never overwritten)</summary><pre>{JSON.stringify(draft.result.identification,null,2)}</pre></details>
      <div className="field-grid"><label>On-hand quantity<input aria-label="On-hand quantity" type="number" min="0" step="1" value={draft.onHand} disabled={!!draft.saved} onChange={e=>update({onHand:e.target.value})}/></label><label>Listed quantity<input aria-label="Listed quantity" type="number" min="0" step="1" value={draft.listed} disabled={!!draft.saved} onChange={e=>update({listed:e.target.value})}/></label><div className="available">{Math.max(0,Number(draft.onHand)-Number(draft.listed))}<small>Available (on hand − listed)</small></div>
      <label>Seller asking price, USD (optional)<input inputMode="decimal" value={draft.sellerPrice} disabled={!!draft.saved} placeholder="Unknown — leave blank" onChange={e=>update({sellerPrice:e.target.value})}/></label><label>Condition (your observation)<input value={draft.condition} disabled={!!draft.saved} onChange={e=>update({condition:e.target.value})}/></label><label>Physical location<select value={draft.locationId || ''} disabled={!!draft.saved} onChange={e=>update({locationId:e.target.value || null})}><option value="">Unassigned</option>{inventory.locations.map(l=><option key={l.id} value={l.id}>{l.kind}: {l.name}</option>)}</select></label></div>
      <details><summary>Add a storage location</summary><form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form);setBusy('Saving location');try{const location=await scannerRequest('location',{name:data.get('name'),kind:data.get('kind'),parent_id:data.get('parent') || null});update({locationId:location.id});await refresh();form.reset();}catch(e){setError(e.message);}finally{setBusy('');}}}><div className="field-grid"><label>Location name<input name="name" required maxLength={120}/></label><label>Location type<select name="kind">{['box','binder','binder_page','row','container','shelf','other'].map(k=><option key={k} value={k}>{k.replace('_',' ')}</option>)}</select></label><label>Inside<select name="parent"><option value="">Top level</option>{inventory.locations.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select></label></div><button disabled={!!busy}>Save location</button></form></details>
      <label>Verification / correction note<textarea value={draft.note} disabled={!!draft.saved} onChange={e=>update({note:e.target.value})} placeholder="What did you check or correct?"/></label>
      <label className="verify"><input type="checkbox" checked={draft.verified} disabled={!!draft.saved} onChange={e=>update({verified:e.target.checked})}/><span>I checked the identity, set, number and variant against both images. This is my explicit verification, not an AI confidence upgrade.</span></label>
      <button type="button" className="primary wide" disabled={!!busy||!!draft.saved||!online} onClick={stage}>{draft.saved?'Saved to local staging':draft.verified?'Confirm & save to local staging':'Save locally · needs review'}</button>
    </section>}
    <div className="action-row"><button type="button" onClick={reset} disabled={!!busy}>Scan another card</button><Link href="/dashboard/inventory">Existing BossListers inventory ↗</Link></div>
    <StagingInventory inventory={inventory} refresh={refresh} capabilities={capabilities} onError={setError} onEdit={editCard}/>
    <details className="install"><summary>Install on iPhone &amp; storage safety</summary><p>Open your approved HTTPS BossListers address in Safari. Tap Share → Add to Home Screen. Camera permission is requested only when you tap a camera button.</p><p>SQLite runs on the paired desktop Node/Python host, not inside iOS Safari. Phone drafts are temporary browser storage, not cloud inventory or a guaranteed backup. Sign out here to clear this pending draft. Do not use a shared browser profile for private inventory.</p><p>Cloud synchronization and marketplace publishing are disabled. Real iPhone hardware testing is still required.</p></details>
    <footer>Evidence first. Inventory always under your control.</footer>
    {camera && <CameraCapture side={camera} onCapture={file=>photo(camera,file)} onClose={()=>setCamera(null)}/>}
  </main>;
}
