module.exports = function(config, version, pages) {
	var p = pages.map(function(e) {
		return "/" + e;
	});
	var regex = "\\\\${leo\.(.*?)}";
	return `"use strict"
var fs = require("fs");
var configure = ${JSON.stringify(config)};
let r = process.resources = process.env.Resources && JSON.parse(process.env.Resources) || {};
configure.aws = Object.assign({}, configure.aws, {cognito_id:r.CognitoId, region:r.Region, cognito_region: r.CognitoRegion || r.Region});
configure.ENV = {
	Resources: r
};

var fullAppName = configure.name.toLowerCase();
if(configure.basePath == "/") {
  var appName = false;
  var baseRef = "/";
} else {
  var appName = configure.basePath || fullAppName.split(/_/).slice(-1)[0];
  var baseRef = "https://" + configure.domainName+"/" + appName + "/";
}
var version = '${version.toString()}';
configure.version = version;

exports.handler = function (event, context, callback) {
  var page = event.resource;
  console.log(page);
  if(page.match(/\\/$/)) {
    page += "_base";
  }
  console.log(page);
  if(['${p.join("','")}'].indexOf(page+"/_base") !== -1) {
    page = page+"/_base";
  }
  console.log(page);


  function doReplacements(data, configure, lookupcache){
        lookupcache = lookupcache || {};
        var groups = getRegexGroups(data, "${regex}", "g");
        for(var g in groups){
            var group = groups[g];
            console.log(group)
            var v = lookupcache[group[1]];
            if (!v){
                v = unpath(group[1], configure);
                lookupcache[group[1]] = v;
            }
            data = data.replace(group[0], v);
        }
        return data;
    }
  function unpath(path, obj){
    return path.split('.').reduce((o,i)=> o[i], obj);
  }

  function getRegexGroups(text, regex, flags){
    var e = [], f = null, g = null, h = null;
    var a = new RegExp(regex, flags);
    var c = text;
    for (; !f && (g = a.exec(c)); ) {
            if (a.global && h === a.lastIndex) {
              f = "infinite";
              break;
            }
            if (g.end = (h = g.index + g[0].length) - 1, g.input = null, e.push(g), !a.global)
              break;
          }
    return e;
  }
  var lookupcache = {};

  configure.static.uri = configure.static.cloudfront + fullAppName + '/' + version + '/';
  configure.custom_css = process.env.CustomCSS || "";
  configure.custom_js = process.env.CustomJS || "";
  configure.baseHref = baseRef;
  if(['${p.join("','")}'].indexOf(page) !== -1) {
    fs.readFile("./pages/"+page, 'utf8', function (err, data) {
      data = doReplacements(data, configure, lookupcache);
      var replacements = Object.assign({}, configure.htmlReplacements);
      replacements = Object.assign(replacements, {
        "__STATIC_URI__/?": configure.static.cloudfront + fullAppName + "/" + version + "/",
        "__COGNITO_ID__/?": configure.aws.cognito_id,
        "__CLOUD_FRONT_URI__/?": configure.static.cloudfront,
        "__BASE_HREF__":  baseRef,
        "__BASE_HREF_SCRIPT__":  '<script>var b = document.createElement("base");b.setAttribute("href", document.location.origin + "/" + document.location.pathname.split("/")[1]+"/");document.head.prepend(b);</script>',
        "<base-href-script/>":  '<script>var b = document.createElement("base");b.setAttribute("href", document.location.origin + "/" + document.location.pathname.split("/")[1]+"/");document.head.prepend(b);</script>',
        "<base-href-script />":  '<script>var b = document.createElement("base");b.setAttribute("href", document.location.origin + "/" + document.location.pathname.split("/")[1]+"/");document.head.prepend(b);</script>'
      });

      if (process.env.CustomFavicon){
        replacements[\`<link rel="icon" href="//cdnleo.s3.amazonaws.com/logos/leo_icon.png" type="image/png" />\`]          = \`<link rel="icon" href="\${process.env.CustomFavicon}" type="image/png" />\`;
        replacements[\`<link rel="shortcut icon" href="//cdnleo.s3.amazonaws.com/logos/leo_icon.png" type="image/png" />\`] = \`<link rel="shortcut icon" href="\${process.env.CustomFavicon}" type="image/png" />\`;
      }

      for(var key in replacements){
        var regex = new RegExp(key, "g");
        data = data.replace(regex, replacements[key]);
      }
      if(err) {
        callback(null, {
            statusCode: 500,
            headers: {
              'Content-Type': 'text/html'
            },
            body: err.toString()
          });
      } else {
        callback(null, {
            statusCode: 200,
            headers: {
              'Content-Type': 'text/html'
            },
            body: data
        });
      }
    });
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
`;
};