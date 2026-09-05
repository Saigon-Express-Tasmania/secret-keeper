import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  APP_BG_CREDIT_HREF,
  APP_BG_CREDIT_LABEL,
  AppBackdrop,
} from "@/components/AppBackdrop"
import { useVault } from "@/context/VaultContext"

export function Gate() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { unlock } = useVault()
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await unlock(password)
      navigate("/dashboard")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to unlock vault."
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <AppBackdrop priority />
      <Card className="relative w-full max-w-sm border-white/25 bg-card/90 shadow-2xl backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-5" />
            Credentials Keep
          </CardTitle>
          <CardDescription>
            Enter your master password to unlock the vault.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="master-password">Master password</Label>
              <Input
                id="master-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={busy}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="pt-6">
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Unlocking…
                </>
              ) : (
                "Unlock"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
      <a
        href={APP_BG_CREDIT_HREF}
        className="absolute right-3 bottom-3 text-xs text-white/70 underline-offset-2 hover:text-white hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        {APP_BG_CREDIT_LABEL}
      </a>
    </main>
  )
}
