import { useState } from "react"
import { Icon } from "@iconify/react"

import { isKnownIconId, defaultIconForKind } from "@/lib/icons/catalog"
import { externalIconUrl } from "@/lib/icons/external"
import { cn } from "@/lib/utils"

type NodeIconProps = {
  /**
   * Catalog id like `fluent-color:document-16`, an `https://` image URL,
   * or undefined for default.
   */
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
  const imageUrl =
    iconId && !isKnownIconId(iconId) ? externalIconUrl(iconId) : null

  // Remember which URL failed so a new URL gets a fresh attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (imageUrl && imageUrl !== failedUrl) {
    // Plain <img> only: images load in secure static mode (no scripts, no
    // sub-resources), see lib/icons/external.ts.
    return (
      <img
        src={imageUrl}
        width={size}
        height={size}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailedUrl(imageUrl)}
        className={cn("shrink-0 object-contain", className)}
        style={{ width: size, height: size }}
      />
    )
  }

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
