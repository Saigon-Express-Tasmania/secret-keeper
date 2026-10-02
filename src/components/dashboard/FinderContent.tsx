import { useFinder } from "@/components/dashboard/finderContext"
import { FileViewer } from "@/components/dashboard/FileViewer"
import { IconView } from "@/components/dashboard/views/IconView"
import { ListView } from "@/components/dashboard/views/ListView"

/** Content area: the open file's editor, or the folder in the chosen view. */
export function FinderContent() {
  const c = useFinder()
  const { mode, path, view } = c.model
  if (mode === "file") {
    return (
      <FileViewer
        key={path}
        path={path}
        editorRef={c.editor.ref}
        onDirtyChange={c.editor.setDirty}
      />
    )
  }
  if (view === "icons") return <IconView />
  return <ListView />
}
