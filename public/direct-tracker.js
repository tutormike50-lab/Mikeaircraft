(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('radar'), ctx = canvas.getContext('2d');
  let aircraft = [], airport = null, selected = null, commandState = null;
  const RANGE_KM = 25;
  $('pin').value = sessionStorage.getItem('mikeaircraftControlPin') || '';
  $('savePin').onclick = () => { sessionStorage.setItem('mikeaircraftControlPin', $('pin').value.trim()); refreshState(); };
  function headers() { return { 'Content-Type': 'application/json', 'X-MikeAircraft-Control-Pin': $('pin').value.trim() }; }
  function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
  function idOf(ac) { return String(ac.hex || ac.id || '').trim().toLowerCase(); }
  function callsignOf(ac) { return String(ac.flight || ac.callsign || idOf(ac)).trim(); }
  function distanceBearing(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180, p1 = lat1*r, p2 = lat2*r, dp=(lat2-lat1)*r, dl=(lon2-lon1)*r;
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    const distance=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    return { distance, bearing:(Math.atan2(y,x)/r+360)%360 };
  }
  function point(ac, size) {
    if (!airport || number(ac.lat)===null || number(ac.lon)===null) return null;
    const polar=distanceBearing(airport.lat,airport.lon,Number(ac.lat),Number(ac.lon));
    if (polar.distance > RANGE_KM) return null;
    const angle=(polar.bearing-90)*Math.PI/180, radius=(polar.distance/RANGE_KM)*size*.46;
    return { x:size/2+Math.cos(angle)*radius,y:size/2+Math.sin(angle)*radius,...polar };
  }
  function draw() {
    const size=Math.max(300,canvas.clientWidth),dpr=window.devicePixelRatio||1;
    canvas.width=size*dpr;canvas.height=size*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
    ctx.strokeStyle='rgba(91,224,188,.25)';ctx.lineWidth=1;
    for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(size/2,size/2,size*.115*i,0,Math.PI*2);ctx.stroke()}
    ctx.beginPath();ctx.moveTo(size/2,0);ctx.lineTo(size/2,size);ctx.moveTo(0,size/2);ctx.lineTo(size,size/2);ctx.stroke();
    for(const ac of aircraft){const p=point(ac,size);if(!p)continue;const chosen=selected&&idOf(ac)===idOf(selected);ctx.fillStyle=chosen?'#ffcf62':'#71e6c4';ctx.beginPath();ctx.arc(p.x,p.y,chosen?8:5,0,Math.PI*2);ctx.fill();ctx.fillStyle=chosen?'#fff2bd':'#b9f5e4';ctx.font=(chosen?'bold ':'')+'11px Arial';ctx.fillText(callsignOf(ac),p.x+8,p.y-7)}
  }
  canvas.onclick = event => { const rect=canvas.getBoundingClientRect(),size=rect.width,x=event.clientX-rect.left,y=event.clientY-rect.top;let nearest=null,best=18;for(const ac of aircraft){const p=point(ac,size);if(!p)continue;const d=Math.hypot(p.x-x,p.y-y);if(d<best){best=d;nearest=ac}}if(nearest){selected=nearest;$('selected').textContent=callsignOf(nearest)+' · '+idOf(nearest).toUpperCase();$('track').disabled=false;draw()}};
  async function command(command) { if(command==='TRACKING'&&!selected)return;const response=await fetch('/api/direct-tracker',{method:'POST',headers:headers(),body:JSON.stringify({command,aircraftId:selected&&idOf(selected),callsign:selected&&callsignOf(selected)})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Command failed');renderState(data); }
  $('track').onclick=()=>command('TRACKING').catch(showError);$('stop').onclick=()=>command('STOPPED').catch(showError);$('home').onclick=()=>command('HOME').catch(showError);
  function fmt(value,unit='',digits=1){const n=number(value);return n===null?'—':n.toFixed(digits)+unit}
  function renderState(data){commandState=data;const t=data.bridge?.telemetry||{};$('state').textContent=(data.command||'STOPPED')+' / '+(data.bridge?.trackerState||'OFFLINE');$('identity').textContent=[data.aircraftId&&data.aircraftId.toUpperCase(),data.callsign].filter(Boolean).join(' / ')||'—';$('rawAge').textContent=fmt(t.source_age_ms,' ms',0);$('horizon').textContent=fmt(t.prediction_age_ms,' ms',0);$('stateTime').textContent=number(t.aircraft_state_timestamp_ms)===null?'—':new Date(Number(t.aircraft_state_timestamp_ms)).toISOString().slice(11,23)+' UTC';$('angles').textContent=fmt(t.target_true_azimuth_deg,'°')+' / '+fmt(t.target_elevation_deg,'°');$('relative').textContent=fmt(t.target_yaw_relative_deg,'°')+' / '+fmt(t.target_pitch_relative_deg,'°');$('notice').textContent=data.bridge?.fault||'No lag compensation is applied.'}
  function showError(error){$('notice').textContent=error.message}
  async function refreshState(){try{const response=await fetch('/api/direct-tracker',{headers:headers()});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unlock required');renderState(data)}catch(error){showError(error)}}
  async function refreshAircraft(){try{const response=await fetch('/api/engine?airport=PRG',{cache:'no-store'}),data=await response.json();aircraft=Array.isArray(data.aircraft)?data.aircraft:[];airport=data.airport&&number(data.airport.lat)!==null?{lat:Number(data.airport.lat),lon:Number(data.airport.lon)}:null;draw()}catch(error){showError(error)}}
  window.addEventListener('resize',draw);refreshAircraft();refreshState();setInterval(refreshAircraft,1000);setInterval(refreshState,1000);
})();
