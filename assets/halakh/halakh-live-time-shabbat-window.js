/* HALAKH live local time. Uses the public HALAKH server response to correct device clock drift. */
(()=>{'use strict';
const mount=document.getElementById('halakh-now');
if(!mount||window.__HALAKH_LIVE_TIME_INITIALIZED__)return;
window.__HALAKH_LIVE_TIME_INITIALIZED__=true;
const bands=[
{id:'dawn',name:'Dawn',min:4,max:7,slug:'wake',title:'When You Wake'},
{id:'morning',name:'Morning',min:7,max:9,slug:'household-morning',title:'When You Enter the Household in the Morning'},
{id:'day',name:'Day',min:9,max:12,slug:'work',title:'When You Begin Work'},
{id:'afternoon',name:'Afternoon',min:12,max:17,slug:'afternoon',title:'When the Afternoon Comes'},
{id:'evening',name:'Evening',min:17,max:21,slug:'evening',title:'When Evening Comes'},
{id:'night',name:'Night',min:21,max:28,slug:'night',title:'When Night Comes'}
];
function bandAt(hour){const h=hour<4?hour+24:hour;return bands.find(b=>h>=b.min&&h<b.max)||bands[5]}
const phase=document.getElementById('halakh-now-phase');
const clock=document.getElementById('halakh-now-clock');
const chapter=document.getElementById('halakh-now-title');
const link=document.getElementById('halakh-now-link');
const date=document.getElementById('halakh-now-date');
const source=document.getElementById('halakh-now-source');
let offset=0,lastVerified=0,lastAttempt=0,verified=false,syncing=false,currentBand='',lastMinute='';
const timeFormat=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
const dateFormat=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'});
function zone(d){try{const p=new Intl.DateTimeFormat(undefined,{timeZoneName:'short'}).formatToParts(d);return p.find(x=>x.type==='timeZoneName')?.value||'Local'}catch{return 'Local'}}
/* HALAKH_SHABBAT_WINDOW_20261114
 * Display the public Shabbat ticker only between Friday's and Saturday's
 * local sunsets at Prosperity, South Carolina. All other clock behavior is unchanged.
 * Standard apparent solar sunset: sun center 0.833 degrees below horizon.
 */
const shabbatTicker=document.querySelector('.halakh-shabbat-ticker');
const shabbatZone='America/New_York';
const shabbatLocation={latitude:34.21,longitude:-81.53};
const shabbatPartsFormat=new Intl.DateTimeFormat('en-US',{
  timeZone:shabbatZone,year:'numeric',month:'numeric',day:'numeric',weekday:'short'
});
let shabbatLastMinute='',shabbatLastVisible=null;
function shabbatSunsetUTC(year,month,day){
  const rad=Math.PI/180,J1970=2440588,J2000=2451545;
  const localNoonAnchor=Date.UTC(year,month-1,day,12);
  const days=localNoonAnchor/86400000-0.5+J1970-J2000;
  const lw=-shabbatLocation.longitude*rad,phi=shabbatLocation.latitude*rad;
  const n=Math.round(days-0.0009-lw/(2*Math.PI));
  const cycle=0.0009+lw/(2*Math.PI)+n;
  const mean=rad*(357.5291+0.98560028*cycle);
  const center=rad*(1.9148*Math.sin(mean)+0.02*Math.sin(2*mean)+0.0003*Math.sin(3*mean));
  const longitude=mean+center+rad*102.9372+Math.PI;
  const declination=Math.asin(Math.sin(longitude)*Math.sin(23.4397*rad));
  const noonJulian=J2000+cycle+0.0053*Math.sin(mean)-0.0069*Math.sin(2*longitude);
  const cosHour=(Math.sin(-0.833*rad)-Math.sin(phi)*Math.sin(declination))/(Math.cos(phi)*Math.cos(declination));
  if(cosHour<-1||cosHour>1)return NaN;
  return (noonJulian+Math.acos(cosHour)/(2*Math.PI)-J1970+0.5)*86400000;
}
function shabbatIsActive(now){
  try{
    const parts=Object.fromEntries(shabbatPartsFormat.formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    if(parts.weekday!=='Fri'&&parts.weekday!=='Sat')return false;
    const year=Number(parts.year),month=Number(parts.month),day=Number(parts.day);
    const saturday=parts.weekday==='Fri'?new Date(Date.UTC(year,month-1,day+1,12)):new Date(Date.UTC(year,month-1,day,12));
    const friday=parts.weekday==='Sat'?new Date(Date.UTC(year,month-1,day-1,12)):new Date(Date.UTC(year,month-1,day,12));
    const beginning=shabbatSunsetUTC(friday.getUTCFullYear(),friday.getUTCMonth()+1,friday.getUTCDate());
    const ending=shabbatSunsetUTC(saturday.getUTCFullYear(),saturday.getUTCMonth()+1,saturday.getUTCDate());
    return Number.isFinite(beginning)&&Number.isFinite(ending)&&now.getTime()>=beginning&&now.getTime()<ending;
  }catch{return false;}
}
function shabbatTickerUpdate(now){
  if(!shabbatTicker)return;
  const minute=Math.floor(now.getTime()/60000);
  if(shabbatLastMinute===minute)return;
  shabbatLastMinute=minute;
  const visible=shabbatIsActive(now);
  if(visible===shabbatLastVisible)return;
  shabbatLastVisible=visible;
  shabbatTicker.style.setProperty('display',visible?'block':'none','important');
  shabbatTicker.hidden=!visible;
  shabbatTicker.setAttribute('aria-hidden',String(!visible));
  document.documentElement.dataset.halakhShabbat=visible?'active':'inactive';
}

function tick(force=false){
 if(document.hidden&&!force)return;
 const now=new Date(Date.now()+offset),band=bandAt(now.getHours());
 shabbatTickerUpdate(now);
 const minute=now.getFullYear()+':'+now.getMonth()+':'+now.getDate()+':'+now.getHours()+':'+now.getMinutes();
 if(clock){clock.textContent=timeFormat.format(now);clock.dateTime=now.toISOString()}
 if(force||lastMinute!==minute){
  lastMinute=minute;
  if(date)date.textContent=dateFormat.format(now);
  if(source)source.textContent=(verified?'Checked with HALAKH time':'Device clock')+' · '+zone(now);
 }
 if(force||currentBand!==band.id){
  const previous=currentBand;currentBand=band.id;
  document.documentElement.dataset.halakhPeriod=band.id;
  mount.dataset.halakhPeriod=band.id;
  if(phase)phase.textContent=band.name;
  if(chapter)chapter.textContent=band.title;
  if(link){link.href='/book/read/content.html#'+band.slug;link.setAttribute('aria-label','Read '+band.title+' in the HALAKH book')}
  if(previous&&previous!==band.id)document.dispatchEvent(new CustomEvent('halakh:periodchange',{detail:{period:band.id,previous,at:now.toISOString()}}));
 }
}
async function verifyTime(){
 if(syncing)return;syncing=true;lastAttempt=Date.now();
 const startedWall=Date.now(),started=performance.now();
 const controller=typeof AbortController==='function'?new AbortController():null;
 const timeout=controller?setTimeout(()=>controller.abort(),6000):null;
 try{
  const response=await fetch('/api/live',{method:'GET',credentials:'omit',cache:'no-store',...(controller?{signal:controller.signal}:{})});
  if(!response.ok)throw Error('Clock reference unavailable');
  const epoch=Date.parse(response.headers.get('date')||'');
  const trip=performance.now()-started;
  if(!Number.isFinite(epoch)||trip>6000)throw Error('Clock date unavailable');
  offset=epoch-(startedWall+trip/2);
  verified=true;lastVerified=Date.now();
 }catch{
  if(!lastVerified){verified=false;offset=0}
 }finally{
  if(timeout)clearTimeout(timeout);
  syncing=false;tick(true);
 }
}
function resume(){tick(true);if(!syncing&&(!lastAttempt||Date.now()-lastAttempt>=300000))verifyTime()}
tick(true);verifyTime();
setInterval(()=>{if(!document.hidden){tick();if(Date.now()-lastAttempt>=300000&&!syncing)verifyTime()}},1000);
window.addEventListener('pageshow',resume);
window.addEventListener('focus',resume);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume()});
})();
