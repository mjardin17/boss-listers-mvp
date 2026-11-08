import {useEffect,useRef,useState} from 'react';
export default function CameraCapture({side,onCapture,onClose}) {
  const video=useRef(null),stream=useRef(null),dialog=useRef(null);const [error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{
    let disposed=false;
    dialog.current?.showModal();
    const stop=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
    const hidden=()=>{if(document.hidden){stop();onClose();}};
    document.addEventListener('visibilitychange',hidden);
    (async()=>{try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS and permission. Use the photo upload fallback.');
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2400},height:{ideal:1800}}});
      if(disposed){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;video.current.srcObject=media;await video.current.play();setReady(true);
    }catch {if(!disposed)setError('Camera unavailable or permission denied. Close this view and use the camera-file or upload option.');}})();
    return()=>{disposed=true;stop();document.removeEventListener('visibilitychange',hidden);};
  },[]); // One permission request per explicit opening; stop tracks on every exit.
  async function capture() {
    const element=video.current;if(!element?.videoWidth)return;
    const canvas=document.createElement('canvas');canvas.width=element.videoWidth;canvas.height=element.videoHeight;
    canvas.getContext('2d').drawImage(element,0,0);
    canvas.toBlob(blob=>{if(blob){onCapture(new File([blob],`${side}.jpg`,{type:'image/jpeg'}));onClose();}},'image/jpeg',0.94);
  }
  return <dialog ref={dialog} onCancel={event=>{event.preventDefault();onClose();}} aria-modal="true" aria-label={`Capture ${side}`} className="card-camera">
    <button type="button" autoFocus onClick={onClose}>Close camera</button>
    <h2>Capture the {side}</h2><p>Fill the frame. Keep the text sharp and avoid glare.</p>
    <video ref={video} autoPlay muted playsInline aria-label="Rear camera preview" />
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={!ready} onClick={capture}>Take {side} photo</button>
    <style jsx>{`.card-camera{position:fixed;inset:0;z-index:1000;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;border:0;background:#0b111b;color:#fff;padding:max(20px,env(safe-area-inset-top)) 20px;overflow:auto}.card-camera video{display:block;width:100%;max-height:65vh;object-fit:contain;margin:15px 0}.card-camera button{min-height:48px;padding:12px 20px;background:#d8ff78;color:#14200b;border:0;border-radius:9px;font-weight:700}`}</style>
  </dialog>;
}
