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
  pingServerTimeout = null
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

    this.socketClient = new WebSocket(`wss://stream.binance.com:9443/ws/${targetListenKey}`);
    this.socketClient.addEventListener('open', this.openHandler);
    this.socketClient.addEventListener('message', this.messageHandlerParser);
    this.socketClient.addEventListener('close', this.closeHandler);

    this.socketClient.addEventListener('pong', this.pongHandler);
  }

  openHandler = () => {
    console.log(`[${this.id}]Socket opened.`);
    this.pingServer();
  }

  messageHandlerParser = (evt) => {
    this.messageHandler(evt.data);
  }

  closeHandler = ({ code }) => {
    console.log(`[${this.id}]Socket closed with code: ${code}`);
    clearTimeout(this.pingWaitTimeout);
    clearTimeout(this.pingServerTimeout);
    setTimeout(this.createSocketClient, 1000);
  }

  pongHandler = () => {
    clearTimeout(this.pingWaitTimeout);
    this.pingServerTimeout = setTimeout(this.pingServer, 15000);
  }

  pingServer = () => {
    this.pingWaitTimeout = setTimeout(() => this.socketClient.close(), 15000);
    this.socketClient.ping();
  }
}
