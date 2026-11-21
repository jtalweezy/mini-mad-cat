'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {manifest,directionForOffset,animationCell,lookCell,clampPosition}=require('../lib/atlas.cjs');
const {validateCommand}=require('../lib/commands.cjs');
const {commandForTool}=require('../bridge/tools.cjs');
const {planReaction,createReactionController,validateReaction}=require('../lib/reactions.cjs');
test('all screen-relative cardinal and diagonal indices match clockwise atlas convention',()=>{
  assert.equal(directionForOffset(0,-200),0);assert.equal(directionForOffset(200,0),4);assert.equal(directionForOffset(0,200),8);assert.equal(directionForOffset(-200,0),12);
  assert.equal(directionForOffset(200,-200),2);assert.equal(directionForOffset(-200,200),10);assert.equal(directionForOffset(0,0),null);
  for(let i=0;i<16;i++){const angle=i*Math.PI/8;assert.equal(directionForOffset(Math.sin(angle)*200,-Math.cos(angle)*200),i);assert.deepEqual(lookCell(i),{row:9+Math.floor(i/8),column:i%8});}
});
test('animation timing never selects unused cells and one-shot recovery clamps at upright last frame',()=>{
  for(const [state,spec]of Object.entries(manifest.states))for(let time=0;time<10000;time+=17){const frame=animationCell(state,time);assert.equal(frame.row,spec.row);assert.ok(frame.column<spec.durations.length);}
  assert.deepEqual(animationCell('idle',279),{row:0,column:0});assert.deepEqual(animationCell('idle',280),{row:0,column:1});
  assert.deepEqual(animationCell('failed',100000,{loop:false}),{row:5,column:7});
});
test('clamp works with negative multi-display coordinates and oversized windows',()=>{
  assert.deepEqual(clampPosition(-5000,900,512,400,{x:-1920,y:0,width:1920,height:1080}),{x:-1920,y:680});
  assert.deepEqual(clampPosition(300,300,512,400,{x:0,y:0,width:400,height:300}),{x:0,y:0});
});
test('control rejects unknown actions, paths, extra tool arguments, and unsafe text',()=>{
  assert.throws(()=>validateCommand({action:'exec',command:'whoami'}));assert.throws(()=>commandForTool('pet_animate',{state:'idle',action:'quit'}));
  assert.throws(()=>validateCommand({action:'animate',state:'unknown'}));assert.throws(()=>validateCommand({action:'configure',scale:9}));
  assert.throws(()=>validateReaction({outcome:'success',message:'x\nscript'}));assert.throws(()=>validateReaction({outcome:'success',confidence:2}));
});
test('weighted task success thresholds, failure recovery, cooldown and reduced motion',()=>{
  assert.equal(planReaction({outcome:'success',impact:0,confidence:.1}).effect,null);
  assert.equal(planReaction({outcome:'success',impact:.6,confidence:.7}).effect,'laser');
  assert.equal(planReaction({outcome:'success',impact:1,confidence:1}).effect,'missiles');
  const fail=planReaction({outcome:'failure',impact:1,severity:1,confidence:1});assert.equal(fail.state,'failed');assert.equal(fail.effect,'explosion');assert.ok(fail.animationMs>1220);assert.ok(fail.holdMs>0);
  const controller=createReactionController();const one=controller.react({outcome:'success',impact:1},{now:10000,reducedMotion:true});assert.equal(one.accepted,true);assert.equal(one.reaction.effect,null);
  assert.equal(controller.react({outcome:'failure'},{now:11000}).accepted,false);assert.equal(controller.react({outcome:'failure'},{now:13000}).accepted,true);
});
