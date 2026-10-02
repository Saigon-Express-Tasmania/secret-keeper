/**
 * POST /create — store a brand-new vault (frame: JSON + CKV3 blob).
 * Gated by VAULT_SETUP_CODE so strangers cannot create vaults on the bucket.
 */

import type { CreateResponse } from "../../src/shared/api"
import { MAX_BLOB_BYTES, parseCkv3, slotStructureHash } from "../../src/shared/ckv3"
import { MAX_FRAME_JSON_BYTES } from "../../src/shared/frame"
import { vaultObjectKey } from "../../src/shared/vaultName"
import { encodeAuthRecord, type AuthRecord } from "../authRecord"
import { setupCodeMatches } from "../config"
import type { Route } from "../context"
import { getBytes, getString, HttpError, jsonResponse, readFrame } from "../http"
import { makeVerifier, seal } from "../secrets"
import { issueSession, SESSION_TTL_SECONDS } from "../session"
import { PreconditionFailedError } from "../store"
import { vaultNameFrom } from "./common"

export const MAX_FRAME_BYTES = MAX_BLOB_BYTES + MAX_FRAME_JSON_BYTES + 4

export function badBlob(message: string): HttpError {
  return new HttpError(400, "bad_blob", message)
}

export const create: Route = async (ctx) => {
  if (!ctx.config.setupCode) {
    throw new HttpError(403, "setup_disabled", "Creating vaults is disabled on this server.")
  }
  const { json, blob } = await readFrame(ctx.request, MAX_FRAME_BYTES)
  if (!setupCodeMatches(ctx.config, getString(json, "setupCode", { max: 256 }))) {
    throw new HttpError(403, "bad_setup_code", "The setup code is not correct.")
  }
  const name = vaultNameFrom(json)
  const authKey = getBytes(json, "authKey", 32)
  const rkAuth = getBytes(json, "rkAuth", 32)
  const srvShare = getBytes(json, "srvShare", 32)

  let header
  try {
    header = parseCkv3(blob).header
  } catch (error) {
    throw badBlob(error instanceof Error ? error.message : "Invalid vault file.")
  }
  if (
    header.purpose !== "vault" ||
    header.rev !== 1 ||
    header.slots.some((slot) => slot.type === "email") ||
    header.passkeys ||
    header.requirePasskey
  ) {
    throw badBlob("A new vault must start at revision 1 with primary and recovery slots only.")
  }

  const record: AuthRecord = {
    vid: header.vaultId,
    rev: 1,
    kdf: header.kdf!,
    sh: await slotStructureHash(header),
    av: makeVerifier(ctx.keys, "password", header.vaultId, authKey),
    rv: makeVerifier(ctx.keys, "recovery", header.vaultId, rkAuth),
    sp: await seal(ctx.keys, [name, header.vaultId, "sp"], srvShare),
    ae: 1,
    bk: 0,
    pr: 0,
  }

  let etag: string
  try {
    ;({ etag } = await ctx.store.put(vaultObjectKey(name), blob, {
      ifNoneMatch: "*",
      meta: encodeAuthRecord(record),
    }))
  } catch (error) {
    if (error instanceof PreconditionFailedError) {
      throw new HttpError(409, "exists", "A vault with that name already exists.")
    }
    throw error
  }

  const sessionExp = ctx.nowSeconds() + SESSION_TTL_SECONDS
  const body: CreateResponse = {
    session: issueSession(ctx.keys, { n: name, vid: header.vaultId, ae: 1, exp: sessionExp }),
    sessionExp,
    etag,
    rev: 1,
  }
  return jsonResponse(201, body)
}
