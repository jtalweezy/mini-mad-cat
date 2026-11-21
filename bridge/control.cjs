#!/usr/bin/env node
'use strict';
const {requestCompanion}=require('../lib/control-client.cjs');
const {validateCommand,exactKeys}=require('../lib/commands.cjs');
async function main(){
  const [action='status',...args]=process.argv.slice(2);let command;
  if(action==='status')command=null;
  else if(action==='animate')command=validateCommand({action,state:args[0],...(args[1]?{durationMs:Number(args[1])}:{})});
  else if(action==='configure'){const values=JSON.parse(args[0]||'{}');exactKeys(values,['followCursor','trackingMode','clickThrough','scale','reducedMotion','contextBubbles']);command=validateCommand({action,...values});}
  else if(action==='react')command=validateCommand({action,...JSON.parse(args[0]||'{}')});
  else if(action==='reset'||action==='quit')command=validateCommand({action});
  else throw new Error('Usage: node bridge/control.cjs status|animate STATE [MILLISECONDS]|configure JSON|reset|quit');
  process.stdout.write(JSON.stringify(await requestCompanion(command),null,2)+'\n');
}
main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
