import { parseBox } from "../demux/box/box";
import BoxQueue from "../demux/box/queue";
import EventEmitter from '../event/eventemitter'
import { EventTypes } from '../event/events'
import Source from "./source";


export default class HTTPStreamingWindowSource extends Source{  
  private socket: WebSocket | null = null;
  private abortController: AbortController | null = null;

  private emitter: EventEmitter | null = null;

  private readonly onErrorHandler = this.onError.bind(this);
  private readonly onMessageHandler = this.onMessage.bind(this);

  private boxQueue: BoxQueue = new BoxQueue();
  private init: Uint8Array[] = [];
  private emsg: ArrayBuffer[] = [];
  private moof: Uint8Array | null = null;

  public constructor() {
    super();
  }

  static isSupported () {
    return !!(self.WebSocket);
  }

  public setEmitter(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  public abort() {
    this.init = [];
    this.moof = null;
    this.boxQueue.clear();
    try {
      this.abortController?.abort();
    } catch (e: unknown) {}
    try {
      this.socket?.close();
    } catch (e: unknown) {}
  }

  public async load(url: string): Promise<boolean> {
    this.abort();

    if (self.AbortController) {
      this.abortController = new self.AbortController();
    }

    try {
      this.socket = new WebSocket(url);
      this.socket.addEventListener('error', this.onErrorHandler)
      this.socket.addEventListener('message', this.onMessageHandler);

      return true;
    } catch (e: unknown) {
      return false;
    }
  }

  private onError(): void {
    this.abort();
  }

  private async onMessage(e: MessageEvent<Blob>): Promise<void> {
    if (this.abortController?.signal.aborted) {
      this.abort();
      return;
    }

    const value = new Uint8Array(await e.data.arrayBuffer());
    this.boxQueue.push(value);
    while (!this.boxQueue.isEmpty()) {
      const data = this.boxQueue.pop()!;
      const box = parseBox(data.buffer);

      if (this.moof) {
        if (box.type === 'emsg') {
          this.emsg.push(data.buffer);
        } else if (box.type === 'mdat') {
          const fragment = (Uint8Array.from([... this.moof, ... data]));

          this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, {
            event: EventTypes.FRAGMENT_RECIEVED,
            adaptation_id: 0,
            emsg: this.emsg,
            fragment: fragment.buffer
          });

          this.emsg = [];
          this.moof = null;
        }
      } else if(box.type === 'moof') {
        if (this.init.length !== 0) {
          let total = 0;
          for (const init of this.init) { total += init.byteLength; }

          const segment = new Uint8Array(total);
          for (let i = 0, offset = 0; offset < total; offset += this.init[i++].byteLength) {
            segment.set(this.init[i], offset);
          }

          this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
            event: EventTypes.INIT_SEGMENT_RECIEVED,
            adaptation_id: 0,
            init: segment.buffer
          });

          this.init = [];
        }

        this.moof = data;
      } else if (box.type === 'emsg') {
        this.emsg.push(data.buffer);
      }  else if (box.type === 'sidx' || box.type === 'styp' || box.type === 'prft') {
        // pass
      } else {
        this.init.push(data);
      }
    }
  }
};
