#!/usr/bin/env node
'use strict';
const {tools,commandForTool}=require('./tools.cjs');
const {requestCompanion}=require('../lib/control-client.cjs');
const versions=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
const modernVersion='2026-07-28';
const serverInfo={name:'mini-mad-cat',version:'1.0.0'};
function response(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');}
function error(id,code,message,data){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{})}})+'\n');}
async function route(message){
  if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'){error(message?.id??null,-32600,'Invalid Request');return;}
  const hasId=Object.hasOwn(message,'id');
  if(!hasId)return; // Notifications, including initialized/cancelled, require no response.
  if(typeof message.id!=='string'&&typeof message.id!=='number'){error(null,-32600,'Invalid request ID');return;}
  const params=message.params??{};
  const requested=params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  const modern=requested!==undefined;
  if(modern&&requested!==modernVersion){error(message.id,-32022,'Unsupported protocol version',{supported:[modernVersion,...versions],requested});return;}
  const done=result=>response(message.id,modern?{...result,resultType:'complete',_meta:{...(result._meta||{}),'io.modelcontextprotocol/serverInfo':serverInfo}}:result);
  if(message.method==='server/discover'){
    if(!modern){error(message.id,-32022,'Unsupported protocol version',{supported:[modernVersion,...versions],requested:requested??null});return;}
    done({supportedVersions:[modernVersion,...versions],capabilities:{tools:{}},instructions:'Controls the same-user local Mini Mad Cat companion. Start npm start separately. No chat transcript is collected.'});return;
  }
  if(message.method==='initialize'){
    response(message.id,{protocolVersion:versions.includes(params.protocolVersion)?params.protocolVersion:versions[0],capabilities:{tools:{listChanged:false}},serverInfo,instructions:'Controls only the local Mini Mad Cat desktop companion. Start it with npm start. No network account or API key is required.'});return;
  }
  if(message.method==='ping'){done({});return;}
  if(message.method==='tools/list'){done({tools});return;}
  if(message.method==='tools/call'){
    try{const command=commandForTool(params.name,params.arguments??{});const result=await requestCompanion(command);done({content:[{type:'text',text:JSON.stringify(result)}],isError:false});}
    catch(cause){done({content:[{type:'text',text:cause.message}],isError:true});}
    return;
  }
  error(message.id,-32601,'Method not found');
}
let buffered='',pending=Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  buffered+=chunk;
  if(Buffer.byteLength(buffered)>262144){process.stderr.write('MCP message exceeds 256 KiB\n');process.exitCode=1;process.stdin.destroy();return;}
  let newline;
  while((newline=buffered.indexOf('\n'))>=0){const line=buffered.slice(0,newline).trim();buffered=buffered.slice(newline+1);if(!line)continue;pending=pending.then(async()=>{let value;try{value=JSON.parse(line);}catch{error(null,-32700,'Parse error');return;}await route(value);}).catch(cause=>{process.stderr.write('MCP request failed: '+cause.message+'\n');});}
});
process.stdin.on('end',()=>{if(buffered.trim())pending=pending.then(()=>{try{return route(JSON.parse(buffered));}catch{error(null,-32700,'Parse error');}});});
