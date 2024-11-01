import { effect, track, trigger } from '.';

export function watch(sources, callback, options = {}) {
  let getter;
  if (typeof sources === 'function') {
    getter = sources;
  } else {
    getter = () => traverse(target);
  }
  let oldValue, newValue;
  let cleanup;
  function onInvalidate(fn) {
    cleanup = fn;
  }
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      if (options.flush === 'post') {
        Promise.resolve().then(job);
      } else {
        job();
      }
    },
  });
  function job() {
    newValue = effectFn();
    if (cleanup) {
      cleanup();
    }
    callback(newValue, oldValue, onInvalidate);
    oldValue = newValue;
  }
  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }
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
