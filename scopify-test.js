/* eslint-env mocha, node */
/* eslint-disable no-sync */

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var pick = require('lodash/pick');
var infer = require('tern/lib/infer');
var isBoolean = require('lodash/isBoolean');
var isObject = require('lodash/isObject');
var isString = require('lodash/isString');
var scopify = require('./scopify');
var walk = require('acorn/dist/walk');

// eslint-disable-next-line global-require
var defs = [require('tern/defs/ecma5.json'), require('tern/defs/ecma6.json')];
var fixturesDirectory = path.join(__dirname, 'fixtures');

// Wrap a scope as Tern would do in the "modules" plugin.
var buildWrappingScope = function (parent, origin, node) {
  var scope = new infer.Scope(parent, node);
  scope.origin = origin;
  return scope;
};

// Create a representation of a file's AST and scope like Tern does.
var createTernFile = function (name, code, options) {
  var wrap = isBoolean(options.wrap) ? options.wrap : false;
  var file = {
    name: name,
    text: code
  };
  var context = new infer.Context(defs);
  infer.withContext(context, function () {
    file.ast = infer.parse(file.text, {
      directSourceFile: file,
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      ecmaVersion: 6
    });
    file.scope = context.topScope;
    if (wrap) {
      file.scope = buildWrappingScope(file.scope, file.name, file.ast);
    }
    infer.analyze(file.ast, file.text, file.scope);
  });
  return file;
};

// Apply levels to a source code buffer, like an editor would do.
var tokensToLevels = function (code, tokens) {
  var levels = code.replace(/[^\n]/g, ' ');
  var i;
  for (i = 0; i < tokens.length; i += 3) {
    var start = tokens[i + 0];
    var end = tokens[i + 1];
    var level = tokens[i + 2];
    for (var j = start; j < end; j += 1) {
      if (levels[j] !== '\n') {
        levels = levels.substring(0, j) + level + levels.substring(j + 1);
      }
    }
  }
  return levels;
};

// Check that each level required is present in the output.
var assertLevels = function (actual, expected) {
  var actualIndex = 0;
  var expectedIndex = 0;
  while (expectedIndex < expected.length) {
    var expectedChar = expected[expectedIndex];
    expectedIndex += 1;
    if (expectedChar === '\n') {
      // Keep the actual position in sync with the expected one.
      actualIndex = actual.indexOf('\n', actualIndex);
      actualIndex = actualIndex === -1 ? actual.length : actualIndex + 1;
    } else {
      var actualChar = actual[actualIndex];
      if (actualChar !== '\n') {
        // Wait for the expected index to "catch up."
        actualIndex += 1;
      }
      var expectedCharCode = expectedChar.charCodeAt(0);
      if (expectedCharCode >= 48 && expectedChar <= 57 && actualChar !== expectedChar) {
        assert.fail(
          actual,
          expected,
          'Expected level at position ' + actualIndex + ' to be ' + expectedChar + ' but it was ' + actualChar
        );
      }
    }
  }
};

// Create a test for a .js / .levels fixture pair.
var fixture = function (fixtureName, options) {
  options = isObject(options) ? options : {};
  var jsName = isString(options.js) ? options.js : fixtureName;
  var levelsName = isString(options.levels) ? options.levels : fixtureName;
  var code = fs.readFileSync(path.join(fixturesDirectory, jsName) + '.js', 'utf8');
  var levels = fs.readFileSync(path.join(fixturesDirectory, levelsName) + '.levels', 'utf8');
  var scopifyOptions = pick(options, 'blockScope');
  return function () {
    var file = createTernFile(jsName + '.js', code, options);
    var tokens = scopify(walk, file.ast, file.scope, scopifyOptions);
    assertLevels(tokensToLevels(code, tokens), levels);
  };
};

describe('scopify', function () {
  it('should color variables and functions by scope', fixture('function-scopes'));
  it('should color variables in objects', fixture('object-shorthand'));
  it('should color dynamic values by scope of origin', fixture('dynamic-and-lexical-bindings'));
  it('should color blocks', fixture('blocks', {blockScope: true}));
  it('should color catch block scopes', fixture('catch'));
  it('should color globals in elevated scope', fixture('elevated-globals', {wrap: true}));
});
