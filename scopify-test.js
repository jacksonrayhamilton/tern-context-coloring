/* eslint-env mocha, node */
/* eslint-disable no-sync */

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var infer = require('tern/lib/infer');
var isBoolean = require('lodash/isBoolean');
var isObject = require('lodash/isObject');
var isString = require('lodash/isString');
var scopify = require('./scopify');
var walk = require('acorn/dist/walk');

var fixturesDirectory = path.join(__dirname, 'fixtures');

// Create a representation of a file's AST and scope like Tern does.
var createTernFile = function (name, code) {
  var file = {
    name: name,
    text: code
  };
  var context = new infer.Context();
  infer.withContext(context, function () {
    file.ast = infer.parse(file.text, {
      directSourceFile: file,
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      ecmaVersion: 6
    });
    file.scope = context.topScope;
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
  var scopifyOptions = {};
  if (isBoolean(options.blockScope)) {
    scopifyOptions.blockScope = options.blockScope;
  }
  return function () {
    var file = createTernFile(jsName + '.js', code);
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
  it('should infer module scope from import', fixture('es-modules-import', {inferModules: true}));
  it('should infer module scope from export', fixture('es-modules-export', {inferModules: true}));
  it('should infer node from shebang', fixture('node-shebang', {inferNode: true, levels: 'elevated'}));
  it('should infer node from top-level global module.exports', fixture('node-module-exports', {inferNode: true, levels: 'elevated'}));
  it('should infer node from top-level global module.exports property', fixture('node-module-exports-property', {inferNode: true, levels: 'elevated'}));
  it('should infer node from top-level global exports property', fixture('node-exports-property', {inferNode: true, levels: 'elevated'}));
  it('should infer node from top-level global require call', fixture('node-require', {inferNode: true, levels: 'elevated'}));
  it('should not infer node from top-level local require call', fixture('node-local-require', {inferNode: true, levels: 'unelevated'}));
  it('should not infer node from nested global require call', fixture('node-nested-require', {inferNode: true, levels: 'unelevated'}));
});
