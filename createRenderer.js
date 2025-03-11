import { reactive, effect, shallowReactive, shallowReadonly } from './'

const Text = Symbol();
const Comment = Symbol();
const Fragment = Symbol();
let currentInstance = null;

function setCurrentInstance(instance) {
  currentInstance = instance;
}

export function createRenderer({
  createElement,
  setElementText,
  insert,
  patchProps,
  createText,
  setText,
}) {
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
    } else if (typeof type === 'object' || typeof type === 'function') {
      // 组件
      if (!n1) {
        mountComponent(n2, container, anchor);
      } else {
        patchComponent(n1, n2, anchor);
      }
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
    if (vnode.type === Fragment) {
      vnode.children.forEach(c => unmount(c));
      return;
    } else if (typeof vnode.type === 'object') {
      unmount(vnode.component.subTree);
      return;
    }
    const p = vnode.el.parentNode;
    if (p) {
      p.removeChild(vnode.el);
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

  function mountComponent(vnode, container, anchor) {
    let componentOptions = vnode.type;
    const isFunctional = typeof vnode.type === 'function';
    if (isFunctional) {
      componentOptions = {
        render: vnode.type,
        props: vnode.type.props,
      }
    }
    const { render, data, props: propsOption, beforeCreate, created, beforeMount, mounted, beforeUpdate, updated, setup }  = componentOptions;
    beforeCreate?.();
    const state = reactive(data());
    const [props, attrs] = resolveProps(propsOption, vnode.props);
    const slots = vnode.children || null;
    const instance = {
      state,
      props: shallowReactive(props),
      isMounted: false,
      subTree: null,
      slots,
      mounted: []
    };
    const emit = (event, ...payload) => {
      const evenName = `on${event[0].toUpperCase()}${event.slice(1)}`;
      const handler = instance.props[evenName];
      handler?.(...payload);
    }
    const setupContext = { attrs, emit, slots };
    setCurrentInstance(instance);
    const setupResult = setup?.(shallowReadonly(props), setupContext);
    setCurrentInstance(null);
    let setupState = null;
    if (typeof setupResult === 'function') {
      if (render) console.error('render and setup cannot exist at the same time.');
      render = setupResult;
    } else {
      setupState = setupResult;
    }
    vnode.component = instance;
    // 创建渲染上下文
    const renderContext = new Proxy(instance, {
      get(t, k, r) {
        const { state, props } = t;
        if (k === '$slot') {
          return slots;
        } else if (state && k in state) {
          return state[k];
        } else if (props && k in props) {
          return props[k];
        } else if (setupState && k in setupState) {
          return setupState[k];
        } else {
          console.warn(`${k} is not exist in state or props`);
        }
      },
      set(t, k, v, r) {
        const { state, props } = t;
        if (state && k in state) {
          state[k] = v;
        } else if (setupState && k in setupState) {
          setupState[k] = v;
        } else if (props && k in props) {
          console.warn(`Attempting to mutate prop "${k}". Props is readonly.`);
        } else {
          console.warn(`${k} is not exist in state or props`);
        }
      }
    });
    created?.call(renderContext);
    effect(() => {
      const subTree = render.call(instance, state);
      if (!instance.isMounted) {
        beforeMount?.call(renderContext);
        patch(null, subTree, container, anchor);
        instance.isMounted = true;
        mounted?.call(renderContext);
        instance.mounted?.forEach(f => f.call(renderContext));
      } else {
        beforeUpdate?.call(renderContext);
        patch(instance.subTree, subTree, container, anchor)
        updated?.call(renderContext);
      }
      instance.subTree = subTree;
    })
  }

  function patchComponent(n1, n2, anchor) {
    const instance = (n2.component = n1.component);
    const { props } = instance;
    if (hasPropsChanged(n1.props, n2.props)) {
      const [ nextProps ] = resolveProps(n2.type.props, n2.props);
      for (const k in nextProps) {
        props[k] = nextProps[k];
      }
      for (const k in props) {
        if (!(k in nextProps)) {
          delete props[k];
        }
      }
    }
  }

  function resolveProps(options, propsData) {
    const props = {};
    const attrs = {};
    for (const key in propsData) {
      if (key in options || key.startsWith('on')) {
        props[key] = propsData[key];
      } else {
        attrs[key] = propsData[key];
      }
    }
    return [props, attrs];
  }

  function hasPropsChanged(prevProps, nextProps) {
    const nextKeys = Object.keys(nextProps);
    if (nextKeys.length !== Object.keys(prevProps).length) return true;
    for (let i = 0; i < nextKeys.length; i++) {
      const key = nextKeys[i];
      if (prevProps[key] !== nextProps[key]) return true;
    }
    return false;
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
        // patchKeyedChildren1(n1, n2, container);
        // patchKeyedChildren2(n1, n2, container);
        patchKeyedChildren3(n1, n2, container);
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

  // 简单的diff
  function patchKeyedChildren1(n1, n2, container) {
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
  }

  // 双端diff
  function patchKeyedChildren2(n1, n2, container) {
    const oldChildren = n1.children;
    const newChildren = n2.children;
    let oldStartIdx = 0;
    let oldEndIdx = oldChildren.length - 1;
    let newStartIdx = 0;
    let newEndIdx = newChildren.length - 1;
    let oldStartVNode = oldChildren[oldStartIdx];
    let oldEndVNode = oldChildren[oldEndIdx];
    let newStartVNode = newChildren[newStartIdx];
    let newEndVNode = newChildren[newEndIdx];
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (!oldStartVNode) {
        oldStartVNode = oldChildren[++oldStartIdx];
      } else if (!oldEndVNode) {
        oldEndVNode = oldChildren[--oldEndIdx];
      } else if (oldStartVNode.key === newStartVNode.key) {
        patch(oldStartVNode, newStartVNode, container);
        oldStartVNode = oldChildren[++oldStartIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else if (oldEndVNode.key === newEndVNode.key) {
        patch(oldEndVNode, newEndVNode, container);
        oldEndVNode = oldChildren[--oldEndIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldStartVNode.key === newEndVNode.key) {
        patch(oldStartVNode, newEndVNode, container);
        insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling);
        oldStartVNode = oldChildren[++oldStartIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldEndVNode.key === newStartVNode.key) {
        // 更新
        patch(oldEndVNode, newStartVNode, container);
        // 移动
        insert(oldEndVNode.el, container, oldStartVNode.value);
        oldEndVNode = oldChildren[--oldEndIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else {
        // 前面4个步骤都无法找到复用节点
        const idxInOld = oldChildren.findIndex(
          node => node.key === newStartVNode.key
        );
        if (idxInOld > 0) {
          const vnodeToMove = oldChildren[idxInOld];
          patch(vnodeToMove, newStartVNode, container);
          insert(vnodeToMove.el, container, oldStartVNode.el);
          oldChildren[idxInOld] = undefined;
        } else {
          patch(null, newEndVNode, container, oldStartVNode.el);
        }
        // 最后更新 newStartIdx 到下一个位置
        newStartVNode = newChildren[++newStartIdx];
      }
    }
    // 处理新增节点
    if (oldEndIdx < oldStartIdx && newStartIdx <= newEndIdx) {
      for (let i = newStartIdx; i <= newEndIdx; i++) {
        patch(null, newChildren[i], container, oldStartVNode.el);
      }
    } else if (newEndIdx > newStartIdx && oldStartIdx <= oldEndIdx) {
      for (let i = oldStartIdx; i <= oldEndIdx; i++) {
        unmount(oldChildren[i]);
      }
    }
  }

  // 快速diff
  function patchKeyedChildren3(n1, n2, container) {
    const newChildren = n2.children;
    const oldChildren = n1.children;
    // 处理相同的前置节点
    let j = 0,
      oldVNode = oldChildren[j],
      newVNode = newChildren[j];
    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container);
      j++;
      oldVNode = oldChildren[j];
      newVNode = newChildren[j];
    }
    // 处理相同的后置节点
    let oldEndIdx = oldChildren.length - 1;
    let newEndIdx = newChildren.length - 1;
    oldVNode = oldChildren[oldEndIdx];
    newVNode = newChildren[newEndIdx];
    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container);
      oldEndIdx--;
      newEndIdx--;
      oldVNode = oldChildren[oldEndIdx];
      newVNode = newChildren[newEndIdx];
    }
    if (j > oldEndIdx && j <= newEndIdx) {
      // 新子节点有新元素需要挂载
      const anchorIndex = newEndIdx + 1;
      const anchor =
        anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null;
      while (j <= newEndIdx) {
        patch(null, newChildren[j++], container, anchor);
      }
    } else if (j > newEndIdx && j <= oldEndIdx) {
      // 旧子节点有旧元素需要被卸载
      while (j <= oldEndIdx) {
        unmount(oldChildren[j++]);
      }
    } else {
      // 新旧两组子节点均有剩余未处理元素
      // 构造source数组，长度等于新子元素中未处理元素的数量，初始值都是-1
      const source = new Array(newEndIdx - j + 1).fill(-1);
      const oldStart = (newStart = j);
      const count = newEndIdx - j + 1; // 新子节点剩余需要处理的数量
      // 寻找新节点在旧节点中位置，并记录到source中
      // 索引表：新子节点的key -> 新子节点的index
      const newKeyIndex = {};
      let moved = false; // 是否需要移动
      let pos = 0; // 遍历过程中的最大索引，用来判断是否需要移动
      let patched = 0; // 已更新的节点数量
      for (let i = newStart; i <= newEndIdx; i++) {
        newKeyIndex[newChildren[i].key] = i;
      }
      for (let i = oldStart; i <= oldEndIdx; i++) {
        const oldVNode = oldChildren[i];
        if (patched <= count) {
          const k = newKeyIndex[oldChildren.key];
          if (typeof k !== undefined) {
            const newVNode = newChildren[k];
            patch(oldVNode, newVNode, container);
            patched++;
            source[k - newStart] = i;
            if (k < pos) {
              moved = true;
            } else {
              pos = k;
            }
          } else {
            unmount(oldVNode);
          }
        } else {
          unmount(oldVNode);
        }
      }
      if (moved) {
        // 需要移动
        // 最长递增子序列，意味着这里面的新节点都不需要移动
        const seq = lis(source);
        let s = seq.length - 1;
        let i = count - 1;
        for (i; i >= 0; i--) {
          if (source[i] === -1) {
            // 需要挂载新节点
            const pos = i + newStart;
            const newVNode = newChildren[pos];
            const nextPos = pos + 1;
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
            patch(null, newVNode, container, anchor);
          } else if (i !== seq[s]) {
            // 当前节点需要移动
            const pos = i + newStart;
            const newVNode = newChildren[pos];
            const nextPos = pos + 1;
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
            insert(newVNode.el, container, anchor);
          } else {
            // 当前节点不需要移动
            s--;
          }
        }
      }
    }
  }

  function onMounted(fn) {
    if (currentInstance) {
      currentInstance.mounted.push(fn);
    } else {
      console.warn('onMounted can only use in setup function');
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

function lis(source) {
  // TODO: 最长递增子序列
}