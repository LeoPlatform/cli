"use strict";

var fs = require("fs");
var login = require("./login.js")(process.env.Logins);
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
configure.logins = "__delayed_logins__";
let variables = {};
flattenVariables(configure, variables, '.', "leo.");

let pageCachePerBasePath = {};

function getPage(page) {
	if (!(variables.basehref in pageCachePerBasePath)) {
		pageCachePerBasePath[variables.basehref] = {};
	}
	let pageCache = pageCachePerBasePath[variables.basehref];

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
	variables['leo.basehref'] = variables.basehref = ("/" + event.requestContext.path.split('/')[1].replace(/\/$/, '') + "/").replace(/\/+/g, "/");

	if (page.match(/\/$/)) {
		page += "_base";
	}
	if (p.indexOf(page + "/_base") !== -1) {
		page = page + "/_base";
	}
	if (p.indexOf(page) !== -1) {
		try {

			let logins = "null";
			if (login.length()) {
				logins = JSON.stringify({
					Region: process.resources.Region,
					IdentityPoolId: process.resources.CognitoId,
					Logins: login.get(event)
				})
			}
			callback(null, {
				statusCode: 200,
				headers: {
					'Content-Type': 'text/html'
				},
				body: getPage(page).replace(/__delayed_logins__/, logins)
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
