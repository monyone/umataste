import { Box } from "./box";

export type Tfhd = {
  version: number,
  flags: number,
  track_id: number,
  default_sample_duration?: number
};

export const parseTfhd = (arraybuffer: ArrayBuffer, tfhd: Box): Tfhd => {
  const view = new DataView(arraybuffer, tfhd.begin, (tfhd.end - tfhd.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);
  const track_id = view.getUint32(4, false);

  let index = 8;
  const result: Partial<Tfhd> = {}
  if ((flags & (0x000001)) !== 0) { index += 8; }
  if ((flags & (0x000002)) !== 0) { index += 4; }
  if ((flags & (0x000008)) !== 0) {
    result.default_sample_duration = view.getUint32(index, false)
    index += 4;
  }

  return {
    version,
    flags,
    track_id,
    ... result
  };
}