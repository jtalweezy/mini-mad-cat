#!/usr/bin/env node
'use strict';
// Opt-in GUI test: opens only this app as a hidden window and captures only its renderer.
const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');const readline=require('node:readline');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const electron=require('electron');const {requestCompanion}=require('../lib/control-client.cjs');
const outputDir=path.resolve(process.argv[2]||path.join(root,'smoke-output'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function mcpCalls(directory,event,reducedMotion){
  const env={...process.env,MADCAT_HOME:directory};delete env.ELECTRON_RUN_AS_NODE;
  const bridge=spawn(process.execPath,[path.join(root,'bridge/mcp.cjs')],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pending=new Map();let nextId=0,errors='';bridge.stderr.on('data',data=>errors+=data);
  const lines=readline.createInterface({input:bridge.stdout});lines.on('line',line=>{const value=JSON.parse(line);const completion=pending.get(value.id);if(completion){pending.delete(value.id);completion(value);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timeout=setTimeout(()=>reject(new Error('MCP call timed out')),5000);pending.set(id,value=>{clearTimeout(timeout);resolve(value);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  try{
    const initialized=await call('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'madcat-smoke',version:'1'},capabilities:{}});assert.equal(initialized.result.serverInfo.name,'mini-mad-cat');
    if(reducedMotion){const configured=await call('tools/call',{name:'pet_configure',arguments:{reducedMotion:true}});assert.equal(configured.result.isError,false);}
    const reacted=await call('tools/call',{name:'pet_react',arguments:event});assert.equal(reacted.result.isError,false);
    const result=JSON.parse(reacted.result.content[0].text);assert.equal(result.accepted,true);assert.equal(result.reaction.effect,reducedMotion?null:event.outcome==='failure'?'explosion':event.impact===1?'missiles':'laser');
    const status=await call('tools/call',{name:'pet_status',arguments:{}});assert.equal(status.result.isError,false);
    return {reaction:result,status:JSON.parse(status.result.content[0].text),stderr:errors};
  }finally{bridge.stdin.end();lines.close();}
}
async function runCase(name,event,reducedMotion=false){
  const directory=path.join(outputDir,'data-'+name);await fs.mkdir(directory,{recursive:true});
  const env={...process.env,MADCAT_HOME:directory};delete env.ELECTRON_RUN_AS_NODE;
  const screenshot=path.join(outputDir,name+'.png');let log='';
  const child=spawn(electron,[root,'--hidden','--capture='+screenshot,'--capture-series','--capture-exit'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  try{
    let ready=false;for(let i=0;i<100;i++){try{await fs.access(path.join(directory,'control.json'));ready=true;break;}catch{await pause(100);}}
    if(!ready)throw new Error('Companion did not start: '+log);
    const protocol=await mcpCalls(directory,event,reducedMotion);
    await pause(2400);const recovered=await requestCompanion(null,{directory});assert.equal(recovered.temporaryState,null);
    const exit=await exited;assert.equal(exit.code,0,'Electron failed: '+log);
    const files=(await fs.readdir(outputDir)).filter(file=>file.startsWith(name+'-')&&file.endsWith('.png'));
    assert.equal(files.length,6);const captures=[];for(const file of files){const info=JSON.parse(await fs.readFile(path.join(outputDir,file+'.json'),'utf8'));assert.equal(info.logicalWidth,512);assert.equal(info.logicalHeight,400);const ratio=info.width/512;assert.equal(ratio,info.height/400);assert.ok(info.visiblePixels>3000,'Blank renderer capture');assert.ok(info.petPixels>5000*ratio*ratio,'Missing or clipped pet in renderer capture');assert.ok(info.visiblePixels<info.width*info.height,'Opaque overlay capture');captures.push({file,...info});}
    return {name,ok:true,protocol,recovered,captures,log};
  }finally{if(child.exitCode===null)child.kill();if(path.dirname(path.resolve(directory))!==path.resolve(outputDir))throw new Error('Unsafe smoke data path');await fs.rm(directory,{recursive:true,force:true});}
}
async function main(){await fs.mkdir(outputDir,{recursive:true});const cases=[];for(const item of [['high-success',{outcome:'success',impact:1,confidence:1}],['medium-success',{outcome:'success',impact:.6,confidence:.7}],['failure',{outcome:'failure',impact:1,severity:1,confidence:1}],['reduced-motion',{outcome:'success',impact:1,confidence:1},true]])cases.push(await runCase(...item));const report={ok:true,platform:process.platform,node:process.version,electron:'45.4.1',cases};await fs.writeFile(path.join(outputDir,'smoke-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,outputDir,cases:cases.map(item=>item.name)}));}
main().catch(error=>{console.error(error);process.exitCode=1;});
