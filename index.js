// 副作用函数桶，保存所有副作用函数
const bucket = new Set()
// 全局变量，用来保存当前正在执行的副作用函数
let activeEffect = null

// effect复制设置副作用函数并调用它
export function effect(fn) {
  activeEffect = fn
  fn()
}

const data = { text: 'hello world!' }
const proxy = new Proxy(data, {
  get(target, p, receiver) {
    // 每当发生读操作，都把当前的副作用函数放到bucket
    if (activeEffect) {
      bucket.add((activeEffect))
    }
    return target[p]
  },
  set(target, p, newValue, receiver) {
    // 每当发生写操作，都把副作用函数执行一遍
    target[p] = newValue
    bucket.forEach(fn => fn())
    return true
  }
})

effect(() => document.body.innerText = proxy.text)
setTimeout(() => proxy.text = 'Reactive!', 2500)
