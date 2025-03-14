// template ast -> javascript ast
export function transform(ast) {
  const context = {
    currentNode: null,
    parent: null,
    childIndex: 0,
    nodeTransforms: [
      transformText,
      transformElement,
      transformRoot,
    ],
    replaceNode(node) {
      context.parent.children[context.childIndex] = node;
      context.currentNode = node;
    },
    removeNode() {
      if (context.parent) {
        context.parent.children.splice(context.childIndex, 1);
        context.currentNode = null;
      }
    },
  };
  traverseNode(ast, context);
  dump(ast);
}

function transformText(node) {
  if (node.type !== 'text') return;
  node.jsNode = createStringLiteral(node.content);
}

function transformElement(node) {
  return () => {
    if (node.type !== 'element') return;
    const callExp = createCallExpression('h', [createStringLiteral(node.tag)]);
    node.children.length === 1 ? callExp.arguments.push(node.children[0].jsNode) : callExp.arguments.push(createArrayExpression(node.children.map(child => child.jsNode)));
    node.jsNode = callExp;
  };
}

function transformRoot(node)  {
  return () => {
    if (node.type !== 'Root') return;
    const jsAst = node.children[0].jsNode;
    node.jsNode = {
      type: 'FunctionDecl',
      id: createIdentifier('render'),
      params: [],
      body: [
        { type: 'ReturnStatement', return: jsAst }
      ]
    }
  }
}

function createStringLiteral(value) {
  return { type: 'StringLiteral', value };
}

function createIdentifier(name) {
  return { type: 'Identifier', name };
}

function createArrayExpression(elements) {
  return { type: 'ArrayExpression', elements };
}

function createCallExpression(callee, args) {
  return {
    type: 'CallExpression',
    callee: createIdentifier(callee),
    arguments: args,
  };
}

function traverseNode(ast, context) {
  const currentNode = ast;
  const children = currentNode.children;
  const transformFns = context.nodeTransforms;
  const exitFns = [];
  context.currentNode = currentNode;
  for (let i = 0; i < transformFns.length; i++) {
    const exit = transformFns[i](currentNode, context);
    if (exit) exitFns.push(exit);
    if (!context.currentNode) return;
  }
  if (children) {
    children.forEach((child, index) => {
      context.parent = currentNode;
      context.childIndex = index;
      traverseNode(child, context);
    });
  }
  let i = exitFns.length;
  while (i--) {
    exitFns[i]();
  }
}

function dump(node, intent = 0) {
  const type = node.type;
  const desc =
    type === 'Root' ? '' : type === 'Element' ? node.tag : node.content;
  console.log(`${'-'.repeat(intent)}${type}: ${desc}`);
  if (node.children) {
    node.children.forEach(child => dump(child, intent + 2));
  }
}
