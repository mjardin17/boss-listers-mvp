import {emptyCardFields} from '../../lib/cardFields';
const BOOLEAN=new Set(['foil','holo','refractor','reverseHolo','rookieCard','autograph','memorabilia','patch','graded']);
const PRIMARY=['cardName','player','cardGame','sport','set','setNumber','year','manufacturer','cardNumber','parallel','variant','edition','language','conditionNotes','gradingCompany','grade'];
const LABELS={cardName:'Card name',player:'Player / character',cardGame:'Game',setNumber:'Set number',cardNumber:'Card number',conditionNotes:'Condition observations',gradingCompany:'Grading company',frontOcrText:'Front text evidence',backOcrText:'Back text evidence'};
function label(key){return LABELS[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());}
export default function CardFieldsEditor({fields,onChange,disabled}) {
  function field(key){return <label key={key}>{label(key)}{BOOLEAN.has(key)?
    <select disabled={disabled} value={fields[key]===null || fields[key]===undefined?'':String(fields[key])} onChange={e=>onChange(key,e.target.value===''?null:e.target.value==='true')}>
      <option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option>
    </select>:<input disabled={disabled} value={fields[key] || ''} maxLength={key.includes('Ocr')?6000:1000} onChange={e=>onChange(key,e.target.value || null)} />}</label>;}
  return <><div className="field-grid">{PRIMARY.map(field)}</div><details><summary>All card fields &amp; transcribed evidence</summary><div className="field-grid">{Object.keys(emptyCardFields()).filter(key=>!PRIMARY.includes(key)).map(field)}</div></details></>;
}
