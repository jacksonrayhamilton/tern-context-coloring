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

  var contains = function (list, element) {
    return Array.prototype.indexOf.call(list, element) > -1;
  };

  var scopify = function (walk, ast, topScope, options) {
    options = isObject(options) ? options : {};

    var charOffset = isNumber(options.charOffset) ? options.charOffset : 0;
    var blockScope = isBoolean(options.blockScope) ? options.blockScope : false;
    var inferModules = isBoolean(options.inferModules) ? options.inferModules : true;
    var inferNode = isBoolean(options.inferNode) ? options.inferNode : true;

    var initialLevel = 0;

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
        var scope;
        if (node.type === 'TryStatement' && node.handler) {
          // CatchClause is not walked directly and thus will not appear in the
          // provided nodes array.
          scope = node.handler.scope;
        } else {
          scope = node.scope;
        }
        if (scope) {
          enclosingScope = scope;
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
      'this'
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
        if ((contains(Object.keys(scope.props), name) &&
             // Acorn (I believe incorrectly) includes `arguments` in arrow
             // function props.
             (name !== 'arguments' || type !== 'ArrowFunctionExpression')) ||
            (contains(dynamicallyBound, name) &&
             contains(dynamicallyBinding, type))) {
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
    var tokens = [];

    var scopeHandler = function (node) {
      scopes.push([
        node.start + charOffset,
        node.end + charOffset,
        node.scope ? getLevel(node.scope) : initialLevel
      ]);
    };

    var identifierHandler = function (node, ancestors) {
      var level = 0;
      var enclosingScope = getEnclosingScope(ancestors);
      if (enclosingScope) {
        var name;
        if (node.type === 'ThisExpression') {
          name = 'this';
        } else {
          name = node.name;
        }
        var definingScope = getDefiningScope(enclosingScope, name);
        if (definingScope) {
          level = getLevel(definingScope);
        }
      }
      tokens.push(
        node.start + charOffset,
        node.end + charOffset,
        level
      );
    };

    var tryStatementHandler = function (node) {
      if (node.handler) {
        scopeHandler(node.handler);
      }
    };

    var importSpecifierHandler = function (node, ancestors) {
      identifierHandler(node.local, ancestors);
    };

    if (initialLevel !== 1 && inferModules) {
      // Infer if module scope should be used.
      var moduleHandler = function () {
        initialLevel = 1;
      };
      walk.ancestor(ast, {
        ImportDeclaration: moduleHandler,
        ExportAllDeclaration: moduleHandler,
        ExportDefaultDeclaration: moduleHandler,
        ExportNamedDeclaration: moduleHandler
      });
    }

    if (initialLevel !== 1 && inferNode) {
      // Infer if Node module scope should be used.  First check for shell
      // scripts, which are a pretty sure giveaway.
      var nodeShebangPattern = /^#!.*?\/bin\/env node/;
      if (nodeShebangPattern.test(ast.sourceFile.text)) {
        initialLevel = 1;
      }
    }

    if (initialLevel !== 1 && inferNode) {
      // Try and locate Node free variables in use at the top-level. (Anywhere
      // other than the top level could be a false positive, e.g. a UMD should
      // not trick the heuristic.)
      var isInBlock = function (nodes) {
        for (var i = nodes.length - 1; i >= 0; i -= 1) {
          var node = nodes[i];
          if (node.type === 'BlockStatement') {
            return true;
          }
        }
        return false;
      };
      var isTopLevelFree = function (ancestors, name) {
        return (
          !isInBlock(ancestors) &&
          getDefiningScope(getEnclosingScope(ancestors), name) === undefined
        );
      };
      var nodeCallExpressionHandler = function (node, ancestors) {
        var callee = node.callee.name;
        if (callee === 'require' && isTopLevelFree(ancestors, callee)) {
          initialLevel = 1;
        }
      };
      var nodeMemberExpressionHandler = function (node, ancestors) {
        var object = node.object.name;
        var property = node.property.name;
        if ((object === 'exports' ||
             (object === 'module' && property === 'exports')) &&
            isTopLevelFree(ancestors, object)) {
          initialLevel = 1;
        }
      };
      walk.ancestor(ast, {
        CallExpression: nodeCallExpressionHandler,
        MemberExpression: nodeMemberExpressionHandler
      });
    }

    topScope.level = initialLevel;

    walk.ancestor(ast, {
      ArrowFunctionExpression: scopeHandler,
      BlockStatement: scopeHandler,
      FunctionDeclaration: scopeHandler,
      FunctionExpression: scopeHandler,
      Identifier: identifierHandler,
      ImportDefaultSpecifier: importSpecifierHandler,
      ImportNamespaceSpecifier: importSpecifierHandler,
      Program: scopeHandler,
      ThisExpression: identifierHandler,
      TryStatement: tryStatementHandler,
      VariablePattern: identifierHandler
    });

    // Sort the scopes by their levels, since the inner scopes will be colored
    // on top of the outer scopes.
    scopes.sort(function (a, b) {
      return a[2] - b[2];
    });

    return [].concat(
      flatten(scopes),
      tokens
    );
  };

  return scopify;

}));
