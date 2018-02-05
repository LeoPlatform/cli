#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var program = require('commander');
var colors = require('colors');

program
	.version('0.0.2')
	.arguments('<type> <dir>')
	.usage('<type> <dir> [options]')
	.action(function(type, dir) {
		var pkgname = null;
		let declaredType = type = type.toLowerCase();


		var parentType = findFirstPackageValue(process.cwd(), [], "type");
		var parentName = findFirstPackageValue(process.cwd(), [], "name");

		let roots = {
			bot: path.normalize("bots/"),
			load: path.normalize("bots/"),
			enrich: path.normalize("bots/"),
			offload: path.normalize("bots/"),
			resource: path.normalize("apis/"),
		};

		if (['system', 'microservice', 'resource', 'load', 'enrich', 'offload'].indexOf(type) === -1) {
			type = "bot";
		}
		let prefix = "./";

		if (roots[type] && path.resolve(dir).indexOf(roots[type]) === -1) {
			prefix = roots[type] || "";
		}

		if (!fs.existsSync(prefix)) {
			fs.mkdirSync(prefix);
		}
		if (!fs.existsSync(prefix + dir)) {
			if (type == "microservice") {

				if (parentType != "system") {
					console.log(`Type ${type} must be within a system package`);
					process.exit(1);
				}

				copyDirectorySync(__dirname + "/templates/microservice", prefix + dir, {
					'____DIRNAME____': parentName + "-" + dir.replace(/\s+/g, '_')
				});
			} else if (type == "system") {
				copyDirectorySync(__dirname + "/templates/system", prefix + dir, {
					'____DIRNAME____': parentName + "-" + dir.replace(/\s+/g, '_')
				});
			} else {
				if (parentType != "microservice" && parentType != "system") {
					console.log(`Type ${type} must be within a system or microservice package`);
					process.exit(1);
				}

				copyDirectorySync(__dirname + `/templates/${type}`, prefix + dir, {
					'____DIRNAME____': parentName + "-" + dir.replace(/\s+/g, '_'),
					'____BOTNAME____': parentName + "-" + dir.replace(/\s+/g, '_'),
					'____BOTTYPE____': declaredType
				});
			}

			process.chdir(prefix + dir);
			console.log("done");

		} else {
			console.log("Directory already exists");
		}
	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}

function copyDirectorySync(src, dest, replacements) {
	var stats = fs.statSync(src);
	if (stats.isDirectory()) {
		fs.mkdirSync(dest);
		fs.readdirSync(src).forEach(function(entry) {
			copyDirectorySync(path.join(src, entry), path.join(dest, entry), replacements);
		});
	} else {
		var fileText = fs.readFileSync(src).toString('utf8');
		for (var replaceVar in replacements) {
			fileText = fileText.replace(new RegExp(replaceVar, 'g'), replacements[replaceVar]);
		}

		fs.writeFileSync(dest, fileText);
	}
}

function findParentFiles(dir, filename) {
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

function findFirstPackageValue(dir, types, field, reverse) {
	if (!Array.isArray(types)) {
		types = [types];
	}
	var paths = findParentFiles(dir, "package.json");
	if (reverse) {
		paths.reverse();
	}
	for (var i = 0; i < paths.length; i++) {
		var file = paths[i];
		var pkg = require(file);
		if (pkg && pkg.config && pkg.config.leo && (types.length === 0 || types.indexOf(pkg.config.leo.type) !== -1)) {
			return pkg.config.leo[field] || pkg[field];
		}
	}
	return null;
}