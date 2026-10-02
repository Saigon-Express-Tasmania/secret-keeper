/**
 * Binary request/response frame: u32LE jsonLength ‖ UTF-8 JSON ‖ blob.
 * Lets one HTTP body carry typed JSON plus the raw vault blob (no base64).
 */

import { concatBytes, fromUtf8, readUint32LE, utf8, writeUint32LE } from "./bytes"

export const FRAME_CONTENT_TYPE = "application/x-ck-frame"
export const MAX_FRAME_JSON_BYTES = 64 * 1024

export function encodeFrame(json: unknown, blob: Uint8Array = new Uint8Array(0)) {
  const jsonBytes = utf8(JSON.stringify(json))
  if (jsonBytes.byteLength > MAX_FRAME_JSON_BYTES) {
    throw new Error("Frame JSON too large")
  }
  const prefix = new Uint8Array(4)
  writeUint32LE(prefix, 0, jsonBytes.byteLength)
  return concatBytes(prefix, jsonBytes, blob)
}

export function decodeFrame(bytes: Uint8Array): { json: unknown; blob: Uint8Array } {
  if (bytes.byteLength < 4) throw new Error("Frame too short")
  const jsonLength = readUint32LE(bytes, 0)
  if (jsonLength > MAX_FRAME_JSON_BYTES || 4 + jsonLength > bytes.byteLength) {
    throw new Error("Invalid frame length")
  }
  const json: unknown = JSON.parse(fromUtf8(bytes.subarray(4, 4 + jsonLength)))
  return { json, blob: bytes.subarray(4 + jsonLength) }
}
