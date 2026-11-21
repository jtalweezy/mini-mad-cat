'use strict';
const canvas=document.getElementById('pet');
const context=canvas.getContext('2d');
const image=new Image();
let frame={row:0,column:0,state:'idle'};
function render(){if(!image.complete||!image.naturalWidth)return;context.clearRect(0,0,192,208);context.drawImage(image,frame.column*192,frame.row*208,192,208,0,0,192,208);}
image.onload=render;image.src='../assets/spritesheet.png';
window.madcat.onFrame(value=>{if(Number.isInteger(value.row)&&value.row>=0&&value.row<11&&Number.isInteger(value.column)&&value.column>=0&&value.column<8){frame=value;render();}});
canvas.addEventListener('pointerdown',event=>{if(event.button===0){canvas.setPointerCapture(event.pointerId);window.madcat.startDrag();}});
canvas.addEventListener('pointerup',()=>window.madcat.endDrag());
canvas.addEventListener('lostpointercapture',()=>window.madcat.endDrag());
canvas.addEventListener('dblclick',()=>window.madcat.wave());
canvas.addEventListener('contextmenu',event=>{event.preventDefault();window.madcat.menu();});
window.addEventListener('blur',()=>window.madcat.endDrag());
const effectsCanvas=document.getElementById('effects');const fxContext=effectsCanvas.getContext('2d');
const effectsImage=new Image();effectsImage.src='../assets/effects.png';
const bubble=document.getElementById('bubble');let reaction=null;
function drawEffect(now){
  fxContext.clearRect(0,0,512,400);
  if(!reaction)return;
  const elapsed=now-reaction.started;const progress=elapsed/reaction.durationMs;
  if(progress>=1){reaction=null;bubble.hidden=true;return;}
  if(reaction.effect&&effectsImage.complete&&effectsImage.naturalWidth){
    const rows={laser:0,missiles:1,explosion:2};const row=rows[reaction.effect];const column=Math.floor(elapsed/90)%4;
    function sprite(x,y,angle,scale,opacity=1,anchorX=96,anchorY=104){fxContext.save();fxContext.globalAlpha=opacity;fxContext.translate(x,y);fxContext.rotate(angle);fxContext.scale(scale,scale);fxContext.drawImage(effectsImage,column*192,row*208,192,208,-anchorX,-anchorY,192,208);fxContext.restore();}
    // The generated beam starts at (5,104). The raised cannon in waving frame2
    // has its muzzle at pet-local (157,84), so the actual light starts at that muzzle.
    if(reaction.effect==='laser'&&elapsed>=320&&elapsed<=900){sprite(317,264,-1.1,1.1,Math.min(1,(elapsed-320)/80),5,104);}
    if(reaction.effect==='missiles'){
      // Attach the generated rocket tail to each launch pod, then move the whole
      // generated sprite away from it. No projectile geometry is drawn in code.
      if(elapsed>=200&&elapsed<1400){const t=(elapsed-200)/1200;sprite(214+150*t,245-140*t-20*Math.sin(Math.PI*t),-1.1+.25*t,.32,Math.min(1,(1-t)*7),34,104);}
      if(elapsed>=400&&elapsed<1600){const q=(elapsed-400)/1200;sprite(292+120*q,245-155*q-20*Math.sin(Math.PI*q),-1.1+.2*q,.3,Math.min(1,(1-q)*7),34,104);}
    }
    if(reaction.effect==='explosion'&&progress<.65){sprite(256,275,0,.7+.35*progress,Math.max(0,1-progress*1.2));}
  }
}
// Unlike requestAnimationFrame, this remains active for intentional hidden
// own-window tests when Electron's background throttling is disabled.
setInterval(()=>drawEffect(performance.now()),1000/30);
window.madcat.onReaction(value=>{
  if(!value||typeof value.bubble!=='string'||value.bubble.length>192)return;
  reaction={effect:['laser','missiles','explosion'].includes(value.effect)?value.effect:null,durationMs:Math.max(500,Math.min(10000,Number(value.durationMs)||2200)),started:performance.now()};
  bubble.textContent=value.bubble; // Never parse agent text as HTML.
  bubble.hidden=value.contextBubbles===false||!value.bubble;
  if(value.reducedMotion)reaction.effect=null;
  drawEffect(performance.now());
});
window.madcat.onPreferences(value=>{
  if(value.reducedMotion&&reaction)reaction.effect=null;
  bubble.hidden=value.contextBubbles===false||!reaction||!bubble.textContent;
});
