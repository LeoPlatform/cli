"use strict";

var fs = require("fs");
var fullConfig = __CONFIG__;
var configure = fullConfig[process.env.NODE_ENV] || fullConfig._global || {};
process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
if (process.resources.CustomFavicon == "") {
	delete process.resources.CustomFavicon;
}

let pages = __PAGES__;

configure.uri = configure.staticAssets;
configure.static = {
	uri: configure.staticAssets
};
Object.assign(configure, process.resources);

var p = pages.map(function(e) {
	return "/" + e;
});

function flattenVariables(obj, out, separator, prefix) {
	prefix = prefix || "";
	separator = separator || ":";
	Object.keys(obj).forEach((k) => {
		var v = obj[k];
		if (typeof v === "object" && !(Array.isArray(v)) && v !== null) {
			flattenVariables(v, out, separator, prefix + k.toLowerCase() + separator);
		} else {
			out[prefix + k.toLowerCase()] = v;
		}
	});
}
let variables = {};
flattenVariables(configure, variables, '.', "leo.");

let pageCache = {};

function getPage(page) {
	if (!(page in pageCache)) {
		let data = fs.readFileSync("./pages/" + page, 'utf8');
		pageCache[page] = data.replace(/\$\{(leo[^{}]*?)\}/g, function(match, variable) {
			variable = variable.toLowerCase();
			if (variable == "leo") {
				return JSON.stringify(configure);
			} else {
				return variables[variable];
			}
		});
	}
	return pageCache[page];
}

exports.handler = function(event, context, callback) {
	var page = event.resource;
	variables['leo.basehref'] = variables.basehref = '/' + event.requestContext.path.split('/')[1].replace(/\/$/, '') + "/";
	if (page.match(/\/$/)) {
		page += "_base";
	}
	if (p.indexOf(page + "/_base") !== -1) {
		page = page + "/_base";
	}
	if (p.indexOf(page) !== -1) {
		try {
			callback(null, {
				statusCode: 200,
				headers: {
					'Content-Type': 'text/html'
				},
				body: getPage(page)
			});
		} catch (err) {
			callback(null, {
				statusCode: 500,
				headers: {
					'Content-Type': 'text/html'
				},
				body: err.toString()
			});
		}
	} else {
		callback(null, {
			statusCode: 404,
			headers: {
				'Content-Type': 'text/html'
			},
			body: "File not found"
		});
	}
};
