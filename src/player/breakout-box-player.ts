import BufferingStrategy from '../buffering/buffering-strategy';
import TickBasedThrottling from '../buffering/tick-based-throttling';
import Decoder from '../decoder/decoder';
import WindowDecoder from '../decoder/window-decoder';
import { findBox } from '../demux/box/box';
import { AVCCodec } from '../demux/box/stsd';
import { getBaseTime, getFragmentData } from '../demux/fragment/index';
import { InitData, parseInitData } from '../demux/init/index';
import EventEmitter from '../event/eventemitter';
import { Events, EventTypes } from '../event/events';
import { HTTPStreamingWindowSource } from '../index';
import Source from '../source/source';
import { PlayerOption } from './option';


export default class MSEPlayer {  
  private emitter: EventEmitter = new EventEmitter();

  private source: Source;
  private decoder: Decoder;
  private buffering: BufferingStrategy;

  private media: HTMLMediaElement | null = null;
  private videoTrackGeneratorWriter: WritableStreamDefaultWriter | null = null;
  private audioTrackGeneratorWriter: WritableStreamDefaultWriter | null = null;

  private duration: number = 0;

  private initData: Map<number, InitData[]> = new Map<number, InitData[]>();
  private baseTime: number | null = null;
  private baseTimeSyncType: 'vide' | 'soun';

  private readonly onInitSegmentRecievedHandler = this.onInitSegmentRecieved.bind(this);
  private readonly onFragmentRecievedHandler = this.onFragmentRecieved.bind(this);

  private readonly onVideoFrameDecodedHandler = this.onVideoFrameDecoded.bind(this);
  private readonly onAudioFrameDecodedHandler = this.onAudioFrameDecoded.bind(this);
  
  public constructor(option?: PlayerOption) {
    this.source = option?.source ?? new HTTPStreamingWindowSource();
    this.decoder = option?.decoder ?? new WindowDecoder();
    this.buffering = option?.buffering ?? new TickBasedThrottling();
    this.baseTimeSyncType = option?.baseTimeSyncType ?? 'vide';

    this.source.setEmitter(this.emitter);
    this.decoder.setEmitter(this.emitter);
    this.buffering.setEmitter(this.emitter);
  }

  public async load(url: string): Promise<boolean> {
    this.stop();

    if (!(await this.source.load(url))) {
      return false;
    }

    this.buffering.start();

    this.duration = 0;

    this.emitter.on(EventTypes.INIT_SEGMENT_RECIEVED, this.onInitSegmentRecievedHandler);
    this.emitter.on(EventTypes.FRAGMENT_RECIEVED, this.onFragmentRecievedHandler);

    this.emitter.on(EventTypes.VIDEO_FRAME_DECODED, this.onVideoFrameDecodedHandler);
    this.emitter.on(EventTypes.AUDIO_FRAME_DECODED, this.onAudioFrameDecodedHandler);

    return true;
  }
  
  public attachMedia(media: HTMLMediaElement): void {
    this.unload();
    this.media = media;

    const videoTrackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
    const audioTrackGenerator = new MediaStreamTrackGenerator({ kind: 'audio' });
    this.videoTrackGeneratorWriter = videoTrackGenerator.writable.getWriter();
    this.audioTrackGeneratorWriter = audioTrackGenerator.writable.getWriter();

    const mediaStream = new MediaStream();
    mediaStream.addTrack(videoTrackGenerator);
    mediaStream.addTrack(audioTrackGenerator);
    this.media.srcObject = mediaStream;
  }

  private onInitSegmentRecieved(payload: Events[typeof EventTypes.INIT_SEGMENT_RECIEVED]) {
    const initData = parseInitData(payload.init);
    this.initData.set(payload.adaptation_id, initData);

    initData.forEach((init) => {
      if (init.handler_type === 'vide') {
        this.decoder.initVideoDecoder(init);
      } else if (init.handler_type == 'soun') {
        this.decoder.initAudioDecoder(init);
      }
    })
  }

  private onFragmentRecieved(payload: Events[typeof EventTypes.FRAGMENT_RECIEVED]) {
    const initData = this.initData.get(payload.adaptation_id);
    if (!initData) { return; }

    const fragmentData = getFragmentData(payload.fragment, initData)[0];
    if (!fragmentData) { return; }

    if (this.baseTime == null) {
      for (const { base_media_decode_time, track } of fragmentData) {
        if (track.handler_type !== this.baseTimeSyncType) { continue; }
        this.baseTime = base_media_decode_time - this.duration;
      }
    }
    if (this.baseTime == null) { return; }

    fragmentData.sort((frag1, frag2) => {
      if (frag1.data_offset == null && frag2.data_offset == null) { return 0; }
      if (frag1.data_offset != null && frag2.data_offset == null) { return 1; }
      if (frag1.data_offset == null && frag2.data_offset != null) { return -1; }
      return frag1.data_offset! - frag2.data_offset!
    })

    fragmentData.forEach((frag, index) => {
      if (this.baseTime == null) { return; }

      const { track, duration, base_media_decode_time } = frag;
      if (track.handler_type === this.baseTimeSyncType) {
        this.duration += duration;
      }

      const mdat = findBox('mdat', payload.fragment)[0];
      if (!mdat) { return; }

      const begin = frag.data_offset ?? mdat.begin;
      const end = ((index < fragmentData.length - 1) ? fragmentData[index + 1].data_offset : null) ?? mdat.end;

      if (track.codec.name === 'avc1') {
        const codec = track.codec as AVCCodec;
        const view = new DataView(payload.fragment)
        let isIDR = false;

        for (let s = begin, index = 0; s < end; ) {
          let size = 0;
          for (let i = 0; i < codec.avcC.nalu_length_size; i++) {
            size <<= 8; size |= view.getUint8(s + i);
          }
          const t = s + codec.avcC.nalu_length_size + size;
          const nal_type = view.getUint8(s + codec.avcC.nalu_length_size) & 0x1F;
          isIDR ||= (nal_type === 5);
          
          if (nal_type === 1 || nal_type === 5) {
            this.emitter.emit(EventTypes.H264_PARSED, {
              event: EventTypes.H264_PARSED,
              timestamp: base_media_decode_time + (index * frag.sample_duration) - this.baseTime,
              isIDR: isIDR,
              payload: payload.fragment.slice(s, t)
            });
            index += 1;
          }

          s = t;
        }
      } else if(track.codec.name === 'mp4a') {
        this.emitter.emit(EventTypes.AAC_PARSED, {
          event: EventTypes.AAC_PARSED,
          timestamp: base_media_decode_time - this.baseTime,
          duration: duration, 
          payload: payload.fragment.slice(begin, end)
        });
      }
    })
  }

  private abort(): void {
    this.source.abort();
    this.buffering.abort();
  }

  private clean(): void {
    this.initData.clear();
    this.duration = 0;
    this.baseTime = null;

    this.emitter.off(EventTypes.INIT_SEGMENT_RECIEVED, this.onInitSegmentRecievedHandler);
    this.emitter.off(EventTypes.FRAGMENT_RECIEVED, this.onFragmentRecievedHandler);
    this.emitter.off(EventTypes.VIDEO_FRAME_DECODED, this.onVideoFrameDecodedHandler);
    this.emitter.off(EventTypes.AUDIO_FRAME_DECODED, this.onAudioFrameDecodedHandler);
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

  private pushVideoFrame(videoFrame: VideoFrame) {
    this.videoTrackGeneratorWriter?.write(videoFrame);
    videoFrame.close()
  }

  private pushAudioFrame(audioFrame: AudioData) {
    this.audioTrackGeneratorWriter?.write(audioFrame);
    audioFrame.close();
  }

  private async onVideoFrameDecoded({ frame }: Events[typeof EventTypes.VIDEO_FRAME_DECODED]) {
    this.pushVideoFrame(frame);
  }

  private async onAudioFrameDecoded({ frame }: Events[typeof EventTypes.AUDIO_FRAME_DECODED]) {
    this.pushAudioFrame(frame);
  }
};