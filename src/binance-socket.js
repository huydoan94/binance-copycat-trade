import axios from 'axios';
import { noop } from 'lodash';
import WebSocket from 'ws';

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

  constructor (key, messageHandler) {
    this.key = key;
    this.messageHandler = messageHandler;
    this.id = key.slice(-5);

    this.createSocketClient();
  }

  createSocketClient = async () => {
    const targetListenKey = await getAccountListenKey(this.key);
    this.socketClient = new WebSocket(`wss://stream.binance.com:9443/ws/${targetListenKey}`);
    this.socketClient.on('open', this.openHandler);
    this.socketClient.on('message', this.messageHandler);
    this.socketClient.on('error', this.errorHandler);
    this.socketClient.on('close', this.closeHandler);
    this.socketClient.on('ping', this.pingPongHandler);
    this.socketClient.on('pong', this.pingPongHandler);
  }

  openHandler = () => {
    console.log(`[${this.id}]Socket opened`);
    this.setPingTimeout();
  }

  errorHandler = (err) => {
    console.error(`[${this.id}]Socket error: ${err.message}`);
    this.socketClient.close();
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
