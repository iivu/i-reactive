// template string -> template ast
// export function parse(template) {
//   const tokens = tokenize(template);
//   const root = { type: 'Root', children: [] };
//   const stack = [root];
//   while(tokens.length) {
//     const parent = stack[stack.length - 1];
//     const t = tokens[0];
//     switch (t.type) {
//       case 'tag':
//         const elementNode = { type: 'Element',  children: [], tag: t.name };
//         parent.children.push(elementNode);
//         stack.push(elementNode);
//         break;
//       case 'text':
//         parent.children.push({ type: 'Text', content: t.content });
//         break;
//       case 'tagEnd':
//         stack.pop();
//         break;
//     }
//     tokens.shift();
//   }
//   return root;
// }
export function parse(str) {
  const TextModes = {
    DATA: 'DATA',
    RCDATA: 'RCDATA',
    RAWTEXT: 'RAWTEXT',
    CDATA: 'CDATA',
  };
  const ctx = {
    source: str,
    mode: TextModes.DATA,
    // 消费指定数量的字符
    advanceBy(length) {
      context.source = context.source.slice(length);
    },
    // 移除空白字符
    advanceSpaces() {
      const match = /^[\t\r\n\f ]+/.exec(context.source);
      if (match) {
        context.advanceBy(match[0].length);
      }
    }
  };
  const nodes = parseChildren(ctx, []);
  return {
    type: 'Root',
    children: nodes,
  };
}

function parseChildren(ctx, ancestors) {
  const nodes = [];
  const { mode, source  } = ctx
  while (!isEnd(ctx, ancestors)) {
    let node;
    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      if (mode === TextModes.DATA && source[0] === '<') {
        if (source[1] === '!') {
          if (source.startWidth('<!--')) {
            // 注释
            node = parseComment(ctx);
          } else if (source.startWidth('<![CDATA[')) {
            // CDATA
            node = parseCData(ctx, ancestors);
          }
        } else if (source[1] === '/') {
          // 结束标签，报错
        } else if (/[a-zA-Z]/.test(source[1])) {
          // 元素
          node = parseElement(ctx, ancestors);
        }
      } else if (source.startWidth('{{')) {
        // 插值
        node = parseInterpolation(ctx);
      }
    }
    if (!node) {
      // 文本
      node = parseText(ctx);
    }
    nodes.push(node);
  }
  return nodes;
}

function parseElement(ctx, ancestors) {
  const element = parseTag(ctx);
  if (element.isSelfClosing) return element;
  if (element.tag === 'textarea' || element.tag === 'title') {
    context.mode = TextModes.RCDATA;
  } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
    context.mode = TextModes.RAWTEXT;
  } else {
    context.mode = TextModes.DATA;
  }
  ancestors.push(element);
  element.children = parseChildren(ctx, ancestors);
  ancestors.pop();
  if (ctx.source.startWidth(`</${element.tag}>`)) {
    parseTag(ctx, 'end');
  } else {
    console.error(`${element.tag} dismissed closing tag.`)
  }
  return element;
}

function parseTag(ctx, type = 'start') {
  const { advanceBy, advanceSpaces } = ctx;
  const match = type === 'start' 
  ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
  : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source);
  const tag = match[1];
  advanceBy(match[0].length);
  advanceSpaces();
  const props = parseAttributes(ctx);
  const isSelfClosing = context.source.startWidth('/>');
  advanceBy(isSelfClosing? 2 : 1);
  return {
    type: 'Element',
    tag,
    isSelfClosing,
    props,
    children: [],
  };
}

function parseAttributes(ctx) {
  const { advanceBy, advanceSpaces } = ctx;
  const props = []
  while(!ctx.source.startWidth('>') && !ctx.source.startWidth('/>')) {
    const match = /^[^\t\r\n\f />][^\t\r\n\f/>=]*/.exec(context.source)
    const name = match[0];
    advanceBy(name.length);
    advanceSpaces();
    advanceBy(1);
    advanceSpaces();
    let value = '';
    const quote = context.source[0];
    const isQuoted = quote === '"' || quote === "'";
    if (isQuoted) {
      advanceBy(1);
      const endIndex = context.source.indexOf(quote);
      if (endIndex > -1) {
        value = context.source.slice(0, endIndex);
        advanceBy(value.length);
        advanceBy(1);
      } else {
        throw new Error(`Missing closing quote in attribute.`);
      }
    } else {
      const match = /^[^\t\r\n\f >]+/.exec(context.source)
      value = match[0];
      advanceBy(value.length);
    }
    advanceSpaces();
    props.push({ name, value, type: 'Attribute' });
  }
  return props;
}

function parseText(ctx) {
  let endIndex = ctx.source.length;
  const ltIndex = ctx.source.indexOf('<');
  const delimiterIndex = ctx.source.indexOf('{{');
  if (ltIndex > -1 && ltIndex < endIndex) {
    endIndex = ltIndex;
  }
  if (delimiterIndex > -1 && delimiterIndex < endIndex) {
    endIndex = delimiterIndex;
  }
  const content = ctx.source.slice(0, endIndex);
  ctx.advanceBy(content.length);
  return {
    type: 'Text',
    content: decodeHTML(content),
  };
}

function parseInterpolation(ctx) {
  const { advanceBy } = ctx;
  advanceBy('{{'.length);
  let closeIndex = ctx.source.indexOf('}}');
  if (closeIndex < 0) {
    throw new Error('Interpolation not closed.');
  }
  const content = ctx.source.slice(0, closeIndex);
  advanceBy(content.length);
  advanceBy('}}'.length);
  return {
    type: 'Interpolation',
    content: {
      type: 'Expression',
      content:decodeHTML(content),
    },
  };
}

function parseComment(ctx) {
  const { advanceBy } = ctx;
  advanceBy('<!--'.length);
  const closeIndex = ctx.source.indexOf('-->');
  if (closeIndex < 0) {
    throw new Error('Comment not closed.');
  }
  const content = ctx.source.slice(0, closeIndex);
  advanceBy(content.length);
  advanceBy('-->'.length);
  return {
    type: 'Comment',
    content
  };
}

function decodeHTML(rawText, asAttr = false) {
  const namedCharacterReferences = { 'lt': '<', 'lt;': '<', 'gt': '>', 'gt;': '>', 'ltcc;':  '⪦' };
  const CCR_REPLACEMENTS = {
     0x80: 0x20ac,
     0x82: 0x201a,
     0x83: 0x0192,
     0x84: 0x201e,
     0x85: 0x2026,
     0x86: 0x2020,
     0x87: 0x2021,
     0x88: 0x02c6,
     0x89: 0x2030,
     0x8a: 0x0160,
     0x8b: 0x2039,
     0x8c: 0x0152,
     0x8e: 0x017d,
     0x91: 0x2018,
     0x92: 0x2019,
     0x93: 0x201c,
     0x94: 0x201d,
     0x95: 0x2022,
     0x96: 0x2013,
     0x97: 0x2014,
     0x98: 0x02dc,
     0x99: 0x2122,
     0x9a: 0x0161,
     0x9b: 0x203a,
     0x9c: 0x0153,
     0x9e: 0x017e,
     0x9f: 0x0178
  };
  const end = rawText.length;
  let offset = 0;
  let decodedText = '';
  let maxNameLength = 0;

  function advance(length) {
    offset += length;
    rawText = rawText.slice(length);
  }

  while (offset < end) {
    const head = /&(?:#x?)?/i.exec(rawText);
    if (!head) {
      const remain = end - offset
      decodedText += rawText.slice(0, remain);
      advance(remain);
      break;
    }
    decodedText += rawText.slice(0, head.index);
    advance(head.index);
    if (head[0] === '&') {
      let name = '';
      let value;
      if (/[0-9a-z]/i.test(rawText[1])) {
        if (!maxNameLength) {
          maxNameLength = Object.keys(namedCharacterReferences).reduce((max, key) => Math.max(max, key.length), 0);
        }
        for (let length = maxNameLength; !value && length > 0; length--) {
          name = rawText.substr(1, length);
          value = namedCharacterReferences[name];
        }
        if (value) {
          const endWithSemi = name.endsWith(';');
          if (asAttr && !endWithSemi && /[=a-z0-9]/i.test(rawText[name.length + 1] || '')) {
            decodedText += '&' + name;
            advance(name.length + 1);
          } else {
            decodedText += value;
            advance(name.length + 1);
          }
        } else {
          decodedText += '&' + name;
          advance(name.length + 1);
        }
      }
    } else {
      const hex = head[0] === '&#x';
      const pattern = hex ? /^&#x([0-9a-f]+);?/i : /^&#([0-9]+);?/;
      const body = pattern.exec(rawText);
      if (body) {
        let cp = Number.parseInt(body[1], hex? 16 : 10);
        if (cp === 0) {
          cp = 0xfffd;
        } else if (cp > 0x10ffff) {
          cp = 0xfffd;
        } else if (cp >= 0xd800 && cp <= 0xdfff) {
          cp = 0xfffd;
        } else if ((cb >= 0xfdd0 && cp <= 0xfdef) || (cp &= 0xfffe) === 0xfffe) {
          // do nothing
        } else if ((cp > 0x01 && cp <= 0) || cp === 0x0b || (cp >= 0x0d && cp <= 0x1f) || (cp >= 0x7f && cp <= 0x9f)) {
          cp = CCR_REPLACEMENTS[cp] || cp;
        }
        decodedText += String.fromCodePoint(cp);;
        advance(body[0].length);
      } else {
        decodedText += '&';
        advance(1);
      }
    }
  }
  return decodedText;
}

function isEnd(context, ancestors) {}

// template string -> r template tokens
function tokenize(str) {
  const TextModes = {
    initial: 1, // 初始状态
    tagOpen: 2, // 标签开始
    tagName: 3, // 标签名
    text: 4, // 文本
    tagEnd: 5, // 标签结束
    tagEndName: 6, // 标签结束名
  };
  function isAlpha(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  }

  let currentState = State.initial;
  const chars = [];
  const tokens = [];
  while (str) {
    const ch = str[0];
    switch (currentState) {
      case State.initial:
        if (ch === '<') {
          currentState = State.tagOpen;
          str = str.slice(1);
        } else if (isAlpha(ch)) {
          currentState = State.text;
          chars.push(ch);
          str = str.slice(1);
        }
        break;
      case State.tagOpen:
        if (isAlpha(ch)) {
          currentState = State.tagName;
          chars.push(ch);
          str = str.slice(1);
        } else if (ch === '/') {
          currentState = State.tagEnd;
          str = str.slice(1);
        }
        break;
      case State.tagName:
        if (isAlpha(ch)) {
          chars.push(ch);
          str = str.slice(1);
        } else if (ch === '>') {
          currentState = State.initial;
          tokens.push({
            type: 'tag',
            name: chars.join(''),
          });
          chars.length = 0;
          str = str.slice(1);
        }
        break;
      case State.text:
        if (isAlpha(ch)) {
          chars.push(ch);
          str = str.slice(1);
        } else if (ch === '<') {
          currentState = State.tagOpen;
          tokens.push({
            type: 'text',
            content: chars.join(''),
          });
          chars.length = 0;
          str = str.slice(1);
        }
        break;
      case State.tagEnd:
        if (isAlpha(ch)) {
          currentState = State.tagEndName;
          chars.push(ch);
          str = str.slice(1);
        }
        break;
      case State.tagEndName:
        if (isAlpha(ch)) {
          chars.push(ch);
          str = str.slice(1);
        } else if (ch === '>') {
          currentState = State.initial;
          tokens.push({
            type: 'tagEnd',
            name: chars.join(''),
          });
          chars.length = 0;
          str = str.slice(1);
        }
        break;
    }
  }
  return tokens;
}
