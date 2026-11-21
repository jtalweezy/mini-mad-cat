'use strict';
const { STATES }=require('../lib/atlas.cjs');
const { exactKeys, validateCommand }=require('../lib/commands.cjs');
const {OUTCOMES,validateReaction}=require('../lib/reactions.cjs');
const {TRACKING_MODES}=require('../lib/tracking.cjs');
const tools=[
  {name:'pet_status',description:'Read the local Mini Mad Cat state and capabilities.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'pet_animate',description:'Show a temporary animation on the local Mini Mad Cat companion.',inputSchema:{type:'object',properties:{state:{type:'string',enum:STATES},durationMs:{type:'integer',minimum:100,maximum:300000,default:7000}},required:['state'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},
  {name:'pet_configure',description:'Configure the local desktop companion. Mouse tracking can always run, run for 15 seconds after a visible click, or stay off; followCursor controls whether an active tracking window also moves the pet.',inputSchema:{type:'object',properties:{followCursor:{type:'boolean'},trackingMode:{type:'string',enum:TRACKING_MODES},clickThrough:{type:'boolean'},scale:{type:'number',minimum:.5,maximum:2},reducedMotion:{type:'boolean'},contextBubbles:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},
  {name:'pet_react',description:'React to an explicitly assessed task outcome. Send only a coarse result, never a transcript. Success can salute, fire a generated laser, or launch missiles; failure plays knockdown/recovery. Cooldown limits repeated reactions.',inputSchema:{type:'object',properties:{outcome:{type:'string',enum:OUTCOMES},impact:{type:'number',minimum:0,maximum:1,default:.5},confidence:{type:'number',minimum:0,maximum:1,default:1},severity:{type:'number',minimum:0,maximum:1,default:.5},message:{type:'string',maxLength:96}},required:['outcome'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},
  {name:'pet_reset',description:'Clear a temporary animation and return to normal cursor-aware idle behavior.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}}
];
function commandForTool(name,args={}) {
  if(name==='pet_status'){exactKeys(args,[]);return null;}
  if(name==='pet_reset'){exactKeys(args,[]);return {action:'reset'};}
  if(name==='pet_animate'){exactKeys(args,['state','durationMs']);return validateCommand({action:'animate',...args});}
  if(name==='pet_configure'){exactKeys(args,['followCursor','trackingMode','clickThrough','scale','reducedMotion','contextBubbles']);return validateCommand({action:'configure',...args});}
  if(name==='pet_react')return {action:'react',...validateReaction(args)};
  throw new TypeError('Unknown tool: '+name);
}
module.exports={tools,commandForTool};
