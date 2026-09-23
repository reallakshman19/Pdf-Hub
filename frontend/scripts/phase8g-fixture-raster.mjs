import zlib from 'node:zlib';

export const PHASE8G_RASTER_SIZE = 128;

const PNG_SIGNATURE =
  Buffer.from([
    137, 80, 78, 71,
    13, 10, 26, 10,
  ]);

const CRC_TABLE =
  Array.from(
    { length: 256 },
    (_, index) => {
      let value = index;
      for (
        let bit = 0;
        bit < 8;
        bit += 1
      ) {
        value =
          value & 1
            ? 0xedb88320
              ^ (value >>> 1)
            : value >>> 1;
      }
      return value >>> 0;
    },
  );

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value =
      CRC_TABLE[
        (value ^ byte) & 0xff
      ]
      ^ (value >>> 8);
  }
  return (
    value ^ 0xffffffff
  ) >>> 0;
}

function pngChunk(
  type,
  data,
) {
  const typeBytes =
    Buffer.from(
      type,
      'ascii',
    );
  const length =
    Buffer.alloc(4);
  length.writeUInt32BE(
    data.length,
    0,
  );
  const crc =
    Buffer.alloc(4);
  crc.writeUInt32BE(
    crc32(
      Buffer.concat([
        typeBytes,
        data,
      ]),
    ),
    0,
  );
  return Buffer.concat([
    length,
    typeBytes,
    data,
    crc,
  ]);
}

export function deterministicPhase8gRasterPng(
  seed,
) {
  const width =
    PHASE8G_RASTER_SIZE;
  const height =
    PHASE8G_RASTER_SIZE;
  const raw =
    Buffer.alloc(
      height
      * (
        1
        + width * 4
      ),
    );
  let state =
    (
      seed * 2654435761
      + 1013904223
    ) >>> 0;
  let offset = 0;

  for (
    let y = 0;
    y < height;
    y += 1
  ) {
    raw[offset] = 0;
    offset += 1;
    for (
      let x = 0;
      x < width;
      x += 1
    ) {
      state =
        (
          Math.imul(
            state,
            1664525,
          )
          + 1013904223
        ) >>> 0;
      raw[offset] =
        state & 0xff;
      raw[offset + 1] =
        (state >>> 8)
        & 0xff;
      raw[offset + 2] =
        (
          state >>> 16
          ^ x
          ^ y
        ) & 0xff;
      raw[offset + 3] =
        255;
      offset += 4;
    }
  }

  const ihdr =
    Buffer.alloc(13);
  ihdr.writeUInt32BE(
    width,
    0,
  );
  ihdr.writeUInt32BE(
    height,
    4,
  );
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk(
      'IDAT',
      zlib.deflateSync(
        raw,
        {
          level: 6,
        },
      ),
    ),
    pngChunk(
      'IEND',
      Buffer.alloc(0),
    ),
  ]);
}
