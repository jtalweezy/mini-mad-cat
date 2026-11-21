'use strict';
const defaults=require('../config/reactions.json');
const {exactKeys}=require('./commands.cjs');
const {manifest}=require('./atlas.cjs');
const OUTCOMES=Object.freeze(['success','failure','partial','blocked']);
function validateReaction(event){
  exactKeys(event,['outcome','impact','confidence','severity','message']);
  if(!OUTCOMES.includes(event.outcome))throw new TypeError('outcome must be success, failure, partial, or blocked');
  const result={outcome:event.outcome,impact:event.impact??.5,confidence:event.confidence??1,severity:event.severity??.5};
  for(const key of ['impact','confidence','severity'])if(!Number.isFinite(result[key])||result[key]<0||result[key]>1)throw new TypeError(key+' must be from 0 to 1');
  if(event.message!==undefined){if(typeof event.message!=='string'||Array.from(event.message).length>96||/[\u0000-\u001f\u007f]/.test(event.message))throw new TypeError('message must be at most 96 characters without control characters');result.message=event.message;}
  return result;
}
function validatePolicy(config){
  if(!Number.isInteger(config.cooldownMs)||config.cooldownMs<0||config.cooldownMs>60000)throw new TypeError('Invalid reaction cooldown');
  for(const [group,keys] of [['successWeights',['impact','confidence']],['failureWeights',['severity','impact','confidence']]]){
    exactKeys(config[group],keys);
    if(!config[group]||keys.some(k=>!Number.isFinite(config[group][k])||config[group][k]<0)||keys.reduce((n,k)=>n+config[group][k],0)<=0)throw new TypeError('Invalid '+group);
  }
  if(!config.thresholds||!Number.isFinite(config.thresholds.laser)||!Number.isFinite(config.thresholds.missiles)||config.thresholds.laser<0||config.thresholds.missiles>1||config.thresholds.laser>config.thresholds.missiles)throw new TypeError('Invalid reaction thresholds');
  for(const key of ['successSmall','successLarge','failure','partial','blocked'])if(typeof config.bubbles?.[key]!=='string'||Array.from(config.bubbles[key]).length>96)throw new TypeError('Invalid bubble '+key);
  return config;
}
function weighted(event,weights){const entries=Object.entries(weights);return entries.reduce((sum,[key,weight])=>sum+event[key]*weight,0)/entries.reduce((sum,[,weight])=>sum+weight,0);}
function planReaction(raw,config=defaults){
  const event=validateReaction(raw);validatePolicy(config);
  const score=weighted(event,event.outcome==='failure'?config.failureWeights:config.successWeights);
  let state,effect=null,bubble,durationMs;
  if(event.outcome==='success'){state='waving';effect=score>=config.thresholds.missiles?'missiles':score>=config.thresholds.laser?'laser':null;bubble=score>=config.thresholds.missiles?config.bubbles.successLarge:config.bubbles.successSmall;durationMs=2200;}
  if(event.outcome==='failure'){state='failed';effect=score>=.75?'explosion':null;bubble=config.bubbles.failure;durationMs=2200;}
  if(event.outcome==='partial'){state='review';bubble=config.bubbles.partial;durationMs=2000;}
  if(event.outcome==='blocked'){state='waiting';bubble=config.bubbles.blocked;durationMs=2400;}
  const holdMs=event.outcome==='failure'?Math.round(150+score*500):effect==='laser'?650:0;
  const holdFrame=event.outcome==='failure'?3:effect==='laser'?2:null;
  const animationMs=manifest.states[state].durations.reduce((sum,value)=>sum+value,0)+holdMs+180;
  return {outcome:event.outcome,score:Number(score.toFixed(4)),state,effect,bubble:event.message||bubble,durationMs,animationMs,holdMs,holdFrame};
}
function createReactionController(config=defaults){
  validatePolicy(config);let last=null;
  return {react(raw,{now=Date.now(),reducedMotion=false}={}){
    const reaction=planReaction(raw,config);
    if(last&&now-last.time<config.cooldownMs){const remaining=config.cooldownMs-(now-last.time);return {accepted:false,reason:'cooldown',cooldownMs:remaining};}
    last={time:now};
    if(reducedMotion)reaction.effect=null;
    return {accepted:true,cooldownMs:config.cooldownMs,reaction:{...reaction,reducedMotion}};
  }};
}
module.exports={OUTCOMES,validateReaction,validatePolicy,planReaction,createReactionController};
