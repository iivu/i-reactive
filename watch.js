import { effect, track, trigger } from '.';

export function watch(sources, callback) {
  let getter;
  if (typeof sources === 'function') {
    getter = sources;
  } else {
    getter = () => traverse(target);
  }
  let oldValue, newValue;
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      newValue = effectFn();
      callback(newValue, oldValue);
      oldValue = newValue;
    },
  });
  oldValue = effectFn();
}

function traverse(target, seen = new Set()) {
  if (typeof target !== 'object' || target === null || seen.has(target)) return;
  seen.add(target);
  for (const key in target) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      traverse(target[key], seen);
    }
  }
}
