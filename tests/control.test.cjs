'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {createControlServer}=require('../lib/control-server.cjs');const {requestCompanion}=require('../lib/control-client.cjs');
const {validateCommand}=require('../lib/commands.cjs');
test('loopback API requires token, rejects browser origins, validates commands and does not expose token',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'madcat-test-'));const calls=[];
  const control=await createControlServer({getStatus:()=>({state:'idle'}),execute:value=>{calls.push(validateCommand(value));return {ok:true};}});
  try{
    await fs.writeFile(path.join(directory,'control.json'),JSON.stringify({port:control.port,token:control.token}));
    const url=`http://127.0.0.1:${control.port}`;
    assert.equal((await fetch(url+'/status')).status,401);
    assert.equal((await fetch(url+'/status',{headers:{Authorization:'Bearer '+control.token,Origin:'https://example.com'}})).status,403);
    assert.deepEqual(await requestCompanion(null,{directory}),{state:'idle'});
    assert.deepEqual(await requestCompanion({action:'animate',state:'waving',durationMs:1000},{directory}),{ok:true});assert.equal(calls[0].state,'waving');
    await assert.rejects(requestCompanion({action:'exec',command:'oops'},{directory}),/Unknown action/);
    assert.equal((await fetch(url+'/unknown',{headers:{Authorization:'Bearer '+control.token}})).status,404);
  }finally{await control.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('invalid endpoint cannot redirect token to a remote hostname',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'madcat-test-'));
  try{await fs.writeFile(path.join(directory,'control.json'),JSON.stringify({port:'https://evil.example',token:'x'}));await assert.rejects(requestCompanion(null,{directory}),/Invalid local/);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
