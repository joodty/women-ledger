'use strict';
// Stable entrypoint for Termux supervisor, CLI commands and bundled releases.
const fs=require('node:fs'),path=require('node:path');
process.env.WOMEN_APP_ROOT=__dirname;
require(fs.existsSync(path.join(__dirname,'backend','app.cjs'))?'./backend/app.cjs':'./runtime.cjs');
