const TriggerType = {
  SET: 'SET', ADD: 'ADD', DELETE: 'DELETE',
}
// reactive缓存
const reactiveMap = new Map()
const ITERATE_KEY = Symbol(0)
// 副作用函数桶，保存所有副作用函数
// target -> Map<key, Set<fn>>
const bucket = new WeakMap()
// 副作用栈，处理多个effect嵌套执行的情况
const effectStack = []
// 待执行的effectFn集合
const jobs = new Set()
// 全局变量，用来保存当前正在执行的副作用函数
let activeEffect = undefined
let p = Promise.resolve()

// 重写数组方法
// 解决数组相关查找方法在代理后产生的各种问题
const arrayInstrumentations = {};
;['includes', 'indexOf', 'lastIndexOf'].forEach(m => {
  const originM = Array.prototype[m];
  arrayInstrumentations[m] = function (...args)  {
    // 这里的this的代理对象
    let res = originM.apply(this, args);
    if (res === false || res === -1) {
      res = originM.apply(this.raw, args);
    }
    return res;
  }
})
// 解决隐式修改数组长度的原型方法，避免无必要的依赖收集
// 这些方法内部隐式都会读取length，使得副作用与length产生关联
// 但其实是没有必要的，因为这些方法语义上都是修改数组，而非读取，无需产生关联
let shouldTrack = true;
;['push', 'pop', 'shift','unshift','splice'].forEach(m => {
  const originM = Array.prototype[m];
  arrayInstrumentations[m] = function (...args) {
    shouldTrack = false;
    let res = originM.apply(this, args);
    shouldTrack = true;
    return res;
  }
})

// effect负责设置副作用函数并调用它
export function effect(fn, options = {}) {
  const effectFn = () => {
    // 每次运行effectFn都先清除自身所有的依赖，避免因分支切换引起依赖残留
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  // 搜集与该effectFn相关的依赖集合
  effectFn.deps = []
  effectFn.options = options
  if (options.lazy) {
    return effectFn
  }
  effectFn()
}

// 清除依赖
function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps; i++) {
    const deps = effectFn.deps[i]
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

// 清空jobs
let isFlushing = false

function flushJobs() {
  if (isFlushing) return
  isFlushing = true
  p.then(() => jobs.forEach(job => job())).finally(() => {
    jobs.clear()
    isFlushing = false
  })
}

// 跟踪变化
export function track(target, key) {
  if (!activeEffect || !shouldTrack) return
  // 取得当前响应式数据所有副作用函数的map: target -> Map<key, Set<fn>>
  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }
  // 取得当前key的副作用函数集合: key -> Set<fn>
  let deps = depsMap.get(key)
  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }
  // 建立联系: target -> key -> effectFn
  deps.add(activeEffect)
  // 记录依赖集合
  activeEffect.deps.push(deps)
}

// 变化后触发副作用
export function trigger(target, key, type, newValue) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  // 新开一个set，避免原set边遍历边添加导致的无限循环
  const effectFnsToRun = new Set()
  depsMap.get(key)?.forEach(effectsFn => {
    if (effectsFn !== activeEffect) {
      /**
       * 当在一个effectFn中既触发了搜集又触发了变更，就会导致无限循环，内存溢出:
       * effect(() => proxy.foo++)
       * 因此如果当前正在搜集的activeEffect与需要执行effectsFn相同，则跳过当次的执行
       */
      effectFnsToRun.add(effectsFn)
    }
  })
  // 如果当前是添加属性或删除属性操作，就把for..,in相关的副作用取出执行
  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    depsMap.get(ITERATE_KEY)?.forEach(effectsFn => {
      if (effectsFn !== activeEffect) {
        effectFnsToRun.add(effectsFn)
      }
    })
  }
  // 对于数组来说，ADD说明length属性被改变，因此取出所有依赖了length的副作用
  if (type === TriggerType.ADD && Array.isArray(target)) {
    depsMap.get('length')?.forEach(effectsFn => {
      if (effectsFn !== activeEffect) {
        effectFnsToRun.add(effectsFn)
      }
    })
  }
  // 如果length被修改了，隐含着那些index>=length的元素都会被影响，与之相关的副作用也需要被执行
  if (Array.isArray(target) && key === 'length') {
    depsMap.forEach((effects, k) => {
      if (k >= newValue) {
        effects.forEach(effectsFn => {
          if (effectsFn !== activeEffect) {
            effectFnsToRun.add(effectsFn)
          }
        })
      }
    })
  }
  effectFnsToRun.forEach(effectFn => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      /**
       * 任务调度机制，多次trigger也只会执行一次effectFn:
       * const proxy = { foo: 1 }
       * effect(() => console.log(proxy.foo))
       * proxy.foo++
       * proxy.foo++
       * 输出：1,3
       */
      jobs.add(effectFn)
      flushJobs()
    }
  })
}

export function reactive(data) {
  const existProxy = reactiveMap.get(data)
  if (existProxy) return existProxy
  const proxy = createReactive(data)
  reactiveMap.set(data, proxy)
  return proxy
}

export function shallowReactive(data) {
  return createReactive(data, true)
}

export function readonly(data) {
  return createReactive(data, false, true)
}

export function shallowReadonly(data) {
  return createReactive(data, true, true)
}

function createReactive(data, isShallow = false, isReadonly = false) {
  return new Proxy(data, {
    get(target, key, receiver) {
      // get操作
      if (key === 'raw') {
        // 可以通过raw获取到原始对象：proxy.raw === data;
        return target
      }
      if (arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }
      // 如果一个属性是只读的，那就没必要跟踪变化了，因为它不会变
      // 如果一个key是symbol类型，也不进行跟踪，避免与内置symbol发生意外
      if (!isReadonly && typeof key !== 'symbol') {
        track(target, key)
      }
      const res = Reflect.get(target, key, receiver)
      if (isShallow) {
        return res
      }
      if (typeof res === 'object' && res !== null) {
        return createReactive(res, isShallow, isReadonly);
      }
      return res
    },
    has(target, key) {
      // in操作
      track(target, key)
      return Reflect.has(target, key)
    },
    ownKeys(target) {
      // for...in 操作
      // 由于枚举自身key的操作并不会和某个key相关联，因此这里使用一个自定义的key
      // 对于数组而言，无论是删除和新增元素，本质上就是修改了数组的length属性，因此直接使用length作为key即可
      const key = Array.isArray(target) ? 'length' : ITERATE_KEY
      track(target, key)
      return Reflect.ownKeys(target)
    },
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`Property ${key} is readonly.`)
        return true
      }
      // 是否是自己属性？
      const owned = Object.hasOwnProperty.call(target, key)
      const result = Reflect.deleteProperty(target, key)
      if (result && owned) {
        trigger(target, key, TriggerType.DELETE)
      }
      return result
    },
    set(target, key, newValue, receiver) {
      if (isReadonly) {
        console.warn(`Property ${key} is readonly.`)
        return true
      }
      const oldValue = target[key]
      // 是新增属性还是修改属性？
      const type =
        Array.isArray(target) ?
          // 是数组时，检查被设置的索引是否大于数组长度
          // 如果被设置的索引大于等于了数组长度，length属性也会被隐式修改，所有依赖了length属性的副作用都需要被重新执行
          // 因此区分操作类型很有必要
          (Number(key) < target.length ? TriggerType.SET : TriggerType.ADD) :
          Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD
      const result = Reflect.set(target, key, newValue, receiver)
      if (target === receiver.raw) {
        // target === receiver.raw 说明receiver就是target的代理对象，解决因为原型链问题引起的副作用重复执行
        if (oldValue !== newValue && (oldValue === oldValue || newValue === newValue)) {
          // 当新旧值不一样的时候才触发响应
          // oldValue === oldValue || newValue === newValue 的分支用来解决NaN的问题
          trigger(target, key, type, newValue)
        }
      }
      return result
    },
  })
}

const data = reactive({ text: 'hello world!' })
effect(() => (document.body.innerText = data.text))
setTimeout(() => (data.text = 'Reactive!'), 2500)
