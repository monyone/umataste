import { adjustBaseTime, getBaseTime, getFragmentData } from '../demux/fragment/index';
import { InitData, parseInitData } from '../demux/init/index';
import EventEmitter from '../event/eventemitter';
import { Events, EventTypes } from '../event/events';
import { HTTPStreamingWindowSource } from '../index';
import Source from '../source/source';
import { PlayerOption } from './option';

class SourceBufferQueue {
  private queue: ArrayBuffer[] = [];
  private sourceBuffer: SourceBuffer;
  private readonly onUpdateEndHandler = this.onUpdateEnd.bind(this);

  public constructor(sourceBuffer: SourceBuffer) {
    this.sourceBuffer = sourceBuffer;
    this.sourceBuffer.addEventListener('updateend', this.onUpdateEndHandler); 
  }

  private onUpdateEnd() {
    if (this.queue.length === 0) { return; }
    this.sourceBuffer.appendBuffer(this.queue.shift()!);
  }

  public push(buffer: ArrayBuffer) {
    if (this.sourceBuffer.updating) {
      this.queue.push(buffer);
    } else {
      this.sourceBuffer.appendBuffer(buffer);
    }
  }

  public abort() {
    this.sourceBuffer.abort();
  }
}

export default class MSEPlayer {  
  private emitter: EventEmitter = new EventEmitter();

  private source: Source;
  private media: HTMLMediaElement | null = null;
  private mediaSource: MediaSource | null = null;
  private mediaSourceUrl: string | null = null;

  private duration: number = 0;

  private sourceBufferQueue: Map<number, SourceBufferQueue> = new Map<number, SourceBufferQueue>();
  private initData: Map<number, InitData[]> = new Map<number, InitData[]>();
  private baseTime: number | null = null;
  private baseTimeSyncType: 'vide' | 'soun';

  private readonly onInitSegmentRecievedHandler = this.onInitSegmentRecieved.bind(this);
  private readonly onFragmentRecievedHandler = this.onFragmentRecieved.bind(this);
  
  public constructor(option?: PlayerOption) {
    this.source = option?.source ?? new HTTPStreamingWindowSource();
    this.source.setEmitter(this.emitter);
    this.baseTimeSyncType = option?.baseTimeSyncType ?? 'vide';
  }

  public async load(url: string): Promise<boolean> {
    this.stop();
    if (!this.media) { return false; }

    if (!(await this.source.load(url))) {
      return false;
    }

    this.mediaSource = new MediaSource();
    this.mediaSourceUrl = URL.createObjectURL(this.mediaSource);
    this.attachMedia(this.media);
    this.duration = 0;

    this.emitter.on(EventTypes.INIT_SEGMENT_RECIEVED, this.onInitSegmentRecievedHandler);
    this.emitter.on(EventTypes.FRAGMENT_RECIEVED, this.onFragmentRecievedHandler);

    return new Promise((resolve) => {
      if (!this.mediaSource) { return resolve(false); }
      this.mediaSource?.addEventListener('sourceopen', () => {
        resolve(true);
      })
    });
  }
  
  public attachMedia(media: HTMLMediaElement): void {
    this.unload();
    this.media = media;
    if (this.mediaSourceUrl) { this.media.src = this.mediaSourceUrl; }
  }

  private onInitSegmentRecieved(payload: Events[typeof EventTypes.INIT_SEGMENT_RECIEVED]) {
    if (!this.mediaSource) { return; }
    if (this.mediaSource.readyState !== 'open') { return; }

    const initData = parseInitData(payload.init);
    if (this.initData.has(payload.adaptation_id)) {
      this.baseTime = null;
    }
    this.initData.set(payload.adaptation_id, initData);

    const sourceBuffer = this.mediaSource.addSourceBuffer(`video/mp4; codecs="${initData.map(init => init.codec.identifier).join(',')}"`);
    const sourceBufferQueue = new SourceBufferQueue(sourceBuffer);
    this.sourceBufferQueue.set(payload.adaptation_id, sourceBufferQueue);

    sourceBufferQueue.push(payload.init);
  }

  private onFragmentRecieved(payload: Events[typeof EventTypes.FRAGMENT_RECIEVED]) {
    const sourceBufferQueue = this.sourceBufferQueue.get(payload.adaptation_id);
    if (!sourceBufferQueue) { return; }

    const initData = this.initData.get(payload.adaptation_id);
    if (!initData) { return; }

    const fragmentData = getFragmentData(payload.fragment, initData);

    if (this.baseTime == null) {
      for (const { base_media_decode_time, track } of (fragmentData[0] ?? [])) {
        if (track.handler_type !== this.baseTimeSyncType) { continue; }
        this.baseTime = base_media_decode_time - this.duration;
      }
    }
    if (this.baseTime == null) { return; }

    fragmentData.forEach((frag) => {
      for (const { duration, track } of frag) {
        if (track.handler_type !== this.baseTimeSyncType) { continue; }
        this.duration += duration;
      }
    })

    adjustBaseTime(payload.fragment, initData, this.baseTime);
    sourceBufferQueue.push(payload.fragment);
  }

  private abort(): void {
    this.source.abort();
    for (const sourceBufferQueue of this.sourceBufferQueue.values()) {
      sourceBufferQueue.abort();
    }
  }

  private clean(): void {
    this.mediaSource = null;
    if (this.mediaSourceUrl) { URL.revokeObjectURL(this.mediaSourceUrl); }
    this.mediaSourceUrl = null;
    this.sourceBufferQueue.clear();
    this.initData.clear();
    this.duration = 0;
    this.baseTime = null;

    this.emitter.off(EventTypes.INIT_SEGMENT_RECIEVED, this.onInitSegmentRecievedHandler);
    this.emitter.off(EventTypes.FRAGMENT_RECIEVED, this.onFragmentRecievedHandler);
  }

  private unload() {
    this.media?.removeAttribute('src');
    this.media?.load();
  }

  public stop(): void {
    this.abort();
    this.clean();
    this.unload();
  }

  public on<T extends keyof Events>(type: T, handler: ((payload: Events[T]) => void)): void {
    this.emitter?.on(type, handler);
  }

  public off<T extends keyof Events>(type: T, handler: ((payload: Events[T]) => void)): void {
    this.emitter?.off(type, handler);
  }
};