import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, del, post, type ProjectRow } from "../../../lib/api";
import { appKeys } from "../../runs/_services/run-keys";

export interface ForwardRow {
  id: string;
  trace_ids: string[];
  status: string;
  error: string | null;
  created_ms: number;
  span_count: number;
  redactions: number;
}

export function useProjects() {
  return useQuery({ queryKey: appKeys.projects, queryFn: () => api<{ projects: ProjectRow[] }>("/api/projects") });
}

export function useForwards() {
  return useQuery({ queryKey: appKeys.forwards, queryFn: () => api<{ forwards: ForwardRow[] }>("/api/forwards") });
}

/** Saves settings and refreshes everything that depends on them. */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: Record<string, unknown>; message?: string }) => post("/api/settings", v.body),
    onSuccess: (_d, v) => toast.success(v.message ?? "Settings saved"),
    onError: (e) => toast.error(`Couldn't save settings: ${(e as Error).message}`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: appKeys.status });
      void qc.invalidateQueries({ queryKey: appKeys.projects });
    },
  });
}

export function useKeyActions(path: string, name: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: appKeys.status });
  return {
    store: useMutation({
      mutationFn: (key: string) => post<{ stored_in: string }>(path, { key }),
      onSuccess: (r) => toast.success(`${name} API key stored in the ${r.stored_in === "keychain" ? "macOS Keychain" : "Bolts key file"}`),
      onError: (e) => toast.error(`Couldn't store the ${name} key: ${(e as Error).message}`),
      onSettled: refresh,
    }),
    remove: useMutation({ mutationFn: () => del(path), onSuccess: () => toast.success(`${name} API key removed`), onSettled: refresh }),
  };
}

export function useLayaAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "install" | "restart" | "stop") => post(`/api/classifier/laya`, { action }),
    onError: (e) => toast.error(`Couldn't change Laya: ${(e as Error).message}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: appKeys.status }),
  });
}
