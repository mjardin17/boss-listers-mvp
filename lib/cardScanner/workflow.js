const {emptyCardFields}=require('../cardFields');
const {safeRandomUUID}=require('../safeUuid');
const CARD_TYPES=['pokemon','baseball','basketball','football','hockey','soccer','racing'];
function newDraft() {return {captureId:safeRandomUUID(),requestId:safeRandomUUID(),front:null,back:null,result:null,saved:null,
  cardType:'pokemon',fields:emptyCardFields(),verified:false,note:'',onHand:1,listed:0,locationId:null,condition:'',sellerPrice:''};}
function replacePhoto(draft,side,photo) {return {...draft,[side]:photo,captureId:safeRandomUUID(),requestId:safeRandomUUID(),
  result:null,saved:null,verified:false,fields:emptyCardFields()};}
function canIdentify(draft) {return !!(draft.front && draft.back);}
function reviewState(draft) {
  if(draft.saved?.verification?.outcome==='verified') return 'Confirmed';
  if(!draft.result || draft.result.identification.status==='unknown') return 'Unidentified';
  return 'Needs review';
}
function inferredType(fields,fallback) {
  if(/pok[eé]mon/i.test(fields.cardGame || '')) return 'pokemon';
  return CARD_TYPES.includes(String(fields.sport).toLowerCase()) ? String(fields.sport).toLowerCase() : fallback;
}
function stagePayload(draft) {
  if(!draft.result?.captureId) throw new Error('Capture both sides first.');
  const onHand=Number(draft.onHand),listed=Number(draft.listed);
  if(!Number.isSafeInteger(onHand)||!Number.isSafeInteger(listed)||onHand<0||listed<0||listed>onHand) throw new Error('Check quantity: listed cannot exceed on hand.');
  return {captureId:draft.result.captureId,requestId:draft.requestId,cardType:draft.cardType,fields:draft.fields,
    verified:draft.verified,note:draft.note.trim() || (draft.verified?'I checked the identity against both images.':'Saved for review; not verified.'),
    onHand,listed,locationId:draft.locationId || null,condition:draft.condition.trim() || null,sellerPrice:draft.sellerPrice.trim() || null};
}
module.exports={CARD_TYPES,newDraft,replacePhoto,canIdentify,reviewState,inferredType,stagePayload};
