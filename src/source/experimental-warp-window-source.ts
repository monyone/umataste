import { parseBox } from "../demux/box/box";
import BoxQueue from "../demux/box/queue";
import EventEmitter from '../event/eventemitter'
import { Events, EventTypes } from '../event/events'
import Source from "./source";

type Warp = {
  init?: {
    id: number,
  },
  segment?: {
    init: number,
    timestamp: number
  },
  priority?: {
    precedence: number
  }
};

export default class ExperimentalWarpWindowSource extends Source {
  private webTransport: any | null = null;
  private unidirectionalStreamReader: ReadableStreamDefaultReader<ReadableStream> | null = null;
  private abortController: AbortController | null = null;

  private initId: number | null = null;
  private waitingFragments: Map<number, Events[(typeof EventTypes.FRAGMENT_RECIEVED)][]> = new Map();

  private emitter: EventEmitter | null = null;

  public constructor() {
    super();
  }

  static isSupported () {
    return !!((self as any).WebTransport) && !!(self.ReadableStream);
  }

  public setEmitter(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  public abort() {
    this.initId = null;
    this.waitingFragments.clear();
    try {
      this.webTransport?.close();
      this.webTransport = null;
    } catch (e: unknown) {}
    try {
      this.abortController?.abort();
    } catch (e: unknown) {}
    try {
      this.unidirectionalStreamReader?.cancel();
    } catch (e: unknown) {}
  }

  public async load(url: string): Promise<boolean> {
    this.abort();

    if (self.AbortController) {
      this.abortController = new self.AbortController();
    }

    try {
      this.webTransport = new (self as any).WebTransport(url);
      await this.webTransport.ready;
      
      this.unidirectionalStreamReader = this.webTransport.incomingUnidirectionalStreams.getReader();
      this.pump();
      return true;
    } catch (e: unknown) {
      return false;
    }
  }

  private async readUnidirectionalStream(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const boxQueue = new BoxQueue();
    let warp: Warp | null = null;
    let init: Uint8Array[] = [];
    let moof: Uint8Array | null = null;
    let emsg: ArrayBuffer[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (init.length > 0) {
          if (warp?.init != null) {
            const id = warp.init.id;

            let total = 0;
            for (const box of init) { total += box.byteLength; }

            const segment = new Uint8Array(total);
            for (let i = 0, offset = 0; offset < total; offset += init[i++].byteLength) {
              segment.set(init[i], offset);
            }

            this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
              event: EventTypes.INIT_SEGMENT_RECIEVED,
              adaptation_id: 0,
              init: segment.buffer
            });

            while (this.waitingFragments.has(id) && this.waitingFragments.get(id)!.length > 0) {
              this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, this.waitingFragments.get(id)!.shift()!);
            }
            this.waitingFragments.delete(id);
            this.initId = id;
          }
        }

        return;
      }

      boxQueue.push(value!);
      while (!boxQueue.isEmpty()) {
        const data = boxQueue.pop()!;
        const box = parseBox(data.buffer);

        if (box.type === 'warp') {
          warp = JSON.parse((new self.TextDecoder()).decode(data.slice(box.begin, box.end))) as Warp;
          continue;
        }

        if (moof) {
          if (box.type === 'emsg') {
            emsg.push(data.buffer);
          } else if (box.type === 'mdat') {
            // if warp message arrived
            if (warp?.segment != null) {
              const initId = warp.segment.init;
              const fragment = (Uint8Array.from([... moof, ... data]));

              if (this.initId === initId) {
                this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, {
                  event: EventTypes.FRAGMENT_RECIEVED,
                  adaptation_id: 0,
                  emsg: emsg,
                  fragment: fragment.buffer
                });
              } else {          
                if (!this.waitingFragments.has(initId)) {
                  this.waitingFragments.set(initId, []);
                }
                this.waitingFragments.get(initId)?.push({
                  event: EventTypes.FRAGMENT_RECIEVED,
                  adaptation_id: 0,
                  emsg: emsg,
                  fragment: fragment.buffer
                });
              }
            }

            emsg = [];
            moof = null;
          }
        } else if(box.type === 'moof') {
          if (init.length !== 0) {
            // if wrap message arrived
            if (warp?.init != null) {
              const id = warp.init.id;

              let total = 0;
              for (const box of init) { total += box.byteLength; }

              const segment = new Uint8Array(total);
              for (let i = 0, offset = 0; offset < total; offset += init[i++].byteLength) {
                segment.set(init[i], offset);
              }

              this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
                event: EventTypes.INIT_SEGMENT_RECIEVED,
                adaptation_id: 0,
                init: segment.buffer
              });

              while (this.waitingFragments.has(id) && this.waitingFragments.get(id)!.length > 0) {
                this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, this.waitingFragments.get(id)!.shift()!);
              }
              this.waitingFragments.delete(id);
              this.initId = id;
            }
          }

          init = [];
          moof = data;
        } else if (box.type === 'emsg') {
          emsg.push(data.buffer);
        } else if (box.type === 'sidx' || box.type === 'styp' || box.type === 'prft') {
          // pass
        } else {
          init.push(data);
        }
      }
    }
  }

  private pump(): void {
    if (this.unidirectionalStreamReader == null) { return; }
    this.unidirectionalStreamReader.read().then(({ value, done }) => {
      if (done) {
        return;
      } else if (this.abortController?.signal.aborted) {
        this.unidirectionalStreamReader?.cancel();
        return;
      }

      this.readUnidirectionalStream(value!);
      return this.pump();
    })
  }
};
