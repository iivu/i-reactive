export function createRenderer(options) {
  /**
   * @param {vnode} n1 旧vnode
   * @param {vnode} n2 新vnode
   * @param {HTMLElement} container 挂载点
   */
  function patch(n1, n2, container) {
    if (!n1) {
      // 旧的vnode不存在，说明是挂载
      mountElement(n2, container);
    } else {
      // 更新
    }
  }

  function render(vnode, container) {
    if (vnode) {
      // 如果存在vnode，说明是挂载或更新
      patch(container._vnode, vnode, container);
    } else {
      // 如果不存在vnode，且存在旧的vnode，说明是卸载
      if (container._vnode) {
        container.innerHTML = '';
      }
    }
    container._vnode = vnode;
  }

  function mountElement(vnode, container) {
    const { createElement, setElementText, insert } = options;
    const el = createElement(vnode.tag);
    if (typeof vnode.children === 'string') {
      setElementText(el, vnode.children);
    }
    insert(el, container);
  }

  return { patch, render };
}

// 创建一个专属于web平台的渲染器
const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag);
  },
  setElementText(el, text) {
    el.textContent = text;
  },
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor);
  },
});

