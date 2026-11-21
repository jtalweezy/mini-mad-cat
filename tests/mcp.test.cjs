'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const path=require('node:path');
function talk(messages){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,'../bridge/mcp.cjs')],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',errors='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>errors+=data);child.once('error',reject);child.once('exit',code=>code===0?resolve({messages:output.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)),errors}):reject(new Error(errors)));child.stdin.end(messages.map(message=>typeof message==='string'?message:JSON.stringify(message)).join('\n')+'\n');});}
test('legacy stdio handshake, notifications, strict arguments and parse errors remain valid JSON-RPC',async()=>{
  const {messages,errors}=await talk([{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'pet_animate',arguments:{state:'exec'}}},'not-json']);
  assert.equal(errors,'');assert.equal(messages.length,4);assert.equal(messages[0].result.protocolVersion,'2025-11-25');assert.equal(messages[1].result.tools.length,5);assert.equal(messages[2].result.isError,true);assert.equal(messages[3].error.code,-32700);
});
test('modern discovery and per-request versioning support current clients without a handshake',async()=>{
  const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}};
  const {messages}=await talk([{jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:meta}},{jsonrpc:'2.0',id:2,method:'tools/list',params:{_meta:meta}},{jsonrpc:'2.0',id:3,method:'ping',params:{_meta:{...meta,'io.modelcontextprotocol/protocolVersion':'1900-01-01'}}}]);
  assert.equal(messages[0].result.resultType,'complete');assert.ok(messages[0].result.supportedVersions.includes('2026-07-28'));assert.equal(messages[1].result._meta['io.modelcontextprotocol/serverInfo'].name,'mini-mad-cat');assert.equal(messages[2].error.code,-32022);
});
