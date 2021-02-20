import axios from 'axios';
import { noop, isEmpty } from 'lodash';
import WebSocket from 'isomorphic-ws';

const getAccountListenKey = async (key) => {
  const { data } = await axios.post('/userDataStream', undefined, { headers: { 'X-MBX-APIKEY': key } });
  return data.listenKey;
};

export default class BinanceSocket {
  id = null
  key = null
  socketClient = null
  messageHandler = noop

  pingTimeout = null
  pingWaitTimeout = null

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

    if (isEmpty(targetListenKey)) return;

    this.socketClient = new WebSocket(`wss://stream.binance.com:9443/ws/${targetListenKey}`);
    this.socketClient.on('open', this.openHandler);
    this.socketClient.on('message', this.messageHandler);
    this.socketClient.on('error', this.errorHandler);
    this.socketClient.on('ping', this.pingPongHandler);
    this.socketClient.on('pong', this.pingPongHandler);
    this.socketClient.on('close', this.closeHandler);
  }

  openHandler = () => {
    console.log(`[${this.id}]Socket opened!`);
    this.setPingTimeout();
  }

  errorHandler = () => {
    console.error(`[${this.id}]Socket error!`);
    this.socketClient.close(4000);
  }

  closeHandler = (code) => {
    console.log(`[${this.id}]Socket closed with code: ${code}`);

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
    this.pingWaitTimeout = setTimeout(
      () => this.socketClient.close(),
      60 * 1000
    );
    this.socketClient.ping();
  }

  setPingTimeout = () => {
    this.pingTimeout = setTimeout(
      () => this.ping(),
      5 * 60 * 1000
    );
  }
}
