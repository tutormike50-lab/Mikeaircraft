// MikeAircraft Storyteller-integrated overlay test view
// Version 0.1
// Keeps the known-good overlay untouched and layers Storyteller output above it.

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>MikeAircraft Story Overlay v0.1</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif;background:#202020}
#baseOverlay{position:absolute;inset:0;width:100%;height:100%;border:0;z-index:1}
.story-card{position:absolute;left:3vw;top:34vh;width:clamp(330px,31vw,560px);z-index:10;pointer-events:none;opacity:0;transform:translateX(-18px);transition:opacity .45s ease,transform .45s ease;border-radius:14px;overflow:hidden;border:1px solid rgba(105,205,255,.42);background:linear-gradient(115deg,rgba(5,22,38,.96),rgba(7,48,72,.95));box-shadow:0 14px 34px rgba(0,0,0,.34)}
.story-card.visible{opacity:1;transform:translateX(0)}
.story-accent{height:5px;background:linear-gradient(90deg,#4fdfff,#2a91d0)}
.story-inner{padding:15px 18px 17px}
.story-kicker{font-size:11px;letter-spacing:1.4px;font-weight:800;color:#87dfff;margin-bottom:6px}
.story-headline{font-size:clamp(20px,1.7vw,30px);line-height:1.08;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.55);margin-bottom:8px}
.story-text{font-size:clamp(13px,1vw,17px);line-height:1.35;font-weight:600;color:#dcecf5}
.story-meta{margin-top:10px;font-size:10px;letter-spacing:.7px;color:#85a8ba;text-transform:uppercase}
.story-card.verified .story-accent{background:linear-gradient(90deg,#ffca57,#57dfff)}
.story-card.verified .story-kicker{color:#ffd77d}
@media(max-width:900px){.story-card{left:3vw;top:29vh;width:min(65vw,480px)}}
</style>
</head>
<body>
<iframe id="baseOverlay" title="MikeAircraft base overlay"></iframe>
<div id="storyCard" class="story-card">
  <div class="story-accent"></div>
  <div class="story-inner">
    <div id="storyKicker" class="story-kicker">LIVE STORY</div>
    <div id="storyHeadline" class="story-headline">---</div>
    <div id="storyText" class="story-text">---</div>
    <div id="storyMeta" class="story-meta"></div>
  </div>
</div>
<script>
const UPDATE_MS=5000;
const params=new URLSearchParams(location.search);
const airport=(params.get('airport')||'PRG').trim().toUpperCase();
document.getElementById('baseOverlay').src='/api/overlay?airport='+encodeURIComponent(airport);
let busy=false;
function setText(id,value){const e=document.getElementById(id);if(e)e.textContent=value||''}
function renderStory(data){
  const card=document.getElementById('storyCard');
  const output=data&&data.output;
  const story=output&&output.story;
  if(!data||!data.ok||!output||!output.available||!story){card.classList.remove('visible','verified');return}
  const verified=story.specificAircraft===true || String(output.class||'').startsWith('VERIFIED_');
  card.classList.toggle('verified',verified);
  setText('storyKicker',verified?'AIRCRAFT STORY':'LIVE AIRPORT STORY');
  setText('storyHeadline',story.headline||'Live airport activity');
  setText('storyText',story.text||'');
  setText('storyMeta',(verified?'VERIFIED':'SAFE CONTEXT')+' • '+String(output.confidence||0)+'% CONFIDENCE');
  card.classList.add('visible');
}
async function updateStory(){
  if(busy)return;busy=true;
  try{
    const r=await fetch('/api/storyteller?airport='+encodeURIComponent(airport)+'&t='+Date.now(),{cache:'no-store'});
    const text=await r.text();
    const data=JSON.parse(text);
    if(!r.ok)throw new Error(data.error||'Storyteller request failed');
    renderStory(data);
  }catch(err){console.error('Story overlay update failed:',err);document.getElementById('storyCard').classList.remove('visible')}
  finally{busy=false}
}
updateStory();setInterval(updateStory,UPDATE_MS);
</script>
</body>
</html>`;
  return res.status(200).send(html);
};