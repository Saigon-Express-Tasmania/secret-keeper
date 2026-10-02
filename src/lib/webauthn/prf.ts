/**
 * Passkeys as an encryption factor. The WebAuthn PRF extension turns a touch
 * of a passkey or security key (with PIN or biometrics) into 32 secret bytes
 * that unwrap the vault's passkey key KP. No assertion is checked on a
 * server: without PRF support a passkey is useless here, so it is refused.
 *
 * Passkeys are bound to this site's domain (the WebAuthn RP ID). On another
 * address they will not work; the Recovery Key always does.
 */

import type { PasskeyEnrollment, PasskeyProvider } from "@/lib/vault/vaultSession"
import { fromBase64Url, randomBytes, toBase64Url } from "@/shared/bytes"

const RP_NAME = "Credentials Keep"
const TIMEOUT_MS = 2 * 60_000
const PRF_SALT_BYTES = 32
const PRF_OUTPUT_BYTES = 32
const NO_PRF =
  "This passkey can't be used for encryption (no PRF support). Try a recent browser with a platform passkey, a phone, or a FIDO2 security key."

export class PasskeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PasskeyError"
  }
}

/** The parts of navigator.credentials used here (injectable for tests). */
export type CredentialApi = Pick<CredentialsContainer, "create" | "get">

export function passkeysSupported(): boolean {
  return (
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.credentials !== undefined
  )
}

function browserCredentials(): CredentialApi {
  if (!passkeysSupported()) throw new PasskeyError("This browser doesn't support passkeys.")
  return navigator.credentials
}

/** false when the browser says PRF is unsupported; true/unknown otherwise. */
async function prfMaybeSupported(): Promise<boolean> {
  try {
    const capabilities = await PublicKeyCredential.getClientCapabilities?.()
    return capabilities?.["extension:prf"] !== false
  } catch {
    return true
  }
}

function asPublicKeyCredential(credential: Credential | null): PublicKeyCredential {
  if (!credential || !("rawId" in credential)) throw new PasskeyError("No passkey was used.")
  return credential as PublicKeyCredential
}

function prfOutput(credential: PublicKeyCredential): Uint8Array | null {
  const first = credential.getClientExtensionResults().prf?.results?.first
  if (!first) return null
  const bytes = ArrayBuffer.isView(first)
    ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
    : new Uint8Array(first)
  if (bytes.byteLength !== PRF_OUTPUT_BYTES) throw new PasskeyError(NO_PRF)
  return bytes.slice()
}

async function evaluateWith(
  api: CredentialApi,
  entries: { id: string; salt: string }[]
): Promise<{ id: string; output: Uint8Array }> {
  const assertion = asPublicKeyCredential(
    await api.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: entries.map((entry) => ({
          type: "public-key" as const,
          id: fromBase64Url(entry.id),
        })),
        userVerification: "required",
        timeout: TIMEOUT_MS,
        extensions: {
          prf: {
            evalByCredential: Object.fromEntries(
              entries.map((entry) => [entry.id, { first: fromBase64Url(entry.salt, PRF_SALT_BYTES) }])
            ),
          },
        },
      },
    })
  )
  const output = prfOutput(assertion)
  if (!output) throw new PasskeyError(NO_PRF)
  return { id: toBase64Url(new Uint8Array(assertion.rawId)), output }
}

/** Unlock-time provider: one touch of any enrolled passkey. */
export function browserPasskeys(api?: CredentialApi): PasskeyProvider {
  return { evaluate: (entries) => evaluateWith(api ?? browserCredentials(), entries) }
}

/**
 * Create a passkey for this vault and get its PRF output. Some
 * authenticators only answer PRF on sign-in, which costs a second touch.
 */
export async function enrollPasskey(
  input: { vaultName: string; label: string; exclude: string[] },
  api?: CredentialApi
): Promise<PasskeyEnrollment> {
  const credentials = api ?? browserCredentials()
  if (!api && !(await prfMaybeSupported())) throw new PasskeyError(NO_PRF)
  const salt = randomBytes(PRF_SALT_BYTES)
  const credential = asPublicKeyCredential(
    await credentials.create({
      publicKey: {
        rp: { name: RP_NAME },
        user: {
          id: randomBytes(16),
          name: input.vaultName,
          displayName: `${input.vaultName} (${RP_NAME})`,
        },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -8 },
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
        excludeCredentials: input.exclude.map((id) => ({
          type: "public-key" as const,
          id: fromBase64Url(id),
        })),
        attestation: "none",
        timeout: TIMEOUT_MS,
        extensions: { prf: { eval: { first: salt } } },
      },
    })
  )
  const id = toBase64Url(new Uint8Array(credential.rawId))
  try {
    if (credential.getClientExtensionResults().prf?.enabled === false) throw new PasskeyError(NO_PRF)
    const output =
      prfOutput(credential) ?? (await evaluateWith(credentials, [{ id, salt: toBase64Url(salt) }])).output
    return { id, salt, prfOutput: output, label: input.label }
  } catch (error) {
    discardPasskey(id)
    throw error
  }
}

/**
 * Ask the password manager to drop a passkey this vault no longer uses
 * (removed, or created but unusable). Best effort; ignored where unsupported.
 */
export function discardPasskey(credentialId: string): void {
  try {
    void PublicKeyCredential.signalUnknownCredential?.({
      rpId: location.hostname,
      credentialId,
    }).catch(() => {})
  } catch {
    // Not supported: the unused passkey stays in the user's list.
  }
}
