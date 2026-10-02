/**
 * Read a secret from the terminal without echoing it (no env vars, so
 * nothing lands in shell history or the process environment).
 */

import { createInterface } from "node:readline"

export async function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) {
    // Piped input (scripts/CI): read one line.
    const rl = createInterface({ input: stdin })
    const line = await new Promise<string>((resolve) => rl.once("line", resolve))
    rl.close()
    return line
  }
  process.stdout.write(question)
  return new Promise((resolve, reject) => {
    let value = ""
    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off("data", onData)
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup()
          process.stdout.write("\n")
          resolve(value)
          return
        }
        if (char === "\u0003") {
          cleanup()
          process.stdout.write("\n")
          reject(new Error("Cancelled."))
          return
        }
        if (char === "\u007f" || char === "\b") {
          value = [...value].slice(0, -1).join("")
          continue
        }
        value += char
      }
    }
    stdin.setRawMode(true)
    stdin.setEncoding("utf8")
    stdin.resume()
    stdin.on("data", onData)
  })
}
