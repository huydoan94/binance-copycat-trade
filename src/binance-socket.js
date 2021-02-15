import axios from 'axios';
import { noop } from 'lodash';
import WebSocket from 'isomorphic-ws';

const getAccountListenKey = async (key) => {
  const { data: { listenKey: targetListenKey } } = await axios.post(
    '/userDataStream',
    undefined,
    { headers: { 'X-MBX-APIKEY': key } }
  );
  return targetListenKey;
};

export default class BinanceSocket {
  key = null
  messageHandler = noop
  socketClient = null
  pingTimeout = null
  pingWaitTimeout = null
  id = null
  socketUrl = null

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
    this.socketClient.addEventListener('error', this.errorHandler);
    this.socketClient.addEventListener('close', this.closeHandler);
    this.socketClient.addEventListener('ping', this.pingPongHandler);
    this.socketClient.addEventListener('pong', this.pingPongHandler);
  }

  openHandler = () => {
    console.log(`[${this.id}]Socket opened.`);
    this.setPingTimeout();
  }

  messageHandlerParser = (evt) => this.messageHandler(evt.data)

  errorHandler = () => {
    console.error(`[${this.id}]Socket error!`);
    this.socketClient.close(4000);
  }

  closeHandler = (evt) => {
    console.log(`[${this.id}]Socket closed: ${JSON.stringify(evt)}`);

    clearTimeout(this.pingTimeout);
    clearTimeout(this.pingWaitTimeout);
    setTimeout(() => this.createSocketClient(), 1000);
  };

  pingPongHandler = () => {
    clearTimeout(this.pingTimeout);
    clearTimeout(this.pingWaitTimeout);

    this.setPingTimeout();
  }

  ping = () => {
    this.socketClient.ping();
    this.pingWaitTimeout = setTimeout(
      () => this.socketClient.close(),
      60 * 1000
    );
  }

  setPingTimeout = () => {
    this.pingTimeout = setTimeout(
      () => this.ping(),
      20 * 60 * 1000
    );
  }
}
