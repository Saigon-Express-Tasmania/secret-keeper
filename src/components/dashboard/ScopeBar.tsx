import { useFinder } from "@/components/dashboard/finderContext"
import { pathBasename } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-5 max-w-48 truncate rounded-[5px] px-2 text-[12px] outline-none focus-visible:ring-[3px] focus-visible:ring-mac-focus",
        active ? "bg-black/10 font-semibold text-mac-label dark:bg-white/15" : "text-mac-label-2 hover:bg-mac-hover"
      )}
    >
      {children}
    </button>
  )
}

/** Finder search scope bar: whole vault or the folder the search began in. */
export function ScopeBar() {
  const c = useFinder()
  const { scope, scopeDir } = c.state.search
  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-mac-separator bg-mac-content px-3 select-none">
      <span className="text-[12px] text-mac-label-2">Search:</span>
      <Chip active={scope === "vault" || scopeDir === ""} onClick={() => c.dispatch({ type: "setSearch", scope: "vault" })}>
        {c.vaultName}
      </Chip>
      {scopeDir !== "" ? (
        <Chip active={scope === "folder"} onClick={() => c.dispatch({ type: "setSearch", scope: "folder" })}>
          {`“${pathBasename(scopeDir)}”`}
        </Chip>
      ) : null}
    </div>
  )
}
