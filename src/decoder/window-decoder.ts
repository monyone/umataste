import { InitData } from '../demux/init/index';
import EventEmitter from '../event/eventemitter';
import { Events, EventTypes } from '../event/events';
import Decoder from './decoder';

export default class WindowDecoder extends Decoder {  
  private emitter: EventEmitter | null = null;

  private videoDecoder: VideoDecoder | null = null;
  private audioDecoder: AudioDecoder | null = null;
  private videoDecoderInitializing: boolean = false;
  private audioDecoderInitializing: boolean = false;

  private videoInitData: InitData | null = null;
  private audioInitData: InitData | null = null;

  private videoKeyFrameArrived: boolean = false;

  private readonly onH264EmittedHandler = this.onH264Emitted.bind(this);
  private readonly onAACEmittedHandler = this.onAACEmitted.bind(this);

  static isSupported () {
    return window.isSecureContext && !!(window.VideoFrame) && !!(window.AudioData) && !!(window.VideoDecoder) && !!(window.AudioDecoder) && !!(window.EncodedVideoChunk) && !!(window.EncodedAudioChunk);
  }
  
  public constructor() {
    super();
  }

  public setEmitter(emitter: EventEmitter) {
    if (this.emitter) {
      this.emitter.off(EventTypes.H264_EMITTED, this.onH264EmittedHandler);
      this.emitter.off(EventTypes.AAC_EMITTED, this.onAACEmittedHandler);
    }

    this.emitter = emitter;
    this.emitter.on(EventTypes.H264_EMITTED, this.onH264EmittedHandler);
    this.emitter.on(EventTypes.AAC_EMITTED, this.onAACEmittedHandler);
  }

  public async initVideoDecoder(init: InitData): Promise<void> {
    this.videoInitData = init;
    await this.resetVideoDecoder(init);
  }

  public async initAudioDecoder(init: InitData): Promise<void> {
    this.audioInitData = init;
    await this.resetAudioDecoder(init);
  }

  private async resetVideoDecoder(init: InitData) {
    this.videoDecoder = new VideoDecoder({
      output: (videoFrame) => {
        this.emitter?.emit(EventTypes.VIDEO_FRAME_DECODED, {
          event: EventTypes.VIDEO_FRAME_DECODED,
          frame: videoFrame
        })
      },
      error: (e) => {
        console.error(e);
        this.emitter?.emit(EventTypes.VIDEO_DECODE_ERROR, {
          event: EventTypes.VIDEO_DECODE_ERROR,
          error: e,
        });
      },
    })
    this.videoDecoderInitializing = true;
    await this.videoDecoder.configure({
      codec: init.codec.identifier,
      description: init.codec.description,
    });
    this.videoDecoderInitializing = false;

    this.videoKeyFrameArrived = false;
  }

  private async resetAudioDecoder(init: InitData) {
    this.audioDecoder = new AudioDecoder({
      output: (audioFrame) => {
        this.emitter?.emit(EventTypes.AUDIO_FRAME_DECODED, {
          event: EventTypes.AUDIO_FRAME_DECODED,
          frame: audioFrame
        })
      },
      error: (e) => {
        this.emitter?.emit(EventTypes.AUDIO_DECODE_ERROR, {
          event: EventTypes.AUDIO_DECODE_ERROR,
          error: e,
        });
      },
    });
    this.audioDecoderInitializing = true;
    await this.audioDecoder.configure({
      codec: init.codec.identifier,
      sampleRate: 48000,
      numberOfChannels: 2,
      description: init.codec.description
    });
    this.audioDecoderInitializing = false;
  }

  private async onH264Emitted({ timestamp, isIDR, payload }: Events[typeof EventTypes.H264_EMITTED]) {
    if (!this.videoDecoder) { return; }
    if (this.videoDecoderInitializing) { return; }

    this.videoKeyFrameArrived ||= isIDR;
    if (!this.videoKeyFrameArrived) { return; }

    const encodedVideoChunk = new EncodedVideoChunk({
      type: isIDR ? 'key' : 'delta',
      timestamp: timestamp * 1000000,
      data: payload,
    });

    try {
      this.videoDecoder?.decode(encodedVideoChunk);
    } catch (e: unknown) {
      this.emitter?.emit(EventTypes.VIDEO_DECODE_ERROR, {
        event: EventTypes.VIDEO_DECODE_ERROR,
        error: e,
      });
      if (this.videoInitData) {
        await this.resetVideoDecoder(this.videoInitData);
      }
    }
  }

  private async onAACEmitted({ timestamp, payload }: Events[typeof EventTypes.AAC_EMITTED]) {
    if (!this.audioDecoder) { return; }
    if (this.audioDecoderInitializing) { return; }
    
    const encodedAudioChunk = new EncodedAudioChunk({
      type: 'key',
      timestamp: timestamp * 1000000,
      data: payload,
    });

    try {
      this.audioDecoder?.decode(encodedAudioChunk);
    } catch (e: unknown) {
      this.emitter?.emit(EventTypes.AUDIO_DECODE_ERROR, {
        event: EventTypes.AUDIO_DECODE_ERROR,
        error: e,
      });
      if (this.audioInitData) {
        this.resetAudioDecoder(this.audioInitData);
      }
    }
  }
};