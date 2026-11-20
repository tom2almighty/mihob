import { useState, type DragEvent } from "react"

export function useDragReorder<T extends { id: number }>({
  items,
  enabled,
  onReorder,
}: {
  items: T[]
  enabled: boolean
  onReorder: (nextItems: T[], nextIds: number[]) => void
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)

  const getRowDragProps = (id: number) => ({
    draggable: enabled,
    onDragStart: (e: DragEvent) => {
      if (!enabled) return
      setDraggingId(id)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", String(id))
    },
    onDragOver: (e: DragEvent) => {
      if (!enabled || draggingId === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      if (overId !== id) {
        setOverId(id)
      }
    },
    onDrop: (e: DragEvent) => {
      if (!enabled || draggingId === null) return
      e.preventDefault()
      const fromIndex = items.findIndex((item) => item.id === draggingId)
      const toIndex = items.findIndex((item) => item.id === id)
      setDraggingId(null)
      setOverId(null)
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return
      const next = [...items]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      onReorder(
        next,
        next.map((item) => item.id)
      )
    },
    onDragEnd: () => {
      setDraggingId(null)
      setOverId(null)
    },
  })

  return {
    draggingId,
    overId,
    getRowDragProps,
  }
}
