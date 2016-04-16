/* global acorn: false, exports: false, define: false, module: false,
          require: false, scopify: false, tern: false */
(function (mod) {
  'use strict';
  if (typeof module === 'object' && module.exports) { // CommonJS
    exports.initialize = function (ternDir) {
      /* eslint-disable global-require */
      var path = require('path');
      mod(require(path.resolve(ternDir, 'lib/infer')),
          require(path.resolve(ternDir, 'lib/tern')),
          require(path.resolve(ternDir, 'node_modules/acorn/dist/walk')),
          require('fs'),
          require('tmp'),
          require('./scopify'));
      /* eslint-enable global-require */
    };
    return;
  }
  if (typeof define === 'function' && define.amd) { // AMD
    define(['tern/lib/infer',
            'tern/lib/tern',
            'acorn/dist/walk',
            'fs',
            'tmp',
            './scopify'], mod);
    return;
  }
  mod(tern, tern, acorn.walk, null, null, scopify); // Global
}(function (infer, tern, walk, fs, tmp, scopify) {

  'use strict';

  var isNumber = function (value) {
    // eslint-disable-next-line no-self-compare
    return typeof value === 'number' && value === value;
  };

  var isBoolean = function (value) {
    return typeof value === 'boolean';
  };

  var has = function (object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
  };

  var ternError = function (msg) {
    var err = new Error(msg);
    err.name = 'TernError';
    return err;
  };

  var coloringsMap = Object.create(null);
  var charOffset = 0;
  var blockScope = false;
  var inferModules = true;
  var inferNode = true;
  var useFileSystem = false;

  var postInfer = function (ast, scope) {
    coloringsMap[ast.sourceFile.name] = scopify(walk, ast, scope, {
      charOffset: charOffset,
      blockScope: blockScope,
      inferModules: inferModules,
      inferNode: inferNode
    });
  };

  tern.registerPlugin('context-coloring', function (server, options) {
    if (has(options, 'charOffset')) {
      if (isNumber(options.charOffset)) {
        charOffset = options.charOffset;
      } else {
        throw ternError('Option charOffset must be a number');
      }
    }
    if (has(options, 'blockScope')) {
      if (isBoolean(options.blockScope)) {
        blockScope = options.blockScope;
      } else {
        throw ternError('Option blockScope must be a boolean');
      }
    }
    if (has(options, 'inferModules')) {
      if (isBoolean(options.inferModules)) {
        inferModules = options.inferModules;
      } else {
        throw ternError('Option inferModules must be a boolean');
      }
    }
    if (has(options, 'inferNode')) {
      if (isBoolean(options.inferNode)) {
        inferNode = options.inferNode;
      } else {
        throw ternError('Option inferNode must be a boolean');
      }
    }
    if (has(options, 'useFileSystem')) {
      if (isBoolean(options.useFileSystem)) {
        useFileSystem = options.useFileSystem;
      } else {
        throw ternError('Option useFileSystem must be a boolean');
      }
    }
    server.on('postInfer', postInfer);
  });

  tern.defineQueryType('context-coloring', {
    run: function (Server, query, file) {
      var coloring = coloringsMap[file.name];
      if (useFileSystem) {
        if (fs && tmp) {
          // Tern wants the response object synchronously.
          /* eslint-disable no-sync */
          var tmpobj = tmp.fileSync();
          fs.writeFileSync(tmpobj.name, JSON.stringify(coloring));
          /* eslint-enable no-sync */
          return {file: tmpobj.name};
        } else {
          throw ternError('No file system available');
        }
      }
      return coloring;
    },
    takesFile: true,
    fullFile: true
  });

}));
