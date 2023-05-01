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
const hvc1 = (config: ArrayBuffer, width: number, height: number): ArrayBuffer => {
  return box('hvc1',
    uint32(0),
    uint16(0), uint16(1),
    uint16(0), uint16(0),
    uint32(0), uint32(0), uint32(0),
    uint16(width), uint16(height),
    uint16(0x48), uint16(0),
    uint16(0x48), uint16(0),
    uint32(0),
    uint16(1),
    uint32(0), uint32(0), uint32(0), uint32(0), uint32(0), uint32(0), uint32(0), uint32(0),
    uint16(0x18), uint16(0xFFFF),
    box('hvcC', config)
  )
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

const hevcTrack = (trackId: number, vps: ArrayBuffer, sps: ArrayBuffer, pps: ArrayBuffer): ArrayBuffer => {
  const ebsp2rbsp = (data: ArrayBuffer): ArrayBuffer => {
    const ebsp = new Uint8Array(data);
    const rbsp = [ebsp[0], ebsp[1]];
    for (let i = 2; i < ebsp.byteLength; i++) {
      if (i < ebsp.byteLength - 1 && ebsp[i - 2] === 0x00 && ebsp[i - 1] === 0x00 && ebsp[i - 0] === 0x03 && (0x00 <= ebsp[i + 1] && ebsp[i + 1] <= 0x03)) {
        continue;
      }
      rbsp.push(ebsp[i])
    }
    return (new Uint8Array(rbsp)).buffer;
  }

  const parseVPS = (data: ArrayBuffer)  => {
    const rbsp = ebsp2rbsp(data);
    const stream = new BitStream(rbsp);
    stream.readBits(16);

    // VPS
    const video_parameter_set_id = stream.readBits(4);
    stream.readBits(2);
    const max_layers_minus1 = stream.readBits(6);
    const max_sub_layers_minus1 = stream.readBits(3);
    const temporal_id_nesting_flag = stream.readBool();
    // and more ...

    return {
      num_temporal_layers: max_sub_layers_minus1 + 1,
      temporal_id_nesting_flag,
    }
  }

  const parseSPS = (data: ArrayBuffer)  => {
    const rbsp = ebsp2rbsp(data);
    const stream = new BitStream(rbsp);
    stream.readBits(16);

    let left_offset = 0, right_offset = 0, top_offset = 0, bottom_offset = 0;

    // SPS
    const video_paramter_set_id = stream.readBits(4);
    const max_sub_layers_minus1 = stream.readBits(3);
    const temporal_id_nesting_flag = stream.readBool();

    // profile_tier_level begin
    const general_profile_space = stream.readBits(2);
    const general_tier_flag = stream.readBool();
    const general_profile_idc = stream.readBits(5);
    const general_profile_compatibility_flags_1 = stream.readBits(8);
    const general_profile_compatibility_flags_2 = stream.readBits(8);
    const general_profile_compatibility_flags_3 = stream.readBits(8);
    const general_profile_compatibility_flags_4 = stream.readBits(8);
    const general_constraint_indicator_flags_1 = stream.readBits(8);
    const general_constraint_indicator_flags_2 = stream.readBits(8);
    const general_constraint_indicator_flags_3 = stream.readBits(8);
    const general_constraint_indicator_flags_4 = stream.readBits(8);
    const general_constraint_indicator_flags_5 = stream.readBits(8);
    const general_constraint_indicator_flags_6 = stream.readBits(8);
    const general_level_idc = stream.readBits(8);
    const sub_layer_profile_present_flag = [];
    const sub_layer_level_present_flag = [];
    for (let i = 0; i < max_sub_layers_minus1; i++) {
      sub_layer_profile_present_flag.push(stream.readBool());
      sub_layer_level_present_flag.push(stream.readBool());
    }
    if (max_sub_layers_minus1 > 0) {
      for (let i = max_sub_layers_minus1; i < 8; i++) { stream.readBits(2); }
    }
    for (let i = 0; i < max_sub_layers_minus1; i++) {
      if (sub_layer_profile_present_flag[i]) {
        stream.readBits(8); // sub_layer_profile_space, sub_layer_tier_flag, sub_layer_profile_idc
        stream.readBits(8); stream.readBits(8); stream.readBits(8); stream.readBits(8); // sub_layer_profile_compatibility_flag
        stream.readBits(8); stream.readBits(8); stream.readBits(8); stream.readBits(8); stream.readBits(8); stream.readBits(8);
      }
      if (sub_layer_level_present_flag[i]) {
        stream.readBits(8);
      }
    }
    // profile_tier_level end

    const seq_parameter_set_id = stream.readUEG();
    const chroma_format_idc = stream.readUEG();
    if (chroma_format_idc == 3) {
      stream.readBits(1);  // separate_colour_plane_flag
    }
    const pic_width_in_luma_samples = stream.readUEG();
    const pic_height_in_luma_samples = stream.readUEG();
    const conformance_window_flag = stream.readBool();
    if (conformance_window_flag) {
      left_offset += stream.readUEG();
      right_offset += stream.readUEG();
      top_offset += stream.readUEG();
      bottom_offset += stream.readUEG();
    }
    const bit_depth_luma_minus8 = stream.readUEG();
    const bit_depth_chroma_minus8 = stream.readUEG();
    const log2_max_pic_order_cnt_lsb_minus4 = stream.readUEG();
    const sub_layer_ordering_info_present_flag = stream.readBool();
    for (let i = sub_layer_ordering_info_present_flag ? 0 : max_sub_layers_minus1; i <= max_sub_layers_minus1; i++) {
      stream.readUEG(); // max_dec_pic_buffering_minus1[i]
      stream.readUEG(); // max_num_reorder_pics[i]
      stream.readUEG(); // max_latency_increase_plus1[i]
    }
    const log2_min_luma_coding_block_size_minus3 = stream.readUEG();
    const log2_diff_max_min_luma_coding_block_size = stream.readUEG();
    const log2_min_transform_block_size_minus2 = stream.readUEG();
    const log2_diff_max_min_transform_block_size = stream.readUEG();
    const max_transform_hierarchy_depth_inter = stream.readUEG();
    const max_transform_hierarchy_depth_intra = stream.readUEG();
    const scaling_list_enabled_flag = stream.readBool();
    if (scaling_list_enabled_flag) {
      const sps_scaling_list_data_present_flag = stream.readBool();
      if (sps_scaling_list_data_present_flag) {
        for (let sizeId = 0; sizeId < 4; sizeId++) {
          for(let matrixId = 0; matrixId < ((sizeId === 3) ? 2 : 6); matrixId++){
            const scaling_list_pred_mode_flag = stream.readBool();
            if (!scaling_list_pred_mode_flag) {
              stream.readUEG(); // scaling_list_pred_matrix_id_delta
            } else {
              const coefNum = Math.min(64, (1 << (4 + (sizeId << 1))));
              if (sizeId > 1) { stream.readSEG() }
              for (let i = 0; i < coefNum; i++) { stream.readSEG(); }
            }
          }
        }
      }
    }
    const amp_enabled_flag = stream.readBool();
    const sample_adaptive_offset_enabled_flag = stream.readBool();
    const pcm_enabled_flag = stream.readBool();
    if (pcm_enabled_flag) {
        stream.readBits(4);
        stream.readBits(4);
        stream.readUEG();
        stream.readUEG();
        stream.readBool();
    }
    const num_short_term_ref_pic_sets = stream.readUEG();
    let num_delta_pocs = 0;
    for (let i = 0; i < num_short_term_ref_pic_sets; i++) {
      let inter_ref_pic_set_prediction_flag = false;
      if (i !== 0) { inter_ref_pic_set_prediction_flag = stream.readBool(); }
      if (inter_ref_pic_set_prediction_flag) {
        if (i === num_short_term_ref_pic_sets) { stream.readUEG(); }
        stream.readBool();
        stream.readUEG();
        let next_num_delta_pocs = 0;
        for (let j = 0; j <= num_delta_pocs; j++) {
          const used_by_curr_pic_flag = stream.readBool();
          let use_delta_flag = false;
          if (!used_by_curr_pic_flag) {
            use_delta_flag = stream.readBool();
          }
          if (used_by_curr_pic_flag || use_delta_flag) {
            next_num_delta_pocs++;
          }
        }
        num_delta_pocs = next_num_delta_pocs;
      } else {
        let num_negative_pics = stream.readUEG();
        let num_positive_pics = stream.readUEG();
        num_delta_pocs = num_negative_pics + num_positive_pics;
        for (let j = 0; j < num_negative_pics; j++) {
          stream.readUEG();
          stream.readBool();
        }
        for (let j = 0; j < num_positive_pics; j++) {
          stream.readUEG();
          stream.readBool();
        }
      }
    }
    const long_term_ref_pics_present_flag = stream.readBool();
    if (long_term_ref_pics_present_flag) {
      const num_long_term_ref_pics_sps = stream.readUEG();
      for (let i = 0; i < num_long_term_ref_pics_sps; i++) {
        stream.readBits(log2_max_pic_order_cnt_lsb_minus4 + 4);
        stream.readBits(1);
      }
    }
    //*
    let default_display_window_flag = false; // for calc offset
    let min_spatial_segmentation_idc = 0; // for hvcC
    let sar_width = 1, sar_height = 1;
    let fps_fixed = false, fps_den = 1, fps_num = 1;
    //*/
    const sps_temporal_mvp_enabled_flag = stream.readBool();
    const strong_intra_smoothing_enabled_flag = stream.readBool();
    const vui_parameters_present_flag = stream.readBool();
    if (vui_parameters_present_flag) {
      const aspect_ratio_info_present_flag = stream.readBool();
      if (aspect_ratio_info_present_flag) {
        const aspect_ratio_idc = stream.readBits(8);

        const sar_w_table = [1, 12, 10, 16, 40, 24, 20, 32, 80, 18, 15, 64, 160, 4, 3, 2];
        const sar_h_table = [1, 11, 11, 11, 33, 11, 11, 11, 33, 11, 11, 33,  99, 3, 2, 1];

        if (aspect_ratio_idc > 0 && aspect_ratio_idc <= 16) {
          sar_width = sar_w_table[aspect_ratio_idc - 1];
          sar_height = sar_h_table[aspect_ratio_idc - 1];
        } else if (aspect_ratio_idc === 255) {
          sar_width = stream.readBits(16);
          sar_height = stream.readBits(16);
        }
      }
      const overscan_info_present_flag = stream.readBool();
      if (overscan_info_present_flag) {
        stream.readBool();
      }
      const video_signal_type_present_flag = stream.readBool();
      if (video_signal_type_present_flag) {
        stream.readBits(3);
        stream.readBool();
        const colour_description_present_flag = stream.readBool();
        if (colour_description_present_flag) {
          stream.readBits(8);
          stream.readBits(8);
          stream.readBits(8);
        }
      }
      const chroma_loc_info_present_flag = stream.readBool();
      if (chroma_loc_info_present_flag) {
        stream.readUEG();
        stream.readUEG();
      }
      const neutral_chroma_indication_flag = stream.readBool();
      const field_seq_flag = stream.readBool();
      const frame_field_info_present_flag = stream.readBool();
      default_display_window_flag = stream.readBool();
      if (default_display_window_flag) {
        stream.readUEG();
        stream.readUEG();
        stream.readUEG();
        stream.readUEG();
      }
      const vui_timing_info_present_flag = stream.readBool();
      if (vui_timing_info_present_flag) {
        fps_den = stream.readBits(32);
        fps_num = stream.readBits(32);
        const vui_poc_proportional_to_timing_flag = stream.readBool();
        if (vui_poc_proportional_to_timing_flag) {
          stream.readUEG();
        }
        const vui_hrd_parameters_present_flag = stream.readBool();
        if (vui_hrd_parameters_present_flag) {
          let commonInfPresentFlag = 1;
          let nal_hrd_parameters_present_flag = false;
          let vcl_hrd_parameters_present_flag = false;
          let sub_pic_hrd_params_present_flag = false;
          if (commonInfPresentFlag) {
            nal_hrd_parameters_present_flag = stream.readBool();
            vcl_hrd_parameters_present_flag = stream.readBool();
            if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag){
              sub_pic_hrd_params_present_flag = stream.readBool();
              if (sub_pic_hrd_params_present_flag) {
                stream.readBits(8);
                stream.readBits(5);
                stream.readBool();
                stream.readBits(5);
              }
              const bit_rate_scale = stream.readBits(4);
              const cpb_size_scale = stream.readBits(4);
              if (sub_pic_hrd_params_present_flag) {
                stream.readBits(4);
              }
              stream.readBits(5);
              stream.readBits(5);
              stream.readBits(5);
            }
          }
          for (let i = 0; i <= max_sub_layers_minus1; i++) {
            let fixed_pic_rate_general_flag = stream.readBool();
            fps_fixed = fixed_pic_rate_general_flag;
            let fixed_pic_rate_within_cvs_flag = true;
            let cpbCnt = 1;
            if (!fixed_pic_rate_general_flag) {
              fixed_pic_rate_within_cvs_flag = stream.readBool();
            }
            let low_delay_hrd_flag = false;
            if (fixed_pic_rate_within_cvs_flag) {
              stream.readUEG();
            } else {
              low_delay_hrd_flag = stream.readBool();
            }
            if (!low_delay_hrd_flag) {
              cpbCnt = stream.readUEG() + 1;
            }
            if (nal_hrd_parameters_present_flag) {
              for (let j = 0; j < cpbCnt; j++) {
                stream.readUEG(); stream.readUEG();
                if (sub_pic_hrd_params_present_flag) {
                  stream.readUEG(); stream.readUEG();
                }
                stream.readBool();
              }
            }
            if (vcl_hrd_parameters_present_flag) {
              for (let j = 0; j < cpbCnt; j++) {
                stream.readUEG(); stream.readUEG();
                if (sub_pic_hrd_params_present_flag) {
                  stream.readUEG(); stream.readUEG();
                }
                stream.readBool();
              }
            }
          }
        }
      }
      const bitstream_restriction_flag = stream.readBool();
      if (bitstream_restriction_flag) {
        const tiles_fixed_structure_flag = stream.readBool()
        const motion_vectors_over_pic_boundaries_flag = stream.readBool()
        const restricted_ref_pic_lists_flag = stream.readBool();
        min_spatial_segmentation_idc = stream.readUEG();
        const max_bytes_per_pic_denom = stream.readUEG();
        const max_bits_per_min_cu_denom = stream.readUEG();
        const log2_max_mv_length_horizontal = stream.readUEG();
        const log2_max_mv_length_vertical = stream.readUEG();
      }
    }
    const sps_extension_flag = stream.readBool(); // ignore...

    // for meta data
    const codec_mimetype = `hvc1.${general_profile_idc}.1.L${general_level_idc}.B0`;

    const sub_wc = (chroma_format_idc === 1 || chroma_format_idc === 2) ? 2 : 1;
    const sub_hc = (chroma_format_idc === 1) ? 2 : 1;
    const codec_width = pic_width_in_luma_samples - (left_offset + right_offset) * sub_wc;
    const codec_height = pic_height_in_luma_samples - (top_offset + bottom_offset) * sub_hc;
    let sar_scale = 1;
    if (sar_width !== 1 && sar_height !== 1) {
      sar_scale = sar_width / sar_height;
    }

    return {
      profile_idc: general_profile_idc,
      bit_depth: bit_depth_luma_minus8 + 8,
      chroma_format: chroma_format_idc,

      general_level_idc,
      general_profile_space,
      general_tier_flag,
      general_profile_idc,
      general_profile_compatibility_flags_1,
      general_profile_compatibility_flags_2,
      general_profile_compatibility_flags_3,
      general_profile_compatibility_flags_4,
      general_constraint_indicator_flags_1,
      general_constraint_indicator_flags_2,
      general_constraint_indicator_flags_3,
      general_constraint_indicator_flags_4,
      general_constraint_indicator_flags_5,
      general_constraint_indicator_flags_6,
      min_spatial_segmentation_idc,
      constant_frame_rate: 0,
      chroma_format_idc,
      bit_depth_luma_minus8,
      bit_depth_chroma_minus8,

      frame_rate: {
        fixed: fps_fixed,
        fps: fps_num / fps_den,
        fps_den: fps_den,
        fps_num: fps_num,
      },

      sar_ratio: {
        width: sar_width,
        height: sar_height
      },

      codec_size: {
        width: codec_width,
        height: codec_height
      },

      present_size: {
        width: codec_width * sar_scale,
        height: codec_height
      }
    };
  }

  const parsePPS = (data: ArrayBuffer)  => {
    const rbsp = ebsp2rbsp(data);
    const stream = new BitStream(rbsp);
    stream.readBits(16);

    // VPS
    const pic_parameter_set_id = stream.readUEG();
    const seq_parameter_set_id = stream.readUEG();
    const dependent_slice_segments_enabled_flag = stream.readBool();
    const output_flag_present_flag = stream.readBool();
    const num_extra_slice_header_bits = stream.readBits(3);
    const sign_data_hiding_enabled_flag = stream.readBool();
    const cabac_init_present_flag = stream.readBool();
    const num_ref_idx_l0_default_active_minus1 = stream.readUEG();
    const num_ref_idx_l1_default_active_minus1 = stream.readUEG();
    const init_qp_minus26 = stream.readSEG();
    const constrained_intra_pred_flag = stream.readBool();
    const transform_skip_enabled_flag = stream.readBool();
    const cu_qp_delta_enabled_flag = stream.readBool();
    if (cu_qp_delta_enabled_flag) {
      const diff_cu_qp_delta_depth = stream.readUEG();
    }
    const cb_qp_offset = stream.readSEG();
    const cr_qp_offset = stream.readSEG();
    const pps_slice_chroma_qp_offsets_present_flag = stream.readBool();
    const weighted_pred_flag = stream.readBool();
    const weighted_bipred_flag = stream.readBool();
    const transquant_bypass_enabled_flag = stream.readBool();
    const tiles_enabled_flag = stream.readBool();
    const entropy_coding_sync_enabled_flag = stream.readBool();
    // and more ...

    // needs hvcC
    let parallelismType = 1; // slice-based parallel decoding
    if (entropy_coding_sync_enabled_flag && tiles_enabled_flag) {
      parallelismType = 0; // mixed-type parallel decoding
    } else if (entropy_coding_sync_enabled_flag) {
      parallelismType = 3; // wavefront-based parallel decoding
    } else if (tiles_enabled_flag) {
      parallelismType = 2; // tile-based parallel decoding
    }

    return {
      parallelismType
    }
  }

  const {
    num_temporal_layers,
    temporal_id_nesting_flag,
  } = parseVPS(vps);

  const {
    general_profile_space,
    general_tier_flag,
    general_profile_idc,
    general_profile_compatibility_flags_1,
    general_profile_compatibility_flags_2,
    general_profile_compatibility_flags_3,
    general_profile_compatibility_flags_4,
    general_constraint_indicator_flags_1,
    general_constraint_indicator_flags_2,
    general_constraint_indicator_flags_3,
    general_constraint_indicator_flags_4,
    general_constraint_indicator_flags_5,
    general_constraint_indicator_flags_6,
    general_level_idc,
    min_spatial_segmentation_idc,
    chroma_format_idc,
    bit_depth_luma_minus8,
    bit_depth_chroma_minus8,
    constant_frame_rate,
    codec_size,
    present_size,
  } = parseSPS(sps);
  const { width: codec_width, height: codec_height } = codec_size;
  const { width: presentation_width, height: presentation_height } = present_size;

  const {
    parallelismType
  } = parsePPS(pps);

  const hvcC = (new Uint8Array([
    0x01,
    ((general_profile_space & 0x03) << 6) | ((general_tier_flag ? 1 : 0) << 5) | ((general_profile_idc & 0x1F) << 0),
    general_profile_compatibility_flags_1,
    general_profile_compatibility_flags_2,
    general_profile_compatibility_flags_3,
    general_profile_compatibility_flags_4,
    general_constraint_indicator_flags_1,
    general_constraint_indicator_flags_2,
    general_constraint_indicator_flags_3,
    general_constraint_indicator_flags_4,
    general_constraint_indicator_flags_5,
    general_constraint_indicator_flags_6,
    general_level_idc,
    (0xF0 | ((min_spatial_segmentation_idc & 0x0F00) >> 8)),
    ((min_spatial_segmentation_idc & 0x00FF) >> 0),
    (0xFC | (parallelismType & 0x03)),
    (0xFC | (chroma_format_idc & 0x03)),
    (0xF8 | (bit_depth_luma_minus8 & 0x07)),
    (0xF8 | (bit_depth_chroma_minus8 & 0x07)),
    0x00,
    0x00,
    ((constant_frame_rate & 0x03) << 6) | ((num_temporal_layers & 0x07) << 3) | ((temporal_id_nesting_flag ? 1 : 0) << 2) | 3,
    0x03,
    0x80 | 32,
    0x00, 0x01,
    ((vps.byteLength & 0xFF00) >> 8),
    ((vps.byteLength & 0x00FF) >> 0),
    ... (new Uint8Array(vps)),
    0x80 | 33,
    0x00, 0x01,
    ((sps.byteLength & 0xFF00) >> 8),
    ((sps.byteLength & 0x00FF) >> 0),
    ... (new Uint8Array(sps)),
    0x80 | 34,
    0x00, 0x01,
    ((pps.byteLength & 0xFF00) >> 8),
    ((pps.byteLength & 0x00FF) >> 0),
    ... (new Uint8Array(pps))
  ]));

  return trak(
    tkhd(trackId, presentation_width, presentation_height),
    mdia(
      mdhd(90000),
      hdlr('vide'),
      minf(
        vmhd(),
        dinf(),
        stbl(
          stsd(
            hvc1(hvcC, codec_width, codec_height)
          )
        )
      )
    )
  )
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
const mp4Init = (trackId: number, track: ArrayBuffer):ArrayBuffer => {
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

  private hevc_packet_id: number | null = null;
  private hevc_timestamps: Map<number, [number, number, [number, number][]]> = new Map<number, [number, number, [number, number][]]>();
  private hevc_fragments: Map<number, ArrayBuffer[]> = new Map<number, ArrayBuffer[]>();
  private hevc_au_counts: Map<number, number> = new Map<number, number>();
  private hevc_sps: ArrayBuffer | null = null;
  private hevc_pps: ArrayBuffer | null = null;
  private hevc_vps: ArrayBuffer | null = null;
  private hevc_config: ArrayBuffer | null = null;

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
        break;
      case 0x02:
        this.parseTLVIPv6(data, begin, end);
        break;
      case 0x03:
        this.parseTLVCompressed(data, begin, end);
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

  private parseTLVCompressed(data: ArrayBuffer, begin: number, end: number): void {
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
      case this.hevc_packet_id:
        this.parseMMTMPUHevc(data, MPU_sequence_number, timed_flag, aggregation_flag, fragment_type, fragmentation_indicator, begin + 8, end);
        break;
      default: break;
    }
  }

  private parseMMTMPUMp4a(data: ArrayBuffer, sequence_number: number, aggregation_flag: boolean, fragment_type: number, fragmentation_indicator: number, begin: number, end: number) {
    switch(fragment_type) {
      case 0x00: // MPU Metadata
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
            this.parseMMTMPUMp4aMFU(data, sequence_number, offset, offset + (data_unit_length - 14));
            offset += (data_unit_length - 14);
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

  private parseMMTMPUMp4aMFU(data: ArrayBuffer, sequence_number: number, begin: number, end: number) {
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
        init: mp4Init(1, mp4aTrack(1, channel_configuration, sampling_frequency, this.mp4a_config))
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

  private parseMMTMPUHevc(data: ArrayBuffer, sequence_number: number, timed_flag: boolean, aggregation_flag: boolean, fragment_type: number, fragmentation_indicator: number, begin: number, end: number) {
    switch(fragment_type) {
      case 0x00: // MPU Metadata
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
            this.parseMMTMPUHevcMFU(data, sequence_number, offset, offset + (data_unit_length - 14));
            offset = offset + (data_unit_length - 14);
          }
        } else {
          const movie_fragment_sequence_number = view.getUint32(offset, false); offset += 4;
          const sample_number = view.getUint32(offset, false); offset += 4;
          const sample_offset = view.getUint32(offset, false); offset += 4;
          const priority = view.getUint8(offset); offset += 1;
          const dependency_counter = view.getUint8(offset); offset += 1;
          if (fragmentation_indicator === 1) {
            this.hevc_fragments.set(sequence_number, ([] as ArrayBuffer[]).concat(this.hevc_fragments.get(sequence_number) ?? [], [data.slice(offset, end)]));
          } else if (fragmentation_indicator === 2 && this.hevc_fragments.has(sequence_number)) {
            this.hevc_fragments.set(sequence_number, ([] as ArrayBuffer[]).concat(this.hevc_fragments.get(sequence_number) ?? [], [data.slice(offset, end)]));
          } else if (fragmentation_indicator === 3 && this.hevc_fragments.has(sequence_number)) {
            const payload = concat(... this.hevc_fragments.get(sequence_number) ?? [], data.slice(offset, end));
            this.parseMMTMPUHevcMFU(payload, sequence_number, 0, payload.byteLength);
            this.hevc_fragments.delete(sequence_number);
          } else if (fragmentation_indicator === 0) {
            this.parseMMTMPUHevcMFU(data, sequence_number, begin, end);
          }
        }

        break;
      }
      default: break;
    }
  }

  private parseMMTMPUHevcMFU(data: ArrayBuffer, sequence_number: number, begin: number, end: number) {
    if (!this.hevc_timestamps.has(sequence_number)) { return; }

    if (Number.isNaN(this.hevc_timestamps.get(sequence_number))) {
      this.hevc_timestamps.delete(sequence_number);
      return;
    }

    const view = new DataView(data);
    const nal_unit_type = (view.getUint8(begin + 4) >> 1) & 0x3f;

    if (0x20 <= nal_unit_type && nal_unit_type <= 0x22) {
      switch (nal_unit_type) {
        case 0x20:
          this.hevc_vps = data.slice(begin + 4, end);
          break;
        case 0x21:
          this.hevc_sps = data.slice(begin + 4, end);
          break;
        case 0x22:
          this.hevc_pps = data.slice(begin + 4, end);
          break;
      }

      if (this.hevc_vps != null && this.hevc_sps != null && this.hevc_pps != null && this.hevc_config == null) {
        this.hevc_config = new ArrayBuffer(0); // TODO: hvcC

        this.emitter?.emit(EventTypes.INIT_SEGMENT_RECIEVED, {
          event: EventTypes.INIT_SEGMENT_RECIEVED,
          adaptation_id: this.hevc_packet_id!,
          init: mp4Init(1, hevcTrack(1, this.hevc_vps, this.hevc_sps, this.hevc_pps)),
        });
      }

      return;
    }

    if (this.hevc_config == null) {
      return;
    }

    // Require VCL NAL
    if (nal_unit_type >= 32) {
      return;
    }

    const [mpu_presentation_time, mpu_decoding_time_offset, offsets] = this.hevc_timestamps.get(sequence_number)!;
    const current_au = this.hevc_au_counts.get(sequence_number) ?? 0;
    const keyframe = nal_unit_type === 19 || nal_unit_type === 20 || nal_unit_type === 21;
    let dts = mpu_presentation_time + mpu_decoding_time_offset;
    let cts = 0;
    let duration = 0;
    for (let i = 0; i <= current_au; i++) {
      const [dts_pts_offset, pts_offset] = offsets[i];
      cts = dts_pts_offset;
      duration = pts_offset;
      if (i < current_au) { dts += pts_offset; }
    }
    dts = Math.floor(dts);
    cts = Math.floor(cts);
    duration = Math.ceil(duration)

    const raw = data.slice(begin, end);

    this.emitter?.emit(EventTypes.FRAGMENT_RECIEVED, {
      event: EventTypes.FRAGMENT_RECIEVED,
      adaptation_id: this.hevc_packet_id!,
      emsg: [],
      fragment: concat(moof([1, duration, dts, 0, [[duration, raw.byteLength, keyframe, cts]]]), mdat(raw))
    });

    if (current_au + 1 >= offsets.length) {
      this.hevc_timestamps.delete(sequence_number);
      this.hevc_au_counts.delete(sequence_number);
    } else {
      this.hevc_au_counts.set(sequence_number, current_au + 1);
    }
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
                this.hevc_packet_id = packet_id
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
                case 'hev1':
                case 'hvc1':
                  if (this.hevc_timestamps.has(mpu_sequence_number)) {
                    this.hevc_timestamps.get(mpu_sequence_number)![0] = mpu_presentation_time_90khz;
                  } else {
                    this.hevc_timestamps.set(mpu_sequence_number, [mpu_presentation_time_90khz, 0, []]);
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
                case 'hev1':
                case 'hvc1':
                  if (this.hevc_timestamps.has(mpu_sequence_number)) {
                    this.hevc_timestamps.get(mpu_sequence_number)![1] = mpu_decoding_time_offset / timescale * TIMESCALE;
                    this.hevc_timestamps.get(mpu_sequence_number)![2] = offsets;
                  } else {
                    this.hevc_timestamps.set(mpu_sequence_number, [Number.NaN, mpu_decoding_time_offset / timescale * TIMESCALE, offsets]);
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
