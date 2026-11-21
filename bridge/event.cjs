#!/usr/bin/env node
'use strict';
const {requestCompanion}=require('../lib/control-client.cjs');
const {validateReaction}=require('../lib/reactions.cjs');
let input='';process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(Buffer.byteLength(input)>8192){process.stderr.write('Event exceeds 8 KiB\n');process.exit(1);}});
process.stdin.on('end',async()=>{try{const event=validateReaction(JSON.parse(input));const result=await requestCompanion({action:'react',...event});process.stdout.write(JSON.stringify(result)+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}});
