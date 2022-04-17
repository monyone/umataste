import EventEmitter from '../event/eventemitter'

export default abstract class Source {
  public abstract setEmitter(emitter: EventEmitter): void;
  public abstract abort(): void;
  public abstract load(url: string): Promise<boolean>;
};