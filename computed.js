import { effect, track, trigger } from '.';

export function computed(getter) {
  let getterValue;
  let dirty = true;
  const effectFn = effect(getter, {
    lazy: true,
    scheduler: () => {
      dirty = true;
      // 如果computed的依赖发生变化，手动通知该computed的依赖者
      trigger(o, 'value');
    },
  });

  const o = {
    get value() {
      if (dirty) {
        getterValue = effectFn();
        dirty = false;
      }
      // 如果有人读了computed的值，手动收集它
      track(o, 'value');
      return getterValue;
    },
  };

  return o;
}
