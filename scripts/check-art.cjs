#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {manifest}=require('../lib/atlas.cjs');
const file=path.join(__dirname,'..','assets',manifest.sheet);
const bytes=fs.readFileSync(file);
if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Artwork must be a PNG');
if(bytes.readUInt32BE(16)!==1536||bytes.readUInt32BE(20)!==2288)throw new Error('Wrong sprite dimensions');
if(bytes.length>20*1024*1024)throw new Error('Sprite sheet exceeds 20 MiB');
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
if(manifest.sha256&&manifest.sha256!==sha256)throw new Error('Artwork hash does not match manifest');
const effectsManifest=require('../assets/effects-manifest.json');const effectBytes=fs.readFileSync(path.join(__dirname,'..','assets',effectsManifest.sheet));
if(!effectBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||effectBytes.readUInt32BE(16)!==768||effectBytes.readUInt32BE(20)!==624)throw new Error('Effects must be a 768 by 624 PNG');
const effectsSha256=crypto.createHash('sha256').update(effectBytes).digest('hex');if(effectsManifest.sha256&&effectsManifest.sha256!==effectsSha256)throw new Error('Effects hash does not match manifest');
console.log(JSON.stringify({ok:true,sprite:{width:1536,height:2288,bytes:bytes.length,sha256},effects:{width:768,height:624,bytes:effectBytes.length,sha256:effectsSha256}}));
