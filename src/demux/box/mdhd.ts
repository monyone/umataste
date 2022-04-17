import { Box } from "./box";

export type Mdhd = {
  version: number,
  flags: number,
  timescale: number
};

export const parseMdhd = (arraybuffer: ArrayBuffer, mdhd: Box): Mdhd => {
  const view = new DataView(arraybuffer, mdhd.begin, (mdhd.end - mdhd.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);
  
  if (version === 0) {
    const timescale = view.getUint32(12, false);

    return {
      version,
      flags,
      timescale
    };
  } else {
    const timescale = view.getUint32(20, false);

    return {
      version,
      flags,
      timescale
    };
  }
};
