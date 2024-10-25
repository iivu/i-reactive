// 副作用函数桶，保存所有副作用函数
// target -> Map<key, Set<fn>>
const bucket = new WeakMap()
// 全局变量，用来保存当前正在执行的副作用函数
let activeEffect = null

// effect复制设置副作用函数并调用它
export function effect(fn) {
  activeEffect = fn
  fn()
}

// 跟踪变化
export function track(target, key) {
  if (!activeEffect) return
  // 取得当前响应式数据所有副作用函数的map: target -> Map<key, Set<fn>>
  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.put(target, (depsMap = new Map()))
  }
  // 取得当前key的副作用函数集合: key -> Set<fn>
  let deps = depsMap.get(key)
  if (!deps) {
    depsMap.put(key, (deps = new Set()))
  }
  // 建立联系: target -> key -> effectFn
  deps.add(activeEffect)
}

// 变化后触发副作用
export function trigger(target, key) {
  bucket.get(target)?.get(key)?.forEach(fn => fn())
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
