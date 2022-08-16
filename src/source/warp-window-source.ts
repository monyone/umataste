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

type WarpMesage = {
  warp: Warp,
  init: Uint8Array[],
  segment: Uint8Array[]
}

const concatUint8Array = (array: Uint8Array[]) => {
  let total = 0;
  for (const box of array) { total += box.byteLength; }

  const segment = new Uint8Array(total);
  for (let i = 0, offset = 0; offset < total; offset += array[i++].byteLength) {
    segment.set(array[i], offset);
  }

  return segment;
}

export default class WarpWindowSource extends Source {
  private webTransport: any | null = null;
  private unidirectionalStreamReader: ReadableStreamDefaultReader<ReadableStream> | null = null;
  private abortController: AbortController | null = null;

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
    let warpMessage: WarpMesage | null = null;
    let emsg: ArrayBuffer[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (warpMessage == null) { return; }

        if (warpMessage.warp.init != null) {
          const initId = warpMessage.warp.init.id;
          const init = concatUint8Array(warpMessage.init);

          this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
            event: EventTypes.INIT_SEGMENT_RECIEVED,
            adaptation_id: initId,
            init: init.buffer
          });
        }

        if (warpMessage.warp.segment != null) {
          const initId = warpMessage.warp.segment.init;
          const fragment = concatUint8Array(warpMessage.segment);
          
          this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, {
            event: EventTypes.FRAGMENT_RECIEVED,
            adaptation_id: initId,
            emsg: emsg,
            fragment: fragment.buffer
          });
        }

        return;
      }

      boxQueue.push(value!);
      while (!boxQueue.isEmpty()) {
        const data = boxQueue.pop()!;
        const box = parseBox(data.buffer);

        if (box.type === 'warp') {
          if (warpMessage != null) {
            if (warpMessage.warp.init != null) {
              const initId = warpMessage.warp.init.id;
              const init = concatUint8Array(warpMessage.init);
    
              this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
                event: EventTypes.INIT_SEGMENT_RECIEVED,
                adaptation_id: initId,
                init: init.buffer
              });
            }
    
            if (warpMessage.warp.segment != null) {
              const initId = warpMessage.warp.segment.init;
              const fragment = concatUint8Array(warpMessage.segment);
              
              this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, {
                event: EventTypes.FRAGMENT_RECIEVED,
                adaptation_id: initId,
                emsg: emsg,
                fragment: fragment.buffer
              });
            }
            emsg = [];
          }

          warpMessage = {
            warp: JSON.parse((new self.TextDecoder()).decode(data.slice(box.begin, box.end))) as Warp,
            init: [],
            segment: [],
          }
          continue;
        }else if (warpMessage == null) {
          continue;
        }

        if (box.type === 'mdat' || box.type === 'moof') {
          warpMessage.segment = [ ... warpMessage.segment, data ];
        } else if (box.type === 'emsg') {
          emsg.push(data.buffer);
        } else if (box.type === 'sidx' || box.type === 'styp' || box.type === 'prft') {
          // pass
        } else {
          warpMessage.init = [ ... warpMessage.init, data ];

          // FIXME: Twich Warp Stream (https://quic.video/demo) don't done in init message
          if (box.type === 'moov') {
            if (warpMessage.warp.init != null) {
              const initId = warpMessage.warp.init.id;
              const init = concatUint8Array(warpMessage.init);
   
              this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
                event: EventTypes.INIT_SEGMENT_RECIEVED,
                adaptation_id: initId,
                init: init.buffer
              });
            }
          }
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
