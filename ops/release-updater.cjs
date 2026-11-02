"use strict";
const updater = require("./updater-v2.cjs");
if (require.main === module)
  updater.main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = updater;
