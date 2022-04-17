export type Box = {
  begin: number,
  end: number,
  size: number,
  type: string
};

export const parseBox = (arraybuffer: ArrayBuffer, begin: number = 0, end?: number): Box => {
  if (end == null) { end = arraybuffer.byteLength; } 
  const view = new DataView(arraybuffer, begin, end - begin);

  const size = view.getUint32(0, false);
  const type = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
  if (size === 1) {
    const size = (view.getUint32(8, false) * (2 ** 32)) + view.getUint32(12, false);
    return {
      begin: begin + 16,
      end: begin + size,
      size: size,
      type: type
    };
  } else if (size === 0) {
    return {
      begin: begin + 8,
      end: end,
      size: end - begin,
      type: type
    };
  } else {
    return {
      begin: begin + 8,
      end: begin + size,
      size: size,
      type: type
    };
  }
};

export const findBox = (type: string | string[] | null, arraybuffer: ArrayBuffer, begin: number = 0, end?: number): Box[] => {
  if (end == null) { end = arraybuffer.byteLength; }
  const currentType = Array.isArray(type) ? type[0] : type;
  
  const result: Box[] = [];
  while (begin < end) {
    const box = parseBox(arraybuffer, begin, end);

    if (type == null || box.type === currentType) {
      if (type == null) {
        result.push(box);
      } else if (Array.isArray(type)) {
        if (type.length === 1) {
          result.push(box);
        } else { 
          result.push(... findBox(type.slice(1), arraybuffer, box.begin, box.end));
        }
      } else {
        result.push(box);
      }
    }

    begin += box.size;
  }

  return result;
};

