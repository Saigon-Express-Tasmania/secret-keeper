import { Icon } from "@iconify/react"

import { isKnownIconId, defaultIconForKind } from "@/lib/icons/catalog"
import { cn } from "@/lib/utils"

type NodeIconProps = {
  /** Catalog id like `fluent-color:document-16`, or undefined for default. */
  iconId?: string
  kind: "folder" | "file"
  className?: string
  size?: number
}

export function NodeIcon({
  iconId,
  kind,
  className,
  size = 20,
}: NodeIconProps) {
  const resolved =
    iconId && isKnownIconId(iconId) ? iconId : defaultIconForKind(kind)

  return (
    <Icon
      icon={resolved}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    />
  )
}
