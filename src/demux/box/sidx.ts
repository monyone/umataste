import { Box } from "./box";

type Entry = {
  reference_type: number,
  referenced_size: number,
  sub_segment_duration: number,
  starts_with_SAP: number,
  SAP_type: number,
  SAP_delta_time: number
}

export type Sidx = {
  version: number,
  flags: number,
  reference_id: number,
  timescale: number,
  earliest_presentation_time: number,
  first_offset: number
  entries: Entry[], 
 };

export const parseSidx = (arraybuffer: ArrayBuffer, sidx: Box): Sidx => {
  const view = new DataView(arraybuffer, sidx.begin, (sidx.end - sidx.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);
  const reference_id = view.getUint32(4, false);
  const timescale = view.getUint32(8, false);

  if (version === 0) {
    const earliest_presentation_time = view.getUint32(12, false);
    const first_offset = view.getUint32(16, false);
    const reference_count = view.getUint16(22, false);
    const entries: Entry[] = [];
    for (let i = 24; i < (sidx.end - sidx.begin); i += 8) {
      const reference_type = (view.getUint8(i + 0) & 0x80) >>> 7;
      const referenced_size = view.getUint32(i + 0, false) & 0x7FFFFFFF;
      const sub_segment_duration = view.getUint32(i + 4, false);
      const starts_with_SAP = (view.getUint8(i + 8) & 0x80) >>> 7;
      const SAP_type = (view.getUint8(i + 8) & 0x70) >>> 4;
      const SAP_delta_time = (view.getUint8(i + 9) << 16) | (view.getUint8(i + 10) << 8) | view.getUint8(i + 11);

      entries.push({
        reference_type,
        referenced_size,
        sub_segment_duration,
        starts_with_SAP,
        SAP_type,
        SAP_delta_time
      });
    }

    return {
      version,
      flags,
      reference_id,
      timescale,
      earliest_presentation_time,
      first_offset,
      entries
    };
  } else {
    const earliest_presentation_time = (view.getUint32(12, false) * (2 ** 32)) | view.getUint32(16, false);
    const first_offset = (view.getUint32(20, false) * (2 ** 32)) | view.getUint32(24, false);
    const reference_count = view.getUint16(30, false);
    const entries: Entry[] = [];
    for (let i = 32; i < (sidx.end - sidx.begin); i += 12) {
      const reference_type = (view.getUint8(i + 0) & 0x80) >>> 7;
      const referenced_size = view.getUint32(i + 0, false) & 0x7FFFFFFF;
      const sub_segment_duration = view.getUint32(i + 4, false);
      const starts_with_SAP = (view.getUint8(i + 8) & 0x80) >>> 7;
      const SAP_type = (view.getUint8(i + 8) & 0x70) >>> 4;
      const SAP_delta_time = (view.getUint8(i + 9) << 16) | (view.getUint8(i + 10) << 8) | view.getUint8(i + 11);

      entries.push({
        reference_type,
        referenced_size,
        sub_segment_duration,
        starts_with_SAP,
        SAP_type,
        SAP_delta_time
      });
    }

    return {
      version,
      flags,
      reference_id,
      timescale,
      earliest_presentation_time,
      first_offset,
      entries
    };
  }
};
