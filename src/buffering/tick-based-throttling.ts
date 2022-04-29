import BufferingStrategy from "./buffering-strategy";
import EventEmitter from "../event/eventemitter";
import { Events, EventTypes } from '../event/events';
import { Events as TickerEvents, EventTypes as TickerEventTypes } from '../ticker/ticker-events'
import Ticker from 'worker-loader?inline=no-fallback!../ticker/ticker.worker'

type TickBasedThrottlingOptions = {
  emitFirstFrameOnly?: boolean,
  audioBasedLipsync?: boolean,
  tickHz?: number
};

type soundBuffer = {
  timestamp: number,
  duration: number
};

export default class TickBasedThrottling extends BufferingStrategy{
  private emitter: EventEmitter | null = null;
  private options: Required<TickBasedThrottlingOptions>;
  private ticker: Ticker = new Ticker();

  private readonly onH264ParsedHandler = this.onH264Parsed.bind(this);
  private readonly onAACParsedHandler = this.onAACParsed.bind(this);
  private readonly onTickerTickHandler = this.onTickerTick.bind(this);;

  private h264Queue: Events[typeof EventTypes.H264_PARSED][] = [];

  private buffer: soundBuffer[] = [];

  private startTimestamp: number = 0;
  private lastTimestamp : number | null = null;
  private audioTimestamp: number | null = null;

  static isSupported () {
    return true;
  }

  public constructor(options?: TickBasedThrottlingOptions) {
    super();
    this.options = {
      emitFirstFrameOnly: options?.emitFirstFrameOnly ?? false,
      audioBasedLipsync: options?.audioBasedLipsync ?? true,
      tickHz: options?.tickHz ?? 60
    }
  }

  public setEmitter(emitter: EventEmitter) {
    if (this.emitter) {
      this.emitter.off(EventTypes.H264_PARSED, this.onH264ParsedHandler);
      this.emitter.off(EventTypes.AAC_PARSED, this.onAACParsedHandler);
      this.ticker.removeEventListener('message', this.onTickerTickHandler);
    }

    this.emitter = emitter;
    this.emitter.on(EventTypes.H264_PARSED, this.onH264ParsedHandler);
    this.emitter.on(EventTypes.AAC_PARSED, this.onAACParsedHandler);
    this.ticker.addEventListener('message', this.onTickerTickHandler);
  }

  public start() {
    this.abort();
    this.ticker.postMessage({
      event: TickerEventTypes.TICKER_START,
      time: 1000 / this.options.tickHz
    } as TickerEvents[typeof TickerEventTypes.TICKER_START]);
    this.startTimestamp = performance.now();
    this.audioTimestamp = null;
  }

  public abort() {
    this.h264Queue = [];
    this.ticker.postMessage({
      event: TickerEventTypes.TICKER_STOP
    } as TickerEvents[typeof TickerEventTypes.TICKER_STOP]);
  }

  public destroy() {
    this.abort();
    this.ticker.terminate();
  }

  private onH264Parsed(payload: Events[typeof EventTypes.H264_PARSED]) {
    this.h264Queue.push(payload);
  }

  private onAACParsed(payload: Events[typeof EventTypes.AAC_PARSED]) {
    this.emitter?.emit(EventTypes.AAC_EMITTED, {
      ... payload,
      event: EventTypes.AAC_EMITTED
    });
    this.buffer.push({
      timestamp: payload.timestamp,
      duration: payload.duration
    });
    this.onTick();
  }
  
  private onTickerTick(message: MessageEvent): void {
    const { event } = message.data;
    if (event !== TickerEventTypes.TICKER_TICK) { return; }

    this.onTick();
  }

  private onTick(): void {
    const now = performance.now();

    if (this.lastTimestamp != null) {
      let elapse = (now - this.lastTimestamp) / 1000;

      while (this.buffer.length > 0) {
        const buffer = this.buffer[0];
        const min = Math.min(elapse, buffer.duration)

        buffer.timestamp += min;
        buffer.duration -= min;
        elapse -= min;

        this.audioTimestamp = buffer.timestamp;

        if (buffer.duration <= 0) { this.buffer.shift(); }
        if (elapse <= 0) { break; }
      }

      // if elapse > 0, so stalled audio
    }
    this.lastTimestamp = now;

    const elapsedTime = this.options.audioBasedLipsync ? this.audioTimestamp : ((now - this.startTimestamp) / 1000);
    if (elapsedTime == null) { return; }

    let h264Emitted = false;
    this.h264Queue = this.h264Queue.filter((h264) => {
      if (elapsedTime >= h264.timestamp) {
        if (!this.options.emitFirstFrameOnly || !h264Emitted) {
          this.emitter?.emit(EventTypes.H264_EMITTED, {
            ... h264,
            event: EventTypes.H264_EMITTED
          });
          h264Emitted = true;
          return false;
        } else {
          return true;
        }
      } else {
        return true;
      }
    });
  }
};
