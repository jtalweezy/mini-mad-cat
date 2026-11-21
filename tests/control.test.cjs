'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const http=require('node:http');
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
  try{
    for(const port of ['1234/other','https://invalid.example',0,65536,1.5]){
      await fs.writeFile(path.join(directory,'control.json'),JSON.stringify({port,token:'a'.repeat(64)}));
      await assert.rejects(requestCompanion(null,{directory}),/Invalid local/);
    }
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('local companion redirects are rejected without forwarding the bearer token',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'madcat-test-'));
  let forwarded=0;
  const destination=http.createServer((_req,res)=>{forwarded++;res.end('{}');});
  await new Promise(resolve=>destination.listen(0,'127.0.0.1',resolve));
  const source=http.createServer((req,res)=>{
    assert.equal(req.url,'/status');
    assert.equal(req.headers.authorization,'Bearer '+'a'.repeat(64));
    res.writeHead(302,{Location:'http://127.0.0.1:'+destination.address().port+'/unexpected'});res.end();
  });
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  try{
    await fs.writeFile(path.join(directory,'control.json'),JSON.stringify({port:source.address().port,token:'a'.repeat(64)}));
    await assert.rejects(requestCompanion(null,{directory}),/Cannot reach the local companion/);
    assert.equal(forwarded,0);
  }finally{await Promise.all([new Promise(resolve=>source.close(resolve)),new Promise(resolve=>destination.close(resolve))]);await fs.rm(directory,{recursive:true,force:true});}
});

test('local companion responses are bounded',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'madcat-test-'));
  const source=http.createServer((_req,res)=>res.end('x'.repeat(65537)));
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  try{
    await fs.writeFile(path.join(directory,'control.json'),JSON.stringify({port:source.address().port,token:'a'.repeat(64)}));
    await assert.rejects(requestCompanion(null,{directory}),/Cannot reach the local companion/);
  }finally{await new Promise(resolve=>source.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});

test('endpoint discovery rejects links outside the selected private directory',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'madcat-test-'));
  const target=path.join(directory,'outside.json');const privateDirectory=path.join(directory,'private');
  await fs.mkdir(privateDirectory,{mode:0o700});
  try{
    await fs.writeFile(target,JSON.stringify({port:12345,token:'a'.repeat(64)}));
    try{await fs.symlink(target,path.join(privateDirectory,'control.json'),'file');}
    catch(error){if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Windows account cannot create file symlinks');return;}throw error;}
    await assert.rejects(requestCompanion(null,{directory:privateDirectory}),/Mini Mad Cat is not running/);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
