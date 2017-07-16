// @flow

const contexts: { [express$Request]: Object } = {};

export default {
  get(req: express$Request) {
    contexts[req] = contexts[req] || {};
    return contexts[req];
  },
  clear(req: express$Request) {
    delete contexts[req];
  },
};
