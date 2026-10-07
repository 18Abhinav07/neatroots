import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post, type CheckRow } from "../../../lib/api";
import { appKeys } from "../../runs/_services/run-keys";

export interface ChecksResponse {
  checks: CheckRow[];
  errors: { path: string; id?: string; message: string }[];
  user_dir: string;
  project_dirs: string[];
}

export interface PreviewResult {
  checked: number;
  total: number;
  hits: { trace_id: string; probability: number | null; root_name: string | null }[];
  hit_rate: number | null;
  truncated: boolean;
}

export function useChecks() {
  return useQuery({ queryKey: appKeys.checks, queryFn: () => api<ChecksResponse>("/api/checks") });
}

export function useCheckActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: appKeys.checks });
  return {
    toggle: useMutation({ mutationFn: (v: { id: string; enabled: boolean }) => post(`/api/checks/${v.id}/enabled`, { enabled: v.enabled }), onSettled: refresh }),
    remove: useMutation({ mutationFn: (id: string) => del(`/api/checks/${id}`), onSettled: refresh }),
    draft: useMutation({ mutationFn: (concern: string) => post<{ yaml: string }>("/api/checks/draft", { concern }) }),
    preview: useMutation({ mutationFn: (yaml: string) => post<PreviewResult>("/api/checks/preview", { yaml, limit: 50 }) }),
    save: useMutation({ mutationFn: (yaml: string) => post<{ id: string; path: string }>("/api/checks", { yaml }), onSettled: refresh }),
  };
}
