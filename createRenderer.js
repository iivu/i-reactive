export function createRenderer({
  createElement,
  setElementText,
  insert,
  patchProps,
  createText,
  setText,
}) {
  const Text = Symbol();
  const Comment = Symbol();
  const Fragment = Symbol();
  /**
   * @param {vnode} n1 旧vnode
   * @param {vnode} n2 新vnode
   * @param {HTMLElement} container 挂载点
   */
  function patch(n1, n2, container, anchor) {
    if (n1 && n1.type !== n2.type) {
      // 两个vnode类型不同，就不存在更新的操作，直接卸载掉n1，挂载n2
      unmount(n1);
      n1 = null;
    }
    // 到这里，n1和n2描述的都是相同元素
    const type = n2.type;
    if (typeof type === 'string') {
      // 普通的标签元素
      if (!n1) {
        // 旧的vnode不存在，说明是挂载
        mountElement(n2, container, anchor);
      } else {
        // 更新
        patchElement(n1, n2);
      }
    } else if (typeof type === 'object') {
      // 组件
    } else if (type === Text) {
      // 文本节点
      if (!n1) {
        const el = (n2.el = createText(n2.children));
        insert(el, container);
      } else {
        const el = (n2.el = n1.el);
        if (n2.children !== n1.children) {
          setText(el, n2.children);
        }
      }
    } else if (type === Fragment) {
      if (!n1) {
        n2.children.forEach(c => patch(null, c, container));
      } else {
        patchChildren(n1, n2, container);
      }
    }
  }

  function render(vnode, container) {
    if (vnode) {
      // 如果存在vnode，说明是挂载或更新
      patch(container._vnode, vnode, container);
    } else {
      // 如果不存在vnode，且存在旧的vnode，说明是卸载
      if (container._vnode) {
        unmount(container._vnode);
      }
    }
    container._vnode = vnode;
  }

  function unmount(vnode) {
    const p = vnode.el.parentNode;
    if (vnode.type === Fragment) {
      vnode.children.forEach(c => unmount(c));
      return;
    }
    if (p) {
      p.removeChild(el);
    }
  }

  function mountElement(vnode, container, anchor) {
    const el = (vnode.el = createElement(vnode.tag));
    if (typeof vnode.children === 'string') {
      // 如果子节点是字符串，则设置元素的textContent
      setElementText(el, vnode.children);
    }
    if (Array.isArray(vnode.children)) {
      // 如果子节点是数组，则循环调用patch挂载它
      vnode.children.forEach(c => patch(null, c, el));
    }
    // 处理props
    if (vnode.props) {
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key]);
      }
    }
    insert(el, container, anchor);
  }

  function patchElement(n1, n2) {
    const el = (n2.el = n1.el);
    const oldProps = n1.props;
    const newProps = n2.props;
    // 更新props
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null);
      }
    }
    // 更新children
    patchChildren(n1, n2, el);
  }

  function patchChildren(n1, n2, container) {
    if (typeof n2.children === 'string') {
      // 当新子节点是文本节点时
      if (Array.isArray(n1.children)) {
        n1.children.forEach(c => unmount(c));
      }
      setElementText(container, n2.children);
    } else if (Array.isArray(n2.children)) {
      // 如果新子节点是一组子节点
      if (Array.isArray(n1.children)) {
        // 如果旧子节点也是一组子节点，就需要diff
        const oldChildren = n1.children;
        const newChildren = n2.children;
        // 上一次key相同的旧节点的index
        let lastIndex = 0;
        for (let i = 0; i < newChildren.length; i++) {
          const newNode = newChildren[i];
          let find = false; // 是否找到了key相同的旧节点
          for (let j = 0; j < oldChildren.length; j++) {
            const oldNode = oldChildren[j];
            if (newNode.key === oldNode.key) {
              // 找到了两个key相同的节点，说明可以复用，调用patch函数更新
              find = true;
              patch(oldNode, newNode, container);
              if (j < lastIndex) {
                // 说明这个节点需要移动
                const prevVNode = newChildren[i - 1];
                if (prevVNode) {
                  const anchor = prevVNode.el.nextSibling;
                  insert(newNode.el, container, anchor);
                }
              } else {
                lastIndex = j;
              }
              break;
            }
          }
          if (!find) {
            // 没有找到key相同的旧节点，那么就需要挂载
            const prevVNode = newChildren[i - 1];
            let anchor = null;
            if (prevVNode) {
              anchor = prevVNode.el.nextSibling;
            } else {
              anchor = container.firstChild;
            }
            patch(null, newChildren, container, anchor);
          }
        }
        // 上一步的更新操作完成后，再遍历一遍旧的子节点，目的是找到需要卸载的旧节点
        for (let i = 0; i < oldChildren.length; i++) {
          const oldVNode = oldChildren[i];
          const has = newChildren.find(vnode => vnode.key === oldVNode.key);
          if (!has) unmount(oldVNode);
        }
      } else {
        // 否则清空容器，循环挂载子节点
        setElementText(container, '');
        n2.children.forEach(c => patch(null, c, container));
      }
    } else {
      // 新节点没有子节点
      if (Array.isArray(n1.children)) {
        n1.children.forEach(c => unmount(c));
      } else {
        setElementText(container, '');
      }
    }
  }

  return { patch, render };
}
// 创建一个专属于web平台的渲染器
export const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag);
  },
  setElementText(el, text) {
    el.textContent = text;
  },
  createText(text) {
    return document.createTextNode(text);
  },
  setText(el, text) {
    el.nodeValue = text;
  },
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor);
  },
  patchProps(el, key, preValue, nextValue) {
    // 是否作为DOMProperties设置元素属性 -> dom[key] = value
    // 否则使用setAttribute设置 -> dom.setAttribute(key, value)
    function shouldSetAsProps(el, key) {
      // <input/> 标签的 form属性是只读的，只能使用setAttribute设置
      // 其他还有很多特例需要特殊处理，这里只是其中一个特例
      if (key === 'form' && el.tagName === 'INPUT') return false;
      return key in el;
    }
    if (/^on/.test(key)) {
      // 事件处理器
      // 获取元素上的所有事件统一处理器，Record<string, Function>;
      const invokers = el._vei || (el._vei = {});
      const eventName = key.splice(2).toLowerCase();
      // 得到了某个事件统一处理器
      let invoker = invokers[key];
      if (nextValue) {
        if (!invoker) {
          invoker = el._vei[key] = e => {
            // 如果事件发生的时间小于处理器绑定的时间，则跳过这次执行
            // 因为有可能这个事件处理器是因为某个事件新绑定上的
            if (e.timeStamp < invoker.attached) return;
            // 在统一的事件处理器中，去调用真正的事件处理器（挂在invoker.value上）
            // 由于同一个事件可以注册多个事件处理器（表现为一个数组），因此需要分开判断
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e));
            } else {
              invoker.value(e);
            }
          };
          invoker.value = nextValue;
          // 事件发生时，调用的是统一的事件处理器
          el.addEventListener(eventName, invoker);
          // 记录下绑定时间
          invoker.attached = performance.now();
        } else {
          // 将具体的事件处理器放在invoker.value上
          invoker.value = nextValue;
        }
      } else if (invoker) {
        el.removeEventListener(eventName, invoker);
      }
    } else if (key === 'class') {
      // 对class的设置特殊处理，因为 el.className=value 是性能最好的
      el.className = nextValue || '';
    } else if (shouldSetAsProps(el, key)) {
      const type = typeof el[key];
      if (type === 'boolean' && nextValue === '') {
        // 处理 <button disabled/> 这种情况，这个时候的props -> { disabled: '' }
        el[key] = true;
      } else {
        el[key] = nextValue;
      }
    } else {
      el.setAttribute(key, nextValue);
    }
  },
});
