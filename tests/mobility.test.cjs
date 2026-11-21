'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {classifyMotion,canChase,travelVisual,mobility}=require('../lib/mobility.cjs');
const {STATES}=require('../lib/atlas.cjs');

test('actual screen movement chooses bird gait, jumpjets upward, and staggered crouch downward',()=>{
  assert.equal(classifyMotion(4,1),'running-right');assert.equal(classifyMotion(-4,-1),'running-left');
  assert.equal(classifyMotion(1,-4),'jumpjet');assert.equal(classifyMotion(-1,4),'crouch');
  assert.equal(classifyMotion(0,0),null);assert.throws(()=>classifyMotion(Infinity,0),/Finite/);
});
test('12 percent dominant-axis hysteresis prevents diagonal mode flicker without delaying reversals',()=>{
  assert.equal(classifyMotion(1,-1.1,'running-right'),'running-right');
  assert.equal(classifyMotion(1,-1.13,'running-right'),'jumpjet');
  assert.equal(classifyMotion(1.1,-1,'jumpjet'),'jumpjet');
  assert.equal(classifyMotion(1.13,-1,'jumpjet'),'running-right');
  assert.equal(classifyMotion(0,3,'jumpjet'),'crouch');
});
test('manual/reaction overrides and expired tracking prevent automatic chase while drag remains separate',()=>{
  assert.equal(canChase({trackingAllowsChase:true}),true);
  assert.equal(canChase({trackingAllowsChase:true,manualActive:true}),false);
  assert.equal(canChase({trackingAllowsChase:true,dragging:true}),false);
  assert.equal(canChase({trackingAllowsChase:false}),false);
});
test('optional mobility atlas never selects unused cells and has registered dual downward plumes',()=>{
  for(const mode of ['jumpjet','crouch'])for(let time=0;time<3000;time+=19){
    const frame=travelVisual(mode,time,{mobilityAvailable:true,thrustAvailable:true});
    assert.equal(frame.sheet,'mobility');assert.ok(frame.column<(mode==='jumpjet'?5:6));
    assert.equal(frame.thrust,mode==='jumpjet');
    if(frame.thrust){assert.equal(frame.thrustSpec.attachments.length,2);assert.deepEqual(frame.thrustSpec.sourceAnchor,{x:96,y:55});assert.ok(frame.thrustSpec.column<4);}
  }
  assert.equal(mobility.width,1152);assert.equal(mobility.height,416);
  assert.equal(travelVisual('crouch',5000,{mobilityAvailable:true}).column,5);
});
test('reduced motion freezes optional poses and stops thrust; missing assets preserve core rendering and public states',()=>{
  const options={mobilityAvailable:true,thrustAvailable:true,reducedMotion:true};
  assert.equal(travelVisual('jumpjet',500,options).column,0);assert.equal(travelVisual('jumpjet',1000,options).thrust,false);
  const fallback=travelVisual('jumpjet',200,{thrustAvailable:true});assert.equal(fallback.sheet,'core');assert.equal(fallback.state,'jumping');assert.equal(fallback.thrust,false);
  assert.equal(STATES.length,9);assert.equal(STATES.includes('jumpjet'),false);assert.equal(STATES.includes('crouch'),false);
});
