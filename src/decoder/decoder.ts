import { InitData } from "../demux/init/index";
import EventEmitter from "../event/eventemitter";

export default abstract class Decoder {
  public abstract setEmitter(emitter: EventEmitter): void;

  public abstract initVideoDecoder(init: InitData): Promise<void>;
  public abstract initAudioDecoder(init: InitData): Promise<void>;
};