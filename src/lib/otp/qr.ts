/**
 * Decode / encode QR codes (e.g. otpauth:// enrollment codes) locally.
 */

/** Large screenshots make jsQR slow; downscale so the longest side fits. */
const MAX_SIDE = 1600

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/")
}

/** First image file in a clipboard / drag-and-drop payload, if any. */
export function firstImageFrom(data: DataTransfer): File | null {
  for (const file of Array.from(data.files)) {
    if (isImageFile(file)) return file
  }
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

/** Returns the QR payload text, or null when no QR code is found. */
export async function decodeQrFromImage(blob: Blob): Promise<string | null> {
  const [{ default: jsQR }, bitmap] = await Promise.all([
    import("jsqr"),
    createImageBitmap(blob),
  ])
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) throw new Error("Canvas 2D context unavailable")
    // Transparent PNGs would otherwise read as black-on-black.
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    const { data } = ctx.getImageData(0, 0, width, height)
    return jsQR(data, width, height)?.data ?? null
  } finally {
    bitmap.close()
  }
}

/** Render text as a black-on-white QR code PNG, `size` pixels square. */
export async function encodeQrPng(text: string, size = 512): Promise<Blob> {
  const { toCanvas } = await import("qrcode")
  const canvas = document.createElement("canvas")
  await toCanvas(canvas, text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't render QR image.")),
      "image/png"
    )
  })
}
