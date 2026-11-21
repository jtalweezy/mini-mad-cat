#!/usr/bin/env node
'use strict';
const path=require('node:path');
console.log(JSON.stringify({mcpServers:{'mini-mad-cat':{command:process.execPath,args:[path.resolve(__dirname,'../bridge/mcp.cjs')]}}},null,2));
