import { reactive } from '.';

function markRef(refObj) {
  Object.defineProperty(refObj, '__v_isRef', { value: true });
}

export function ref(value) {
  const wrapper = { value };
  markRef(wrapper);
  return reactive(wrapper);
}

export function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key];
    },
    set value(val) {
      obj[key] = val;
    },
  };
  markRef(wrapper);
  return wrapper;
}

export function toRefs(obj) {
  const res = {};
  for (const key in obj) {
    res[key] = toRef(obj, key);
  }
  return res;
}

export function proxyRefs(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      return value.__v_isRef ? value.value : value;
    },
    set(target, key, newValue, receiver) {
      const value = target[key];
      if (value.__v_isRef) {
        value.value = newValue;
        return true;
      }
      return Reflect.set(target, key, newValue, receiver);
    },
  });
}
