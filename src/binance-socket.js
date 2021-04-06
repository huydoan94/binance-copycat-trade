import axios from 'axios';
import { noop } from 'lodash';
import WebSocket from 'isomorphic-ws';

const getAccountListenKey = async (key) => {
  const { data } = await axios.post('/userDataStream', undefined, { headers: { 'X-MBX-APIKEY': key } });
  return data.listenKey;
};

export default class BinanceSocket {
  id = null
  key = null
  socketUrl = null
  socketClient = null
  messageHandler = noop

  socketServerCycleTimeout = null
  forceRestart = false

  constructor (key, messageHandler, socketUrl) {
    if (key) {
      this.key = key;
      this.id = key.slice(-5);
    }

    if (socketUrl) {
      this.socketUrl = socketUrl;
      this.id = socketUrl;
    }

    this.messageHandler = messageHandler;
    this.createSocketClient();
  }

  createSocketClient = async () => {
    let targetListenKey;
    if (this.key) targetListenKey = await getAccountListenKey(this.key);
    else targetListenKey = this.socketUrl;

    this.socketClient = new WebSocket(`wss://stream.binance.com:9443/ws/${targetListenKey}`);
    this.socketClient.addEventListener('open', this.openHandler);
    this.socketClient.addEventListener('message', this.messageHandlerParser);
    this.socketClient.addEventListener('close', this.closeHandler);
  }

  restartSocket = () => {
    this.socketClient.close(4990);
  }

  openHandler = () => {
    if (!this.forceRestart) console.log(`[${this.id}]Socket opened!`);
    this.forceRestart = false;

    const restartWait = (this.key ? 30 : (20 * 60)) * 60 * 1000;
    this.socketServerCycleTimeout = setTimeout(this.restartSocket, restartWait);
  }

  messageHandlerParser = (evt) => {
    this.messageHandler(evt.data);
  }

  closeHandler = ({ code }) => {
    clearTimeout(this.socketServerCycleTimeout);

    if (code === 4990) this.forceRestart = true;
    else console.log(`[${this.id}]Socket closed with code: ${code}`);

    if (code === 4991) return;

    setTimeout(this.createSocketClient, 1000);
  }
}
