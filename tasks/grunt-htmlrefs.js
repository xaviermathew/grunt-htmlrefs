/*
 * grunt-htmlrefs
 * https://github.com/tactivos/grunt-htmlrefs
 *
 *	Part of this work (the expression at least) is inspired
 *	on what YEOMAN (http://github.com/yeoman) does. However
 *	we chose a simplest path (of replacing/removing only) without
 *	going through the full work of replacing and merging stuff.
 *
 * Copyright (c) 2012 Johnny G. Halife & Mural.ly Dev Team
 */
module.exports = function (grunt) {
	var _ = grunt.util._;

	var path = require('path');
	var less = require('less');
	var parser = new(less.Parser);
	var hashlib = require('crypto');

	// start build pattern --> <!-- ref:[target] output -->
	var regbuild = /<!--\s*ref:(\w+)\s*(.+)\s*-->/;

	// end build pattern -- <!-- endref -->
	var regend = /<!--\s*endref\s*-->/;

	// <script> template
	var scriptTemplate = '<script type="text/javascript" src="<%= dest %>"></script>';

	// stylesheet template
	var stylesheetTemplate = '<link type="text/css" rel="stylesheet" href="<%= dest %>">';

	// inlineCSS template
	var inlineCSSTemplate = '<style><%= dest %></style>';

	// LESS template
	var lessTemplate = '<link type="text/css" rel="stylesheet" href="<%= dest %>">';

	grunt.registerMultiTask('htmlrefs', "Replaces (or removes) references to non-optimized scripts or stylesheets on HTML files", function () {
		var params = this.options();
		var includes = (this.data.includes || {});
		var pkg = (grunt.config.get('pkg') || {});
		var files = this.filesSrc;
		var dest = this.files[0].dest;

		files.map(grunt.file.read).forEach(function (content, i) {
			content = content.toString(); // make sure it's a string and not buffer
			var blocks = getBlocks(content);

			var file = files[i];

			// Determine the linefeed from the content
			var lf = /\r\n/g.test(content) ? '\r\n' : '\n';

			blocks.forEach(function (block) {
				// Determine the indent from the content
				var raw = block.raw.join(lf);
				var options = _.extend({}, { pkg: pkg }, block, params);

				var replacement = htmlrefsTemplate[block.type](options, lf, includes);
				content = content.replace(raw, replacement);
			});

			// write the contents to destination
			var filePath = dest ? path.join(dest, path.basename(file)) : file;
			grunt.file.write(filePath, content);
		});
	});

	var htmlrefsTemplate = {
			js : function (block) {
				var indent = (block.raw[0].match(/^\s*/) || [])[0];
				return indent + grunt.template.process(scriptTemplate, {data: block});
			},
		css : function (block) {
			var raw = block.raw;
			if (raw.length < 3)
				throw new Error("No sources specified in between ref tags");

			var indent = (raw[0].match(/^\s*/) || [])[0];
			var STATIC_URL = block.static_url;
			var STATIC_ROOT = block.static_root;
			var CDN_PREFIX = block.cdn_prefix || STATIC_URL;
			var buff = [];
			for (var i = 1; i < raw.length - 1; i++) {
				var line = raw[i];
				var src = line.match(/href\s*=\s*\"(.+)\"/)[1].replace(STATIC_URL, STATIC_ROOT);
				buff.push(grunt.file.read(src));
			}

            var css = buff.join("\n");
            var dest_original = block.dest.trim();
            var dest;
            var is_file = dest_original.length >= 4 && dest_original.substr(dest_original.length - 4) == ".css";
            if(is_file){
                dest = dest_original;
                block.dest = dest.replace(STATIC_URL, CDN_PREFIX);
            }
            else{
                var hashed_name = hash(css) + ".css";
                dest = path.join(dest_original.replace(STATIC_URL, STATIC_ROOT), hashed_name);
                if(CDN_PREFIX.indexOf("http://", "") > -1)
                    block.dest = "http://" + path.normalize(path.join(dest_original.replace(STATIC_URL, CDN_PREFIX.replace("http://", "")), hashed_name));
                else
                    block.dest = path.normalize(path.join(dest_original.replace(STATIC_URL, CDN_PREFIX), hashed_name));
            }
            grunt.file.write(dest, css);
            return indent + grunt.template.process(lessTemplate, { data : block });
		},
		inlinecss : function (block) {
			var indent = (block.raw[0].match(/^\s*/) || [])[0];
			var lines = grunt.file.read(block.dest).replace(/\r\n/g, '\n').split(/\n/).map(function (l) {
					return indent + l
				});
			return indent + grunt.template.process(inlineCSSTemplate, {
				data : {
					dest : lines
				}
			});
		},
		include : function (block, lf, includes) {
			// let's see if we have that include listed
			if (!includes[block.dest])
				return '';

			var indent = (block.raw[0].match(/^\s*/) || [])[0];
			var lines = grunt.file.read(includes[block.dest]).replace(/\r\n/g, '\n').split(/\n/).map(function (l) {
					return indent + l
				});

			return lines.join(lf);
		},
		remove : function (block) {
			return ''; // removes replaces with nothing
		},
		less : function (block) {
			var raw = block.raw;
			if (raw.length < 3)
				throw new Error("No sources specified in between ref tags");

			var indent = (raw[0].match(/^\s*/) || [])[0];
			var STATIC_URL = block.static_url;
			var STATIC_ROOT = block.static_root;
			var CDN_PREFIX = block.cdn_prefix || STATIC_URL;
			var buff = [];
			for (var i = 1; i < raw.length - 1; i++) {
				var line = raw[i];
				var src = line.match(/href\s*=\s*\"(.+)\"/)[1].replace(STATIC_URL, STATIC_ROOT);
				var parser = new(less.Parser)({
						//paths: ['.', './lib'], // Specify search paths for @import directives
						filename : src // Specify a filename, for better error messages
					});
				parser.parse(grunt.file.read(src), function (e, tree) {
					if (e)
						throw new Error("Error parsing " + src + " - " + e);
					buff.push(tree.toCSS({
							compress : true
						}));
				});
			}

            var css = buff.join("\n");
            var dest_original = block.dest.trim();
            var dest;
            var is_file = dest_original.length >= 4 && dest_original.substr(dest_original.length - 4) == ".css";
            if(is_file){
                dest = dest_original;
                block.dest = dest.replace(STATIC_URL, CDN_PREFIX);
            }
            else{
                var hashed_name = hash(css) + ".css";
                dest = path.join(dest_original.replace(STATIC_URL, STATIC_ROOT), hashed_name);
                if(CDN_PREFIX.indexOf("http://", "") > -1)
                    block.dest = "http://" + path.normalize(path.join(dest_original.replace(STATIC_URL, CDN_PREFIX.replace("http://", "")), hashed_name));
                else
                    block.dest = path.normalize(path.join(dest_original.replace(STATIC_URL, CDN_PREFIX), hashed_name));
            }
            grunt.file.write(dest, css);
            return indent + grunt.template.process(lessTemplate, { data : block });
		},
		add : function (block) {
			var raw = block.raw[1];
			var indent = (raw.match(/^\s*/) || [])[0];
			return indent + grunt.template.process(raw.match(/<!--\s*(.+)\s*-->/)[1], {
				data : block
			});
		}
	};

	function hash(content) {
		return hashlib.createHash("md5").update(content).digest("hex");
	}

	function getBlocks(body) {
		var lines = body.replace(/\r\n/g, '\n').split(/\n/),
			block = false,
			sections = {},
			last;

		lines.forEach(function (l) {
			var build = l.match(regbuild),
				endbuild = regend.test(l);

			if(build) {
				block = true;
				// create a random key to support multiple removes
				var key = build[2].length > 1 ? build[2] : (Math.random(1,2) * Math.random(0, 1));
				sections[[build[1], key.toString().trim()].join(':')] = last = [];
			}

			// switch back block flag when endbuild
			if(block && endbuild) {
				last.push(l);
				block = false;
			}

			if(block && last) {
				last.push(l);
			}
		});

		var blocks = [];

		for(var s in sections) {
			blocks.push(fromSectionToBlock(s, sections[s]));
		}

		return blocks;
	}

	function fromSectionToBlock(key, section) {
		var chunks = key.split(':');

		return {
			type: chunks[0],
			dest: chunks[1],
			raw: section
		};
	}
};
