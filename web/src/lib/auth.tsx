import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getStoredToken, queryKeys, setStoredToken } from "./api"
import type { Admin } from "./types"

interface AuthContextValue {
  token: string | null
  admin: Admin | null
  isLoading: boolean
  loginSuccess: (token: string, admin: Admin) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  admin: null,
  isLoading: true,
  loginSuccess: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const qc = useQueryClient()

  useEffect(() => {
    const onUnauth = () => {
      setToken(null)
      qc.clear()
    }
    window.addEventListener("mihob:unauthorized", onUnauth)
    return () => window.removeEventListener("mihob:unauthorized", onUnauth)
  }, [qc])

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.me,
    enabled: Boolean(token),
    retry: false,
  })

  const loginSuccess = (nextToken: string, admin: Admin) => {
    setStoredToken(nextToken)
    setToken(nextToken)
    qc.setQueryData(queryKeys.me, admin)
  }

  const logout = () => {
    setStoredToken(null)
    setToken(null)
    qc.clear()
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        admin: meQuery.data ?? null,
        isLoading: Boolean(token) && meQuery.isLoading,
        loginSuccess,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
