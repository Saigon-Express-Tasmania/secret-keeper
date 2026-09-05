/**
 * Browser-local replica of the encrypted vault blob.
 * Stores ciphertext only — never the password or derived key.
 */

function cacheKey(objectKey: string): string {
  return `credentials-keep:vault:${objectKey}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

export function loadLocalVault(objectKey: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(cacheKey(objectKey))
    if (!raw) return null
    return base64ToBytes(raw)
  } catch {
    return null
  }
}

export function saveLocalVault(objectKey: string, data: Uint8Array): void {
  localStorage.setItem(cacheKey(objectKey), bytesToBase64(data))
}

export function clearLocalVault(objectKey: string): void {
  localStorage.removeItem(cacheKey(objectKey))
}
