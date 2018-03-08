"use strict";

const fs = require("fs");
const path = require("path");
module.exports = {
	findFirstPackageValue: function(dir, types, field, reverse) {
		if (!Array.isArray(types)) {
			types = [types];
		}
		var paths = this.findParentFiles(dir, "package.json");
		if (reverse) {
			paths.reverse();
		}
		for (var i = 0; i < paths.length; i++) {
			var file = paths[i];
			var pkg = require(file);
			if (pkg && pkg.config && pkg.config.leo && (types.length === 0 || types.indexOf(pkg.config.leo.type) !== -1)) {
				if (field == "__directory") {
					return path.dirname(file);
				} else {
					return pkg.config.leo[field] || pkg[field];
				}
			}
		}
		return null;
	},
	findParentFiles: function(dir, filename) {
		var paths = [];
		do {
			paths.push(dir);

			var lastDir = dir;
			dir = path.resolve(dir, "../");
		} while (dir != lastDir);

		var matches = [];
		paths.forEach(function(dir) {
			var file = path.resolve(dir, filename);
			if (fs.existsSync(file)) {

				matches.push(file);
			}
		});
		return matches;
	}
};