import { Box } from "./box";

export type Hdlr = {
  version: number,
  flags: number,
  handler_type: string,
  name: string
};

export const parseHdlr = (arraybuffer: ArrayBuffer, hdlr: Box): Hdlr => {
  const view = new DataView(arraybuffer, hdlr.begin, (hdlr.end - hdlr.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);
  const handler_type = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  let name = '';
  for (let i = 24; i < hdlr.end; i++) {
    if (view.getInt8(i) === 0) { break; }
    name += String.fromCharCode(view.getUint8(i));
  }

  return {
    version,
    flags,
    handler_type,
    name
  };
};