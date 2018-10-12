"use strict";

const fs = require("fs");
const path = require("path");
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

module.exports = {
	prompt: require("../lib/prompt"),
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
	},
	copyDirectorySync: function(src, dest, replacements, ignore) {
		for (let i = 0; i < ignore.length; i++) {
			if (src.match(ignore[i])) {
				return;
			}
		}

		let stats = fs.statSync(src);
		if (stats.isDirectory()) {
			for (let replaceVar in replacements) {
				dest = dest.replace(new RegExp(replaceVar, 'g'), replacements[replaceVar]);
			}
			if (!fs.existsSync(dest)) {
				fs.mkdirSync(dest);
			}
			fs.readdirSync(src).forEach((entry) => {
				this.copyDirectorySync(path.join(src, entry), path.join(dest, entry), replacements, ignore);
			});
		} else {
			let fileText = fs.readFileSync(src).toString('utf8');
			for (let replaceVar in replacements) {
				fileText = fileText.replace(new RegExp(replaceVar, 'g'), replacements[replaceVar]);
			}
			for (let replaceVar in replacements) {
				dest = dest.replace(new RegExp(replaceVar, 'g'), replacements[replaceVar]);
			}
			fs.writeFileSync(dest, fileText);
		}
	},
	asyncReadFile: async function(file) {
			return await readFile(file, 'utf8');
		},
		asyncWriteFile: async function(file, data) {
				return await writeFile(file, data, 'utf8');
			},
			properCaseTransform: function(text) {
				return text.replace(/[^a-zA-Z0-9]+/g, "_").replace(/(^\w|_\w)/g, function(txt) {
					return txt.charAt(txt.length == 1 ? 0 : 1).toUpperCase();
				});
			}
};
