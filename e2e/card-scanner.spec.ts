import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
function crc32(data:Buffer){let crc=0xffffffff;for(const n of data){crc^=n;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function png(r:number,g:number,b:number){function chunk(type:string,data:Buffer){const tag=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([len,tag,data,crc]);}const head=Buffer.alloc(13);head.writeUInt32BE(2,0);head.writeUInt32BE(2,4);head[8]=8;head[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(Buffer.from([0,r,g,b,r,g,b,0,r,g,b,r,g,b]))),chunk('IEND',Buffer.alloc(0))]);}
const front=png(225,30,25),back=png(30,80,225);
async function open(page:any){const tenant=randomUUID();await page.addInitScript(({token}:{token:string})=>localStorage.setItem('boss_auth_session',JSON.stringify({accessToken:token,email:'fixture@example.invalid'})),{token:'fixture-'+tenant});await page.goto('/card-scan');await expect(page.getByRole('heading',{name:'One card. Every detail.'})).toBeVisible();await expect(page.getByText('Connect to the authenticated desktop runtime')).toHaveCount(0);return tenant;}
async function photos(page:any){await page.getByLabel('Upload front photo',{exact:true}).setInputFiles({name:'front.png',mimeType:'image/png',buffer:front});await expect(page.getByAltText('front of card')).toBeVisible();await page.getByLabel('Upload back photo',{exact:true}).setInputFiles({name:'back.png',mimeType:'image/png',buffer:back});await expect(page.getByAltText('back of card')).toBeVisible();}
async function capture(page:any){await photos(page);await page.getByRole('button',{name:'Identify / save photo pair'}).click();await expect(page.getByRole('heading',{name:'What’s on the card?'})).toBeVisible();}
async function verify(page:any){for(const [label,value] of Object.entries({'Player / character':'Synthetic test card','Set':'Fixture Set','Year':'2024','Manufacturer':'Fixture Manufacturer','Card number':'1','Game':'Pokémon','Parallel':'Base','Edition':'Fixture'}))await page.getByLabel(label,{exact:true}).fill(value);await page.getByLabel('Seller asking price, USD (optional)',{exact:true}).fill('12.34');await page.getByLabel('Verification / correction note',{exact:true}).fill('Synthetic fixture verification, not real recognition');await page.getByRole('checkbox').check();}
test('front/back upload, manual verification, SQLite staging and repeat scan',async({page})=>{
 await open(page);await expect(page.getByRole('button',{name:'Identify / save photo pair'})).toBeDisabled();await capture(page);await verify(page);
 await page.getByLabel('On-hand quantity',{exact:true}).fill('2');await page.getByLabel('Listed quantity',{exact:true}).fill('1');
 await page.getByRole('button',{name:'Confirm & save to local staging'}).click();await expect(page.getByRole('button',{name:'Saved to local staging',exact:true})).toBeVisible();
 await expect(page.getByText('2 on hand · 1 listed · 1 available')).toBeVisible();
 await page.getByRole('button',{name:'Prepare BossListers feed'}).click();await expect(page.getByText('Preview only · 1 eligible draft rows')).toBeVisible();
 await page.locator('summary').filter({hasText:'Synthetic test card · Fixture Set'}).click();
 await page.getByRole('button',{name:'Review / correct identification'}).click();
 await page.getByLabel('Player / character',{exact:true}).fill('Corrected fixture character');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm & save to local staging'}).click();
 await expect(page.getByRole('button',{name:'Saved to local staging',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Staged cards 1'})).toBeVisible();
 await page.getByRole('button',{name:'Scan another card'}).click();await expect(page.getByRole('button',{name:'Identify / save photo pair'})).toBeDisabled();await expect(page.getByAltText('front of card')).toHaveCount(0);
});
test('retake invalidates identity and offline draft survives reload',async({page,context})=>{
 await open(page);await capture(page);
 await page.getByLabel('Upload front photo',{exact:true}).setInputFiles({name:'retake.png',mimeType:'image/png',buffer:png(30,220,30)});
 await expect(page.getByRole('heading',{name:'What’s on the card?'})).toHaveCount(0);
 await expect(page.getByText('Phone draft saved on this device',{exact:true})).toBeVisible();await page.reload();await expect(page.getByAltText('front of card')).toBeVisible();await expect(page.getByAltText('back of card')).toBeVisible();
 await context.setOffline(true);await expect(page.getByText('Offline. Keep taking photos',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Identify / save photo pair'})).toBeDisabled();await context.setOffline(false);
});
test('camera denial is explicit and leaves upload fallback usable',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('denied','NotAllowedError');}});});
 await open(page);await page.getByRole('button',{name:'Open rear camera for front'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('permission denied');await page.getByRole('button',{name:'Close camera'}).click();await expect(page.getByLabel('Upload front photo',{exact:true})).toBeEnabled();
});
test('lost save response retries idempotently against real local SQLite',async({page})=>{
 await open(page);await capture(page);await verify(page);let first=true;
 await page.route('**/api/card-factory/stage',async route=>{if(first){first=false;await route.fetch();await route.abort();}else await route.continue();});
 await page.getByRole('button',{name:'Confirm & save to local staging'}).click();await expect(page.locator('main [role=alert]')).toBeVisible();await page.getByRole('button',{name:'Confirm & save to local staging'}).click();await expect(page.getByRole('button',{name:'Saved to local staging',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Staged cards 1'})).toBeVisible();
});
test('API tenant isolation, unauthenticated denial and no sync writer',async({request})=>{
 const a='fixture-'+randomUUID(),b='fixture-'+randomUUID(),id=randomUUID();
 expect((await request.get('/api/card-factory/list')).status()).toBe(401);
 const captured=await request.post('/api/card-factory/capture',{headers:{Authorization:'Bearer '+a},multipart:{captureId:id,front:{name:'front.png',mimeType:'image/png',buffer:front},back:{name:'back.png',mimeType:'image/png',buffer:back}}});expect(captured.ok()).toBeTruthy();
 expect((await request.get(`/api/card-factory/photo?id=${id}&side=front`,{headers:{Authorization:'Bearer '+b}})).status()).toBe(404);
 const own=await request.get(`/api/card-factory/photo?id=${id}&side=front`,{headers:{Authorization:'Bearer '+a}});expect(own.ok()).toBeTruthy();expect(own.headers()['cache-control']).toBe('no-store');
 expect((await request.post('/api/card-factory/sync',{headers:{Authorization:'Bearer '+a},data:{confirm:true}})).status()).toBe(409);
});
test('PWA manifest retains BossListers identity and scanner navigation',async({request,page},testInfo)=>{
 const manifest=await (await request.get('/manifest.json')).json();expect(manifest.id).toBe('/capture');expect(manifest.start_url).toBe('/card-scan');expect(manifest.display).toBe('standalone');await open(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await expect(page.getByLabel('Use phone camera for front',{exact:true})).toHaveAttribute('capture','environment');
 await page.screenshot({path:`data/card-scanner-validation/scanner-${testInfo.project.name}.png`,fullPage:true});
});

test('simulated rear-camera stream captures a frame and stops on close',async({page,browserName})=>{
 test.skip(browserName==='webkit','Linux WebKit cannot play this synthetic canvas MediaStream; real iPhone camera acceptance remains pending.');
 await page.addInitScript(()=>{
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async(constraints:any)=>{
   (window as any).__rearRequested=constraints.video.facingMode.ideal;
   const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1000;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#d0b98b';ctx.fillRect(0,0,800,1000);
   const stream=canvas.captureStream(5);(window as any).__testStream=stream;
   return stream;
  }});
 });
 await open(page);await page.getByRole('button',{name:'Open rear camera for front'}).click();
 await expect(page.getByRole('button',{name:'Take front photo'})).toBeEnabled();
 await page.getByRole('button',{name:'Take front photo'}).click();await expect(page.getByAltText('front of card')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__rearRequested)).toBe('environment');
 expect(await page.evaluate(()=>(window as any).__testStream.getTracks().every((track:any)=>track.readyState==='ended'))).toBeTruthy();
});
