import {useState} from 'react';
import {scannerRequest} from '../../lib/cardScanner/client';
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export default function StagingInventory({inventory,refresh,capabilities,onError,onEdit}) {
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false);
  async function run(action,body){setBusy(true);try{const result=await scannerRequest(action,body);await refresh();return result;}catch(error){onError(error.message);}finally{setBusy(false);}}
  return <section aria-labelledby="staging-heading" className="panel">
    <div className="section-heading"><div><span className="eyebrow">ON THIS COMPUTER · NOT CLOUD INVENTORY</span><h2 id="staging-heading">Staged cards <span className="count">{inventory.cards.length}</span></h2></div><button type="button" onClick={refresh} disabled={busy}>Refresh</button></div>
    {!inventory.cards.length && <p className="muted">Your saved cards will appear here. Nothing is published automatically.</p>}
    {inventory.cards.map(card=><details className="staged-card" key={card.id}>
      <summary>{card.identification.fields.player || 'Unidentified card'} · {card.set_name || 'Set pending'} <span>{card.on_hand} on hand · {card.listed} listed · {card.available} available</span></summary>
      <p className="muted">{card.verification?.outcome==='verified'?'Confirmed by user':card.status==='identified'?'Identified; review evidence':'Needs review'} · SKU CF-{card.id}</p>
      <form key={card.updated_at} onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('stock',{card_id:card.id,on_hand:Number(data.get('onHand')),listed:Number(data.get('listed')),location_id:data.get('location') || null});}}>
        <div className="field-grid"><label>On hand<input name="onHand" type="number" min="0" step="1" required defaultValue={card.on_hand}/></label><label>Listed<input name="listed" type="number" min="0" step="1" required defaultValue={card.listed}/></label>
          <label>Physical location<select name="location" defaultValue={card.location_id || ''}><option value="">Unassigned / retain existing</option>{inventory.locations.map(l=><option key={l.id} value={l.id}>{l.kind}: {l.name}</option>)}</select></label></div>
        <button disabled={busy}>Update local quantities / location</button>
      </form>
      <form onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('reassign',{card_id:card.id,collection_id:data.get('collection'),note:data.get('note')});}}>
        <div className="field-grid"><label>Collection<select name="collection" defaultValue={card.collection_id || ''} required><option value="">Select collection</option>{inventory.collections.filter(c=>c.card_type===card.card_type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Reassignment reason<input name="note" required maxLength={2000}/></label></div>
        <button disabled={busy}>Reassign collection</button>
      </form>
      <button type="button" disabled={busy} onClick={()=>onEdit(card)}>Review / correct identification</button>
      <h3>Value evidence</h3><p className="muted">Asking prices are not completed sales. Seller prices are not verified market values.</p>
      {card.price_history.length?card.price_history.map(p=><p key={p.id}>{p.amount_cents===null?'Value unavailable':`${p.currency} ${(p.amount_cents/100).toFixed(2)}`} · {p.verification} · {p.provider} · {p.observed_at}<br/><small>{p.evidence.explanation} Confidence: {p.evidence.confidenceScore ?? 'unavailable'}</small></p>):<p>Value unavailable — no pricing evidence.</p>}
      <button type="button" disabled={busy || !capabilities?.pricingEnabled} onClick={()=>run('price',{id:card.id})}>Request unverified eBay asking estimate</button>
      <details><summary>Original identification &amp; correction history</summary><pre>{JSON.stringify({original:card.original_identification,corrections:card.review_history},null,2)}</pre></details>
    </details>)}
    <div className="action-row"><button type="button" disabled={busy || !inventory.cards.length} onClick={async()=>{const value=await run('preview',{});if(value)setPreview(value);}}>Prepare BossListers feed</button>
      <button type="button" disabled={busy || !inventory.cards.length} onClick={async()=>{const result=await run('lessons',{});if(result)download('verified-corrections-pending-regression.json',result.items);}}>Export verified corrections</button></div>
    {preview && <div role="status" className="notice"><strong>Preview only · {preview.products.length} eligible draft rows</strong><p>{preview.pending.length} pending. Cloud sync is disabled until schema and write approval. No product or listing was created.</p>
      <div className="action-row"><button type="button" onClick={()=>download('products.json',preview.products)}>Download product rows</button><button type="button" onClick={()=>download('card-metadata.json',preview.metadata)}>Download card metadata</button><button type="button" onClick={()=>download('schema-check.json',preview.schema)}>Download schema check</button></div>
      {preview.pending.map(p=><p key={p.id}>{p.sku}: {p.reasons.join(', ')}</p>)}
    </div>}
  </section>;
}
