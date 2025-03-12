export const Transition = {
  name: 'Transition',
  setup(props, { slots }) {
    const innerVNode = slots.default();
    innerVNode.transition = {
      beforeEnter(el) {
        el.classList.add('enter-from enter-active');
      },
      enter(el) {
        Promise.resolve().then(() => {
          el.classList.remove('enter-from');
          el.classList.add('enter-to');
          el.addEventListener('transitionend', () => {
            el.classList.remove('enter-to');
            el.classList.add('enter-active');
          })
        });
      },
      leave(el, doRemove) {
        el.classList.add('leave-from leave-active');
        // 强制reflow
        document.body.offsetHeight += 1;
        Promise.resolve().then(() => {
          el.classList.remove('leave-from');
          el.classList.add('leave-to');
          el.addEventListener('transitionend', () => {
            el.classList.remove('leave-to');
            el.classList.add('leave-active');
            doRemove();
          })
        })
      },
    };
    return innerVNode;
  },
}