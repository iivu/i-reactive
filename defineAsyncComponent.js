import { ref, shallowRef } from './ref';
import { Text } from './createRenderer';

export function defineAsyncComponent(options) {
  if (typeof options === 'function') {
    options = { loader: options };
  }
  const { loader } = options;
  let InnerComp = null;
  let retries = 0;
  function load() {
    return loader().catch(err => {
      if (options.onError) {
        return new Promise((resolve, reject) => {
          function retry() {
            resolve(load());
            retries++;
          }
          function fail() {
            reject(err);
          }
          options.onError(retry, fail, retries);
        })
      } else {
        throw err;
      }
    })
  }
  return {
    name: 'AsyncComponentWrapper',
    setup() {
      const loaded = ref(false);
      const timeout = ref(false);
      const loading = ref(false);
      const error = shallowRef(null);
      const placeholder = { type: Text, children: '' };
      let timer = null;
      let loadingTimer = null;
      load()
      .then(c => {
        InnerComp = c;
        loaded.value = true;
        clearTimeout(timer);
      })
      .catch(err => error.value = err)
      .finally(() => {
        loading.value = false;
        clearTimeout(loadingTimer);
      })
      
      if (options.delay) {
        loadingTimer = setTimeout(() => loading.value = true, options.delay);
      } else {
        loading.value = true;
      }
      if (options.timeout) {
        timer = setTimeout(() => {
          timeout.value = true;
          error.value = new Error(`Async component timed out after ${options.timeout}ms.`);
        }, options.timeout);
      }
      // onUnmounted(() => clearTimeout(timer));
      return () => {
        if (loading.value && options.loadingComponent) {
          return { type: options.loadingComponent };
        } else if (loaded.value) {
          return { type: InnerComp };
        } else if (error.value && options.errorComponent) {
          return { type: options.errorComponent, props: { error: error.value } };
        } else {
          return placeholder;
        }
      }
    },
  };
}
