// 副作用函数桶，保存所有副作用函数
// target -> Map<key, Set<fn>>
const bucket = new WeakMap()
// 副作用栈，处理多个effect嵌套执行的情况
const effectStack = [];
// 待执行的effectFn集合
const jobs = new Set();
// 全局变量，用来保存当前正在执行的副作用函数
let activeEffect = undefined;
let p = Promise.resolve();

// effect负责设置副作用函数并调用它
export function effect(fn, options = {}) {
  const effectFn = () => {
    // 每次运行effectFn都先清除自身所有的依赖，避免因分支切换引起依赖残留
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);
    fn()
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
  }
  // 搜集与该effectFn相关的依赖集合
  effectFn.deps = []
  effectFn.options = options;
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
let isFlushing = false;
function flushJobs() {
  if (isFlushing) return;
  isFlushing = true;
  p.then(() => jobs.forEach(job => job())).finally(() => {
    jobs.clear();
    isFlushing = false;
  })
}

// 跟踪变化
export function track(target, key) {
  if (!activeEffect) return
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
export function trigger(target, key) {
    const depsMap = bucket.get(target);
    if (!depsMap) return;
    const effectFns = depsMap.get(key);
    // 新开一个set，避免原set边遍历边添加导致的无限循环
    const effectFnsToRun = new Set();
    effectFns?.forEach(effectsFn => {
      if (effectsFn !== activeEffect) {
        /**
         * 当在一个effectFn中既触发了搜集又触发了变更，就会导致无限循环，内存溢出:
         * effect(() => proxy.foo++)
         * 因此如果当前正在搜集的activeEffect与需要执行effectsFn相同，则跳过当次的执行
         */
        effectFnsToRun.add(effectsFn);
      }
    })
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
        jobs.add(effectFn);
        flushJobs();
      }
    });
}

const data = { text: 'hello world!' }
const proxy = new Proxy(data, {
  get(target, key, receiver) {
    // 每当发生读操作，都把当前的副作用函数放到bucket
    track(target, key)
    return target[key]
  },
  set(target, key, newValue, receiver) {
    target[key] = newValue
    // 每当发生写操作，都把副作用函数执行一遍
    trigger(target, key)
    return true
  }
})

effect(() => document.body.innerText = proxy.text)
setTimeout(() => proxy.text = 'Reactive!', 2500)
