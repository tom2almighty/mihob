import { useCallback, useSyncExternalStore } from "react"

export type TrafficDisplayMode = "used" | "remaining"

const STORAGE_KEY = "mihob_node_traffic_mode"
const CHANGE_EVENT = "mihob:node-traffic-mode-change"

function readStoredMode(): TrafficDisplayMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "remaining" ? "remaining" : "used"
  } catch {
    return "used"
  }
}

function subscribe(callback: () => void): () => void {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) {
      callback()
    }
  }
  window.addEventListener("storage", handleStorage)
  window.addEventListener(CHANGE_EVENT, callback)
  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(CHANGE_EVENT, callback)
  }
}

export function setNodeTrafficDisplayMode(mode: TrafficDisplayMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useNodeTrafficDisplayMode(): [
  TrafficDisplayMode,
  (next: TrafficDisplayMode) => void,
] {
  const mode = useSyncExternalStore<TrafficDisplayMode>(subscribe, readStoredMode, () => "used")
  const setMode = useCallback((next: TrafficDisplayMode) => {
    setNodeTrafficDisplayMode(next)
  }, [])
  return [mode, setMode]
}
