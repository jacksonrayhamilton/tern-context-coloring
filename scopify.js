/* global define: false, module: false */
(function (mod) {
  'use strict';
  if (typeof module === 'object' && module.exports) { // CommonJS
    module.exports = mod();
    return;
  }
  if (typeof define === 'function' && define.amd) { // AMD
    define(mod);
    return;
  }
  var global = Function('return this;')(); // eslint-disable-line no-new-func
  global.scopify = mod(); // Global
}(function () {

  'use strict';

  var isNumber = function (value) {
    // eslint-disable-next-line no-self-compare
    return typeof value === 'number' && value === value;
  };

  var isBoolean = function (value) {
    return typeof value === 'boolean';
  };

  var isObject = function (value) {
    return value && typeof value === 'object';
  };

  var flatten = function (array) {
    return Array.prototype.concat.apply([], array);
  };

  var includes = function (list, element) {
    return Array.prototype.indexOf.call(list, element) > -1;
  };

  var scopify = function (walk, ast, topScope, options) {
    options = isObject(options) ? options : {};

    var charOffset = isNumber(options.charOffset) ? options.charOffset : 0;
    var blockScope = isBoolean(options.blockScope) ? options.blockScope : false;

    var getLevel = function (scope) {
      if (scope.level === undefined) {
        if (scope.prev) {
          scope.level = getLevel(scope.prev);
          if (blockScope || !scope.isBlock) {
            scope.level += 1;
          }
        } else {
          scope.level = 0;
        }
      }
      return scope.level;
    };

    var getEnclosingScope = function (nodes) {
      var enclosingScope;
      for (var i = nodes.length - 1; i >= 0; i -= 1) {
        var node = nodes[i];
        if (node.scope) {
          enclosingScope = node.scope;
          break;
        }
      }
      if (!enclosingScope) {
        enclosingScope = topScope;
      }
      return enclosingScope;
    };

    var dynamicallyBound = [
      'arguments',
      'this',
      'super',
      'new'
    ];
    var dynamicallyBinding = [
      'FunctionDeclaration',
      'FunctionExpression',
      'MethodDefinition'
    ];
    var getDefiningScope = function (scope, name) {
      var definingScope;
      for (;;) {
        var type;
        if (scope.originNode) {
          type = scope.originNode.type;
        }
        if (includes(Object.keys(scope.props), name) ||
            (includes(dynamicallyBound, name) &&
             includes(dynamicallyBinding, type))) {
          definingScope = scope;
          break;
        }
        if (scope.name === '<top>') {
          break;
        }
        scope = scope.prev;
        if (!scope) {
          scope = topScope;
        }
      }
      return definingScope;
    };

    // Scopes and the things inside them are recorded separately, because it
    // will be faster to color all the scopes and then all of their things.
    var scopes = [];
    var identifiers = [];

    var scopeHandler = function (node) {
      scopes.push([
        node.start + charOffset,
        node.end + charOffset,
        node.scope ? getLevel(node.scope) : getLevel(topScope)
      ]);
    };

    var identifierHandler = function (node, ancestors) {
      var level = 0;
      var enclosingScope = getEnclosingScope(ancestors);
      if (enclosingScope) {
        var name;
        if (node.type === 'ThisExpression') {
          name = 'this';
        } else if (node.type === 'Super') {
          name = 'super';
        } else {
          name = node.name;
        }
        var definingScope = getDefiningScope(enclosingScope, name);
        if (definingScope) {
          level = getLevel(definingScope);
        }
      }
      identifiers.push(
        node.start + charOffset,
        node.end + charOffset,
        level
      );
    };

    var importSpecifierHandler = function (node, ancestors) {
      identifierHandler(node.local, ancestors);
    };

    var metaPropertyHandler = function (node, ancestors) {
      if (node.meta.name === 'new') {
        identifierHandler(node.meta, ancestors);
      }
    };

    walk.ancestor(ast, {
      ArrowFunctionExpression: scopeHandler,
      BlockStatement: scopeHandler,
      CatchClause: scopeHandler,
      FunctionDeclaration: scopeHandler,
      FunctionExpression: scopeHandler,
      Identifier: identifierHandler,
      ImportDefaultSpecifier: importSpecifierHandler,
      ImportNamespaceSpecifier: importSpecifierHandler,
      MetaProperty: metaPropertyHandler,
      Program: scopeHandler,
      Super: identifierHandler,
      ThisExpression: identifierHandler,
      VariablePattern: identifierHandler
    });

    // Sort the scopes by their levels, since the inner scopes will be colored
    // on top of the outer scopes.
    scopes.sort(function (a, b) {
      return a[2] - b[2];
    });

    return [].concat(
      flatten(scopes),
      identifiers
    );
  };

  return scopify;

}));
