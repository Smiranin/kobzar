import { PCM_BYTES_PER_SAMPLE, PCM_SAMPLE_RATE } from '@kobzar/core';

export const WAV_HEADER_BYTES = 44;
const CHANNELS = 1;
const PCM_FORMAT = 1;

/** The 44-byte header of a WAV file holding `dataBytes` of Kobzar's PCM (16 kHz, mono, 16-bit). */
export function wavHeader(dataBytes: number): Uint8Array {
  const header = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  const blockAlign = CHANNELS * PCM_BYTES_PER_SAMPLE;
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, PCM_SAMPLE_RATE * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, PCM_BYTES_PER_SAMPLE * 8, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}
