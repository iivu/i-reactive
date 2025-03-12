import { currentInstance } from './createRenderer';

export const KeepAlive = {
  __isKeepAlive: true,
  props: {
    include: RegExp,
    exclude: RegExp,
  },
  setup(props, { slots }) {
    // vnode.type -> vnode
    const cache = new Map();
    const instance = currentInstance;
    // 由渲染器注入，move能够移动DOM到另外一个容器中
    const { move, createElement } = instance;
    const storageContainer = createElement('div');
    instance._deActivate = vnode => {
      move(vnode, storageContainer);
    };
    instance._activate = (vnode, container, anchor) => {
      move(vnode, container, anchor);
    };
    return () => {
      let rawNode = slots.default();
      if (typeof rawNode.type !== 'object') {
        return rawNode;
      }
      const name = rawNode.type.name;
      if (name && (props.include && !props.include.test(name) || props.exclude && props.exclude.test(name))) {
        return rawNode;
      }
      const cachedVNode = cache.get(rawNode.type);
      if (cachedVNode) {
        rawNode.component = cachedVNode.component;
        rawNode.keptAlive = true;
      } else {
        cache.set(rawNode.type, rawNode);
      }
      rawNode.shouldKeepAlive = true;
      rawNode.keepAliveInstance = instance;
      return rawNode;
    };
  },
};
