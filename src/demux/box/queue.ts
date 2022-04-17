import { parseBox } from "./box";

export default class Queue {
  private queue: Uint8Array[] = [];
  private chunks: Uint8Array[] = [];
  private total: number = 0;

  private concat () {
    if (this.chunks.length <= 1) { return; }
    const concat = new Uint8Array(this.total);
    for (let i = 0, offset = 0; offset < this.total; offset += this.chunks[i++].byteLength) {
      concat.set(this.chunks[i], offset);
    }
    this.chunks = [concat];
    this.total = concat.length;
  }

  public push (chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.total += chunk.length;

    while (true) {
      if (this.total < 8) {
        break;
      } else if (this.chunks[0].length < 8) {
        this.concat();
      }

      const { size } = parseBox(this.chunks[0].buffer);
      if (this.total >= size) {
        this.concat();
        this.queue.push(this.chunks[0].slice(0, size));
        this.chunks = [this.chunks[0].slice(size)];
        this.total = this.chunks[0].length;
      } else {
        break;
      }
    }
  }

  public pop (): Uint8Array | undefined {
    return this.queue.shift();
  }

  public isEmpty (): boolean {
    return this.queue.length === 0;
  }

  public clear (): void {
    this.chunks.length = 0;
    this.total = 0;
    this.queue.length = 0;
  }
}