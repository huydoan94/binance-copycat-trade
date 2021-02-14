import { noop } from 'lodash';

export default class EventMessageManager {
  messageStack = []
  executor = noop
  isExecuting = false

  constructor (executor) {
    this.executor = executor || this.executor;
  }

  onReceiveMessage = msg => {
    this.messageStack.push(msg);
    if (!this.isExecuting) this.executeMessageStack();
  }

  executeMessageStack = async () => {
    this.isExecuting = true;

    const msg = this.messageStack.shift();
    if (msg) {
      await this.executor(msg);
      return this.executeMessageStack();
    }

    this.isExecuting = false;
    return null;
  }
}
