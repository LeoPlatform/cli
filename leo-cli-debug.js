"use strict";

const path = require('path');
const program = require('commander');

module.exports = {
    debugBot: function (dir) {
        let rootDir = path.resolve(process.cwd(), dir);
        let pkg = require(path.resolve(rootDir, "package.json"));

        let reactRunner = require("./lib/react.js");

        let buildConfig = require("./lib/build-config").build;

        let c = buildConfig(rootDir);
        process.env.leo_config_bootstrap_path = path.resolve(c._meta.microserviceDir, "leo_config.js");
        process.env.NODE_ENV = program.env || "dev";
        process.env.LEO_LOCAL = "true";

        if (pkg.config && pkg.config.leo && pkg.config.leo.type === "microservice") {
            reactRunner(rootDir, c, c);
        } else {
            process.env.LEO_PREVENT_RUN_AGAIN = "true";
            require(__dirname + "/lib/runner.js");
        }
    }
};
