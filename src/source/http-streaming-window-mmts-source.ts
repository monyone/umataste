import { parseBox } from "../demux/box/box";
import BoxQueue from "../demux/box/queue";
import EventEmitter from '../event/eventemitter'
import { EventTypes } from '../event/events'
import { BitStream } from "../util/bitstream";
import Source from "./source";

// LOAS BEGIN
const sampling_frequency = [
  96000,
  88200,
  64000,
  48000,
  44100,
  32000,
  24000,
  22050,
  16000,
  12000,
  11025,
  8000,
  7350,
];
type LoasAACParseResult = {
  audio_specific_config: ArrayBuffer;
  sampling_frequency: number;
  channel_configuration: number;
  raw: ArrayBuffer;
};
// LOAS END

// MP4 BEGIN
const composition_matrix = (new Uint8Array([
  0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x40, 0x00, 0x00, 0x00,
])).buffer;

const concat = (... data: ArrayBuffer[]): ArrayBuffer => {
  const bytes = data.reduce((prev, curr) => prev + curr.byteLength, 0);
  const buffer = new ArrayBuffer(bytes);
  const uint8 = new Uint8Array(buffer);
  for (let i = 0, offset = 0; i < data.length; offset += data[i++].byteLength) {
    uint8.set(new Uint8Array(data[i]), offset);
  }
  return buffer;
}
const fourcc = (name: string): ArrayBuffer => {
  return (new Uint8Array([
    name.charCodeAt(0),
    name.charCodeAt(1),
    name.charCodeAt(2),
    name.charCodeAt(3)
  ])).buffer;
}
const uint8 = (num: number): ArrayBuffer => {
  const data = new ArrayBuffer(1);
  const view = new DataView(data);
  view.setUint8(0, num);
  return data;
}
const uint16 = (num: number): ArrayBuffer => {
  const data = new ArrayBuffer(2);
  const view = new DataView(data);
  view.setUint16(0, num, false);
  return data;
}
const uint32 = (num: number): ArrayBuffer => {
  const data = new ArrayBuffer(4);
  const view = new DataView(data);
  view.setUint32(0, num, false);
  return data;
}
const box = (name: string, ... data: ArrayBuffer[]): ArrayBuffer => {
  const length = data.reduce((total, buf) => total + buf.byteLength, 0);
  const buffer = concat(new ArrayBuffer(4), fourcc(name), ... data);
  const view = new DataView(buffer);
  view.setUint32(0, 8 + length);
  return buffer;
}
const fullbox = (fourcc: string, version: number, flags: number, ... data: ArrayBuffer[]): ArrayBuffer => {
  return box(fourcc, new Uint8Array([
    version,
    (flags & 0xFF0000) >> 16,
    (flags & 0x00FF00) >>  8,
    (flags & 0x0000FF) >>  0,
  ]), ... data);
}
const ftyp = (): ArrayBuffer => {
  return box('ftyp',
    fourcc('isom'),
    uint32(1),
    fourcc('isom'),
    fourcc('avc1')
  );
}
const moov = (mvhd: ArrayBuffer, mvex: ArrayBuffer, ... trak: ArrayBuffer[]): ArrayBuffer => {
  return box('moov',
    mvhd,
    mvex,
    ... trak
  );
}
const mvhd = (timescale: number): ArrayBuffer => {
  return fullbox('mvhd', 0, 0,
    uint32(0),
    uint32(0),
    uint32(timescale),
    uint32(0),
    uint32(0x00010000),
    uint32(0x01000000),
    uint32(0), uint32(0),
    composition_matrix,
    uint32(0), uint32(0), uint32(0), uint32(0), uint32(0), uint32(0),
    uint32(0xFFFFFFFF)
  );
}
const trak = (tkhd: ArrayBuffer, mdia: ArrayBuffer): ArrayBuffer => {
  return box('trak',
    tkhd,
    mdia
  );
}
const tkhd = (trackId: number, width: number, height: number): ArrayBuffer => {
  return fullbox('tkhd', 0, 0,
    uint32(0),
    uint32(0),
    uint32(trackId),
    uint32(0),
    uint32(0),
    uint32(0), uint32(0),
    uint32(0), uint32(0),
    composition_matrix,
    uint16(width), uint16(0),
    uint16(height), uint16(0)
  );
}
const mdia = (mdhd: ArrayBuffer, hdlr: ArrayBuffer, minf: ArrayBuffer): ArrayBuffer => {
  return box('mdia',
    mdhd,
    hdlr,
    minf
  );
}
const mdhd = (timescale: number): ArrayBuffer => {
  return fullbox('mdhd', 0, 0,
    uint32(0),
    uint32(0),
    uint32(timescale),
    uint32(0),
    uint16(0x55C4), uint16(0)
  );
}
const hdlr = (handler_type: string): ArrayBuffer => {
  return fullbox('hdlr', 0, 0,
    uint32(0),
    fourcc(handler_type),
    uint32(0), uint32(0), uint32(0),
    uint8(0x00),
  );
}
const nmhd = (): ArrayBuffer => {
  return fullbox('nmhd', 0, 0);
}
const vmhd = (): ArrayBuffer => {
  return fullbox('vmhd', 0, 1,
    uint16(0),
    uint16(0), uint16(0), uint16(0)
  );
}
const smhd = (): ArrayBuffer => {
  return fullbox('smhd', 0, 1,
    uint16(0), uint16(0)
  );
}
const minf = (xmhd: ArrayBuffer | null, dinf: ArrayBuffer, stbl: ArrayBuffer): ArrayBuffer => {
  return box('minf',
    xmhd ?? nmhd(),
    dinf,
    stbl
  );
}
const dinf = (): ArrayBuffer => {
  return box('dinf',
    fullbox('dref', 0, 0,
      uint32(1),
      fullbox('url ', 0, 1)
    )
  );
}
const stbl = (stsd: ArrayBuffer): ArrayBuffer => {
  return box('stbl',
    stsd,
    fullbox('stts', 0, 0, uint32(0)),
    fullbox('stsc', 0, 0, uint32(0)),
    fullbox('stsz', 0, 0, uint32(0), uint32(0)),
    fullbox('stco', 0, 0, uint32(0)),
  );
}
const stsd = (specific: ArrayBuffer): ArrayBuffer => {
  return fullbox('stsd', 0, 1,
    uint32(1),
    specific
  );
}
const mp4a = (config: ArrayBuffer, channel_count: number, sample_rate: number): ArrayBuffer => {
  return box('mp4a',
    uint32(0),
    uint16(0), uint16(1),
    uint32(0), uint32(0),
    uint16(channel_count), uint16(0x10),
    uint32(0),
    uint16(sample_rate), uint16(0),
    esds(config)
  );
}
const esds = (config: ArrayBuffer): ArrayBuffer => {
  return fullbox('esds', 0, 0, (new Uint8Array([
      0x03,
      (0x17 + config.byteLength),
      0x00, 0x01,
      0,
      0x04,
      (0x0F + config.byteLength),
      0x40,
      0x15,
      0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x05,
      (config.byteLength),
      ... new Uint8Array(config),
      0x06, 0x01, 0x02
    ]).buffer)
  );
}
const mvex = (...trex: ArrayBuffer[]): ArrayBuffer => {
  return box('mvex',
    ... trex
  );
}
const trex = (trackId: number): ArrayBuffer => {
  return fullbox('trex', 0, 0,
    uint32(trackId),
    uint32(1),
    uint32(0),
    uint32(0),
    uint32(0x00010001)
  );
}

const mp4aTrack = (trackId: number, channel_configuration: number, sample_rate: number, config: ArrayBuffer): ArrayBuffer => {
  return trak(
    tkhd(trackId, 0, 0),
    mdia(
      mdhd(90000),
      hdlr('soun'),
      minf(
        smhd(),
        dinf(),
        stbl(
          stsd(
            mp4a(config, channel_configuration, sample_rate)
          )
        )
      )
    )
  );
}
const mp4aInit = (trackId: number, track: ArrayBuffer):ArrayBuffer => {
  return concat(
    ftyp(),
    moov(
      mvhd(90000),
      mvex(trex(trackId)),
      track,
    )
  );
}

// fragment
const moof = (... fragments: [number, number, number, number, [number, number, boolean, number][]][]): ArrayBuffer => {
  const size = box('moof',
    mfhd(),
    ... fragments.map(([trackId, duration, baseMediaDecodeTime, offset, samples]) => traf(trackId, duration, baseMediaDecodeTime, offset, samples))
  ).byteLength;
  return box('moof',
    mfhd(),
    ... fragments.map(([trackId, duration, baseMediaDecodeTime, offset, samples]) => traf(trackId, duration, baseMediaDecodeTime,  size + 8 + offset, samples))
  );
}
const mfhd = (): ArrayBuffer => {
  return fullbox('mfhd', 0, 0,
    uint32(0)
  );
}
const traf = (trackId: number, duration: number, baseMediaDecodeTime: number, offset: number, samples: [number, number, boolean, number][]): ArrayBuffer => {
  return box('traf',
    tfhd(trackId, duration),
    tfdt(baseMediaDecodeTime),
    trun(offset, samples),
  )
}
const tfhd = (trackId: number, duration: number): ArrayBuffer => {
  return fullbox('tfhd', 0, 8,
    uint32(trackId),
    uint32(duration)
  )
}
const tfdt = (baseMediaDecodeTime: number): ArrayBuffer => {
  return fullbox('tfdt', 1, 0,
    uint32(Math.floor(baseMediaDecodeTime / (2 ** 32))),
    uint32(baseMediaDecodeTime % (2 ** 32))
  );
}
const trun = (offset: number, samples: [number, number, boolean, number][]): ArrayBuffer => {
  return fullbox('trun', 0, 0x000F01,
    uint32(samples.length),
    uint32(offset),
    ... samples.map(([duration, size, keyframe, cts]) => {
      return concat(
        uint32(duration),
        uint32(size),
        uint8(keyframe ? 2 : 1),
        uint8(((keyframe ? 1 : 0) << 6) | ((keyframe ? 0 : 1) << 0)),
        uint16(0),
        uint32(cts)
      )
    })
  );
}
const mdat = (data: ArrayBuffer): ArrayBuffer => {
  return box('mdat', data);
}
// MP4 END

const TIMESCALE = 90000;

export default class HTTPStreamingWindowMMTSSource extends Source {
  private fetchReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abortController: AbortController | null = null;

  private emitter: EventEmitter | null = null;

  private ascendant: Uint8Array = new Uint8Array(0);

  private mp4a_packet_id: number | null = null;
  private mp4a_timestamps: Map<number, [number, number, [number, number][]]> = new Map<number, [number, number, [number, number][]]>();
  private mp4a_au_counts: Map<number, number> = new Map<number, number>();
  private mp4a_config: ArrayBuffer | null = null;

  public constructor() {
    super();
  }

  static isSupported () {
    return !!(self.fetch) && !!(self.ReadableStream);
  }

  public setEmitter(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  public abort() {
    try {
      this.abortController?.abort();
    } catch (e: unknown) {}
    try {
      this.fetchReader?.cancel();
    } catch (e: unknown) {}
  }

  public async load(url: string): Promise<boolean> {
    this.abort();

    if (self.AbortController) {
      this.abortController = new self.AbortController();
    }

    try {
      const result = await fetch(url, {
        signal: this.abortController?.signal
      });

      if (!(result.ok && 200 <= result.status && result.status < 300)) {
        return false;
      }

      if (!(result.body)) {
        return false;
      }

      this.fetchReader = result.body.getReader();
      this.pump();
      return true;
    } catch (e: unknown) {
      return false;
    }
  }

  private pump(): void {
    if (this.fetchReader == null) { return; }
    this.fetchReader.read().then(({ value, done }) => {
      if (done || !value) {
        return;
      } else if (this.abortController?.signal.aborted) {
        return;
      }

      const data = new ArrayBuffer(this.ascendant.byteLength + value.byteLength);
      {
        const arr = new Uint8Array(data);
        arr.set(this.ascendant, 0);
        arr.set(value, this.ascendant.byteLength);
      }
      const view = new DataView(data);
      let begin = 0;
      while (begin < data.byteLength - 4) {
        const sync = view.getUint8(begin + 0);
        if (sync !== 0x7F) {
          begin++;
          continue;
        }

        const packet_type = view.getUint8(begin + 1);
        const length = view.getUint16(begin + 2, false);
        if (begin + 4 + length >= data.byteLength) { break; }

        this.parseTLV(data, packet_type, begin + 4, begin + 4 + length);
        begin += 4 + length;
      }

      this.ascendant = new Uint8Array(data.slice(begin));
      return this.pump();
    })
  }


  private parseTLV(data: ArrayBuffer, packet_type: number, begin: number, end: number): void {
    switch(packet_type) {
      case 0x01:
        this.parseTLVIPv4(data, begin, end);
      case 0x02:
        // TODO: NEED PARSE!
        this.parseTLVIPv6(data, begin, end);
        break;
      case 0x03:
        this.praseTLVCompressed(data, begin, end);
        break;
      default:
        break;
    }
  }

  private parseTLVIPv4(data: ArrayBuffer, begin: number, end: number): void {
    // TODO: NEED IMPL!
  }

  private parseTLVIPv6(data: ArrayBuffer, begin: number, end: number): void {
    // TODO: NEED IMPL!
  }

  private praseTLVCompressed(data: ArrayBuffer, begin: number, end: number): void {
    const view = new DataView(data);

    const CID = (view.getUint16(begin + 0, false) & 0xFFF0) >> 4;
    // TODO: NEED REMOVE!!!
    if (CID !== 1) { return; }
    const SN = (view.getUint8(begin + 1) & 0x0F) >> 0;
    const CID_header_type = view.getUint8(begin + 2);

    switch(CID_header_type) {
      case 0x20: {
        // TODO: NEED PARSE!
        this.parseMMTP(data, begin + 3 + 16 /* IPv4_header_wo_length */ + 4 /* UDP_header_wo_length */, end);
        break;
      }
      case 0x21: {
        // TODO: NEED PARSE!
        //const identification = view.getUint16(begin + 3, false);
        this.parseMMTP(data, begin + 3 + 2 /* identification */, end);
        break;
      }
      case 0x60: {
        // TODO: NEED PARSE!
        this.parseMMTP(data, begin + 3 + 38 /* IPv6_header_wo_length */ + 4 /* UDP_header_wo_length */, end)
        break;
      }
      case 0x61: {
        this.parseMMTP(data, begin + 3, end);
        break;
      }
      default: break;
    }
  }

  private parseMMTP(data: ArrayBuffer, begin: number, end: number) {
    const view = new DataView(data);
    let offset = begin;

    const version = (view.getUint8(offset) & 0xC0) >> 6
    const packet_counter_flag = (view.getUint8(offset) & 0x20) !== 0;
    const FEC_type = (view.getUint8(offset) & 0x18) >> 3;
    const extension_flag = (view.getUint8(offset) & 0x02) !== 0;
    const RAP_flag = (view.getUint8(offset) & 0x01) !== 0; offset += 1;
    const payload_type = (view.getUint8(offset) & 0x3F); offset += 1;
    const packet_id = view.getUint16(offset, false); offset += 2;
    const timestamp = view.getUint32(offset, false); offset += 4;
    const packet_sequence_number = view.getUint32(offset, false); offset += 4;
    let packet_counter: number | null = null;
    if (packet_counter_flag) {
      packet_counter = view.getUint32(offset, false); offset += 4;
    }
    if (extension_flag) {
      const extension_type = view.getUint16(offset, false); offset += 2;
      const extension_length = view.getUint16(offset, false); offset += 2;
      offset += extension_length; // extension
    }

    switch(payload_type) {
      case 0x00: { // Media Aware Framgnet MPU
        this.parseMMTMPU(data, packet_id, offset, end);
        break;
      }
      case 0x02: { // Signaling Message
        const fragmentation_indicator = (view.getUint8(offset) & 0xC0) >> 6;
        const length_extension_flag = (view.getUint8(offset) & 0x02) !== 0;
        const aggregation_flag = (view.getUint8(offset) & 0x01) !== 0; offset += 1;
        const fragment_counter = view.getUint8(offset); offset += 1;
        if (aggregation_flag) {
          while (offset < end) {
            const message_length = length_extension_flag ? view.getUint32(offset, false): view.getUint16(offset, false);
            offset += length_extension_flag ? 4 : 2;
            this.parseMMTSIMessage(data, extension_flag, offset, offset + message_length);
            offset += message_length;
          }
        } else {
          this.parseMMTSIMessage(data, extension_flag, offset, end);
        }
        break;
      }
      default: break;
    }
  }

  private parseMMTMPU(data: ArrayBuffer, packet_id: number, begin: number, end: number) {
    const view = new DataView(data);

    const payload_length = view.getUint16(begin + 0, false);
    const fragment_type = (view.getUint8(begin + 2) & 0xF0) >> 4;
    const timed_flag = (view.getUint8(begin + 2) & 0x08) !== 0;
    const fragmentation_indicator = (view.getUint8(begin + 2) & 0x06) >> 1;
    const aggregation_flag = (view.getUint8(begin + 2) & 0x01) !== 0;
    const fragment_counter = view.getUint8(begin + 3);
    const MPU_sequence_number = view.getUint32(begin + 4, false);

    switch(packet_id) {
      case this.mp4a_packet_id:
        this.parseMMTMPUMp4a(data, MPU_sequence_number, aggregation_flag, fragment_type, fragmentation_indicator, begin + 8, end);
        break;
      default: break;
    }
  }

  private parseMMTMPUMp4a(data: ArrayBuffer, sequence_number: number, aggregation_flag: boolean, fragment_type: number, fragmentation_indicator: number, begin: number, end: number) {
    switch(fragment_type) {
      case 0x00: // MPU Metadata
        this.parseMMTMPUMp4aMPUMetadata(data, begin, end);
        break;
      case 0x01: // MFU Metadata
        break;
      case 0x02: { // MFU
        const view = new DataView(data);
        let offset = begin;

        if (aggregation_flag) {
          while (offset < end) {
            const data_unit_length = view.getUint16(offset, false); offset += 2;
            const movie_fragment_sequence_number = view.getUint32(offset, false); offset += 4;
            const sample_number = view.getUint32(offset, false); offset += 4;
            const sample_offset = view.getUint32(offset, false); offset += 4;
            const priority = view.getUint8(offset); offset += 1;
            const dependency_counter = view.getUint8(offset); offset += 1;
            this.parseMMTMPUMp4aMFU(data, sequence_number, offset, offset + data_unit_length);
            offset += data_unit_length;
          }
        } else {
          const movie_fragment_sequence_number = view.getUint32(offset, false); offset += 4;
          const sample_number = view.getUint32(offset, false); offset += 4;
          const sample_offset = view.getUint32(offset, false); offset += 4;
          const priority = view.getUint8(offset); offset += 1;
          const dependency_counter = view.getUint8(offset); offset += 1;
          this.parseMMTMPUMp4aMFU(data, sequence_number, offset, end);
        }

        break;
      }
      default: break;
    }
  }

  private parseMMTMPUMp4aMPUMetadata(data: ArrayBuffer, begin: number, end: number) {
    // TODO: NEED IMPL
  }

  private parseMMTMPUMp4aMFU(data: ArrayBuffer, sequence_number: number, begin: number, end: number) {
    // TODO: NEED IMPL
    if (!this.mp4a_timestamps.has(sequence_number)) { return; }

    if (Number.isNaN(this.mp4a_timestamps.get(sequence_number))) {
      this.mp4a_timestamps.delete(sequence_number);
      return;
    }

    const loas_parse_result = this.parseLoasMp4a(data, begin, end);
    if (!loas_parse_result) {
      this.mp4a_timestamps.delete(sequence_number);
      return;
    }
    const { audio_specific_config, sampling_frequency, channel_configuration, raw } = loas_parse_result;
    if (this.mp4a_config == null) {
      this.mp4a_config = audio_specific_config;
      this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
        event: EventTypes.INIT_SEGMENT_RECIEVED,
        adaptation_id: this.mp4a_packet_id!,
        init: mp4aInit(1, mp4aTrack(1, channel_configuration, sampling_frequency, this.mp4a_config))
      });
    }

    const [mpu_presentation_time, mpu_decoding_time_offset, offsets] = this.mp4a_timestamps.get(sequence_number)!;
    const current_au = this.mp4a_au_counts.get(sequence_number) ?? 0;
    let dts = mpu_presentation_time + mpu_decoding_time_offset;
    let cts = 0;
    let duration = 0;
    for (let i = 0; i <= current_au; i++) {
      const [dts_pts_offset, pts_offset] = offsets[i];
      cts = dts_pts_offset;
      duration = pts_offset;
      if (i < current_au) { dts += pts_offset; }
    }
    this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, {
      event: EventTypes.FRAGMENT_RECIEVED,
      adaptation_id: this.mp4a_packet_id!,
      emsg: [],
      fragment: concat(moof([1, duration, dts, 0, [[duration, raw.byteLength, false, cts]]]), mdat(raw))
    });


    if (current_au + 1 >= offsets.length) {
      this.mp4a_timestamps.delete(sequence_number);
      this.mp4a_au_counts.delete(sequence_number);
    } else {
      this.mp4a_au_counts.set(sequence_number, current_au + 1);
    }

    /*
    for (const [dts_pts_offset, pts_offset] of offsets) {
      const pts = dts + dts_pts_offset;
      // TODO: FRAGMENT!

      dts += pts_offset;
    }
    */
  }

  private parseLoasMp4a(data: ArrayBuffer, begin: number, end: number): LoasAACParseResult | null {
    const stream = new BitStream(data.slice(begin, end));

    const useSameStreamMux = stream.readBool();
    if (useSameStreamMux) { return null; } // WARN: UNSUPPORTED

    const audioMuxVersion = stream.readBool();
    const audioMuxVersionA = audioMuxVersion && stream.readBool();

    if (audioMuxVersionA) { return null; } // WARN: UNSUPPORTED
    if (audioMuxVersion) {
      // WARN: LatmGetValue
      return null; // WARN: UNSUPPORTED
    }

    const allStreamsSameTimeFraming = stream.readBool();
    if (!allStreamsSameTimeFraming) { return null; } // WARN: UNSUPPORTED
    const numSubFrames = stream.readBits(6);
    if (numSubFrames !== 0) { return null; } // WARN: UNSUPPORTED
    const numProgram = stream.readBits(4);
    if (numProgram !== 0) { return null; } // WARN: UNSUPPORTED
    const numLayer = stream.readBits(3);
    if (numLayer !== 0) { return null; } // WARN: UNSUPPORTED

    //let remains = audioMuxVersion ? LATMValue(stream) : 0;
    let remains = 0;
    const audio_object_type = stream.readBits(5); remains -= 5;
    const sampling_freq_index = stream.readBits(4);remains -= 4;
    const channel_config = stream.readBits(4); remains -= 4;
    stream.readBits(3); remains -= 3; // GA Specfic Config
    if (remains > 0) { stream.readBits(remains); }

    const frameLengthType = stream.readBits(3);
    if (frameLengthType !== 0){ return null; } // WARN: UNSUPPORTED
    const latmBufferFullness = stream.readBits(8);

    const otherDataPresent = stream.readBool();
    let otherDataLenBits = 0;
    if (otherDataPresent) {
      if (audioMuxVersion) {
        // WARN: UNSUPPORTED
        // LATMValue(stream)
      } else {
        while (true) {
          otherDataLenBits = otherDataLenBits << 8;
          const otherDataLenEsc = stream.readBool();
          let otherDataLenTmp = stream.readBits(8);
          otherDataLenBits += otherDataLenTmp
          if (!otherDataLenEsc) { break; }
        }
      }
    }

    const crcCheckPresent = stream.readBool();
    if (crcCheckPresent) { stream.readBits(8); }

    // PayloadLengthInfo
    let length = 0;
    while (true) {
      const tmp = stream.readBits(8);
      length += tmp;
      if (tmp !== 0xFF) { break; }
    }
    // PaylodMux
    const aac = new Uint8Array(length);
    for (let j = 0; j < length; j++) {
      aac[j] = stream.readBits(8);
    }
    // OtherData
    stream.readBits(otherDataLenBits);
    // Align
    stream.byteAlign();

    return {
      audio_specific_config: (new Uint8Array([
        ((audio_object_type << 3) | ((sampling_freq_index & 0x0E) >> 1)),
        (((sampling_freq_index & 0x01) << 7) | (channel_config & 0x0F) << 3)
      ])).buffer,
      sampling_frequency: sampling_frequency[sampling_freq_index],
      channel_configuration: channel_config,
      raw: aac.buffer,
    };
  }

  private parseMMTSIMessage(data: ArrayBuffer, extension_flag: boolean, begin: number, end: number) {
    const view = new DataView(data);

    const message_id = view.getUint16(begin + 0, false);

    switch(message_id) {
      case 0x0000: // PA Message
        this.parseMMTSIPAMessage(data, extension_flag, begin + 2, end);
        break;
      default: break;
    }
  }

  private parseMMTSIPAMessage(data: ArrayBuffer, extension_flag: boolean, begin: number, end: number) {
    const view = new DataView(data);
    let offset = begin;

    const version = view.getUint8(offset); offset += 1
    const length = view.getUint32(offset, false); offset += 4;
    if (extension_flag) {
      const number_of_tables = view.getUint8(offset); offset += 1;
      const tables: [number, number, number][] = [];
      for (let i = 0; i < number_of_tables; i++) {
        const table_id = view.getUint8(offset); offset += 1;
        const table_version = view.getUint8(offset); offset += 1;
        const table_length = view.getUint16(offset); offset += 2;
        tables.push([table_id, table_version, table_length]);
      }

      for (let [table_id, table_version, table_length] of tables) {
        this.parseMMTTable(data, offset, offset + table_length);
        offset += table_length
      }
    } else {
      // WHY??? 1bytes zero is here
      this.parseMMTTable(data, offset + 1, end);
    }
  }

  private parseMMTTable(data: ArrayBuffer, begin: number, end: number) {
    const view = new DataView(data);

    const table_id = view.getUint8(begin + 0);
    switch(table_id) {
      case 0x20: // Complete MP Table
        this.parseMMTMPTable(data, begin + 1, end);
        break;
      default: break;
    }
  }

  private parseMMTMPTable(data: ArrayBuffer, begin: number, end: number) {
    const view = new DataView(data);
    let offset = begin;

    const version = view.getUint8(offset); offset += 1;
    const length = view.getUint16(offset, false); offset += 2;
    const MPT_mode = view.getUint8(offset) & 0x03; offset += 1;
    const MMT_package_id_length = view.getUint8(offset); offset += 1;
    offset += MMT_package_id_length; // MMT_package_id
    const MMT_descriptor_length = view.getUint16(offset, false); offset += 2;
    offset += MMT_descriptor_length; // MMT_descriptors_byte
    const number_of_assets = view.getUint8(offset); offset += 1;

    for (let i = 0; i < number_of_assets; i++) {
      const identifier_type = view.getUint8(offset); offset += 1;
      const asset_id_scheme = view.getUint32(offset, false); offset += 4;
      const asset_id_length = view.getUint8(offset); offset += 1;
      offset += asset_id_length; // asset_id
      const asset_type = String.fromCharCode(view.getUint8(offset + 0), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3)); offset += 4;
      const asset_clock_reference_flag = (view.getUint8(offset) & 0x01) !== 0; offset += 1;
      const location_count = view.getUint8(offset); offset += 1;
      for (let j = 0; j < location_count; j++) {
        const location_type = view.getUint8(offset); offset += 1;
        switch(location_type) {
          case 0x00: { // Same MMT/TLV Stream
            const packet_id = view.getUint16(offset); offset += 2;
            switch(asset_type) {
              case 'mp4a':
                this.mp4a_packet_id = packet_id;
                break;
              case 'hev1':
              case 'hvc1':
                break;
            }
            break;
          }
          case 0x01: // Other IPv4 Stream
            offset += 4 + 4 + 2 + 2;
            break;
          case 0x02: // Other IPv6 Stream
            offset += 16 + 16 + 2 + 2;
            break;
          case 0x03: // Other MPEG2-TS Stream
            offset += 2 + 2 + 2;
            break;
          case 0x04: // Other IPv6 MPEG-TS Stream
            offset += 16 + 16 + 2 + 2;
            break;
          case 0x05: { // Other URL
            const URL_length = view.getUint8(offset); offset += 1;
            offset += URL_length;
            break;
          }
          default: break;
        }
      }
      const asset_descriptors_length = view.getUint16(offset); offset += 2;
      for (let j = offset; j < offset + asset_descriptors_length; ) {
        const descriptor_tag = view.getUint16(j, false); j += 2;
        const descriptor_length = view.getUint8(j); j += 1;
        switch(descriptor_tag) {
          case 0x0001: { // MPU Time Descriptor
            for (let k = j; k < j + descriptor_length; ) {
              const mpu_sequence_number = view.getUint32(k, false); k += 4;
              const mpu_presentation_time_seconds = view.getUint32(k, false); k += 4;
              const mpu_presentation_time_subsecs = view.getUint32(k, false); k += 4;
              const mpu_presentation_time_90khz = Math.round((mpu_presentation_time_seconds + (mpu_presentation_time_subsecs / (2 ** 32))) * TIMESCALE);

              switch(asset_type) {
                case 'mp4a':
                  if (this.mp4a_timestamps.has(mpu_sequence_number)) {
                    this.mp4a_timestamps.get(mpu_sequence_number)![0] = mpu_presentation_time_90khz;
                  } else {
                    this.mp4a_timestamps.set(mpu_sequence_number, [mpu_presentation_time_90khz, 0, []]);
                  }
                  break;
              }
            }
            break;
          }
          case 0x8026: { // MPU Extended Timestamp Descriptor
            let k = j;
            const pts_offset_type = (view.getUint8(k) & 0x06) >> 1;
            const timescale_flag = (view.getUint8(k) & 0x01) !== 0; k += 1;
            const timescale = timescale_flag ? view.getUint32(k, false) : 1; k += timescale_flag ? 4 : 0;
            const default_pts_offset = pts_offset_type === 1 ? view.getUint16(k, false) : 0; k += pts_offset_type === 1 ? 2 : 0;
            while (k < j + descriptor_length) {
              const mpu_sequence_number = view.getUint32(k, false); k += 4;
              const mpu_presentation_time_leap_indicator = (view.getUint8(k) & 0xC0) >> 6; k += 1;
              const mpu_decoding_time_offset = view.getUint16(k, false); k += 2;
              const num_of_au = view.getUint8(k); k += 1;

              const offsets: [number, number][] = [];
              for (let l = 0; l < num_of_au; l++) {
                const dts_pts_offset = view.getUint16(k, false); k += 2;
                const pts_offset = pts_offset_type === 0 ? 0 : pts_offset_type === 1 ? default_pts_offset : view.getUint16(k, false);
                k += pts_offset_type === 2 ? 2 : 0;
                offsets.push([dts_pts_offset / timescale * TIMESCALE, pts_offset / timescale * TIMESCALE]);
              }

              switch(asset_type) {
                case 'mp4a':
                  if (this.mp4a_timestamps.has(mpu_sequence_number)) {
                    this.mp4a_timestamps.get(mpu_sequence_number)![1] = mpu_decoding_time_offset / timescale * TIMESCALE;
                    this.mp4a_timestamps.get(mpu_sequence_number)![2] = offsets;
                  } else {
                    this.mp4a_timestamps.set(mpu_sequence_number, [Number.NaN, mpu_decoding_time_offset / timescale * TIMESCALE, offsets]);
                  }
                  break;
              }
            }
            break;
          }
          default:
            break;
        }
        j += descriptor_length;
      }
      offset += asset_descriptors_length; // asset_descriptors
    }

  }
};
