import { describe, expect, it } from "vitest"

import { fromBase64Url, randomBytes, toBase64Url } from "@/shared/bytes"

import { browserPasskeys, enrollPasskey, PasskeyError, type CredentialApi } from "./prf"

type Prf = { enabled?: boolean; results?: { first: BufferSource } }

function credential(rawId: Uint8Array, prf: Prf | undefined) {
  return {
    id: toBase64Url(rawId),
    type: "public-key",
    rawId: rawId.slice().buffer,
    getClientExtensionResults: () => (prf ? { prf } : {}),
  } as unknown as Credential
}

/** Records requests; answers create() and get() from the given scripts. */
function fakeApi(answers: { create?: Prf; get?: Prf }) {
  const rawId = randomBytes(20)
  const calls: { create: CredentialCreationOptions[]; get: CredentialRequestOptions[] } = {
    create: [],
    get: [],
  }
  const api: CredentialApi = {
    create: async (options) => {
      calls.create.push(options!)
      return credential(rawId, answers.create)
    },
    get: async (options) => {
      calls.get.push(options!)
      return credential(rawId, answers.get)
    },
  }
  return { api, calls, id: toBase64Url(rawId) }
}

const output = () => randomBytes(32)

describe("enrollPasskey", () => {
  it("uses the PRF result from create() when there is one", async () => {
    const first = output()
    const { api, calls, id } = fakeApi({ create: { enabled: true, results: { first } } })
    const enrolled = await enrollPasskey({ vaultName: "family", label: "Laptop", exclude: [] }, api)
    expect(enrolled).toMatchObject({ id, label: "Laptop" })
    expect(enrolled.prfOutput).toEqual(first)
    expect(calls.get).toHaveLength(0)
    const options = calls.create[0]!.publicKey!
    expect(options.authenticatorSelection?.userVerification).toBe("required")
    expect(new Uint8Array(options.extensions!.prf!.eval!.first as Uint8Array)).toEqual(enrolled.salt)
  })

  it("asks for a sign-in touch when create() only reports support", async () => {
    const first = output()
    const { api, calls, id } = fakeApi({ create: { enabled: true }, get: { results: { first } } })
    const exclude = [toBase64Url(randomBytes(16))]
    const enrolled = await enrollPasskey({ vaultName: "family", label: "Key", exclude }, api)
    expect(enrolled.prfOutput).toEqual(first)
    const request = calls.get[0]!.publicKey!
    expect(request.userVerification).toBe("required")
    expect(request.allowCredentials!.map((c) => toBase64Url(new Uint8Array(c.id as Uint8Array)))).toEqual([id])
    expect(
      new Uint8Array(request.extensions!.prf!.evalByCredential![id]!.first as Uint8Array)
    ).toEqual(enrolled.salt)
    expect(
      calls.create[0]!.publicKey!.excludeCredentials!.map((c) =>
        toBase64Url(new Uint8Array(c.id as Uint8Array))
      )
    ).toEqual(exclude)
  })

  it("refuses authenticators without PRF", async () => {
    await expect(
      enrollPasskey({ vaultName: "v", label: "x", exclude: [] }, fakeApi({ create: { enabled: false } }).api)
    ).rejects.toBeInstanceOf(PasskeyError)
    await expect(
      enrollPasskey({ vaultName: "v", label: "x", exclude: [] }, fakeApi({ create: undefined, get: undefined }).api)
    ).rejects.toBeInstanceOf(PasskeyError)
    await expect(
      enrollPasskey(
        { vaultName: "v", label: "x", exclude: [] },
        fakeApi({ create: { results: { first: randomBytes(16) } } }).api
      )
    ).rejects.toBeInstanceOf(PasskeyError)
  })
})

describe("browserPasskeys", () => {
  it("evaluates each allowed credential with its own salt", async () => {
    const first = output()
    const { api, calls, id } = fakeApi({ get: { results: { first } } })
    const other = toBase64Url(randomBytes(16))
    const salts = [toBase64Url(randomBytes(32)), toBase64Url(randomBytes(32))]
    const answer = await browserPasskeys(api).evaluate([
      { id, salt: salts[0]! },
      { id: other, salt: salts[1]! },
    ])
    expect(answer).toEqual({ id, output: first })
    const byCredential = calls.get[0]!.publicKey!.extensions!.prf!.evalByCredential!
    expect(new Uint8Array(byCredential[other]!.first as Uint8Array)).toEqual(fromBase64Url(salts[1]!))
  })
})
