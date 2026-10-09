import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post, type CloudTrace, type ImportJob, type ImportSourceInfo } from "@/lib/api";

export function useImportSources() {
  return useQuery({ queryKey: ["import-sources"], queryFn: () => api<{ sources: ImportSourceInfo[] }>("/api/imports/sources"), staleTime: Infinity });
}

export function useImportJobs() {
  return useQuery({ queryKey: ["imports"], queryFn: () => api<{ jobs: ImportJob[] }>("/api/imports"), refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.state === "running") ? 1500 : false) });
}

export function useCloudTraces(enabled: boolean) {
  return useQuery({
    queryKey: ["cloud-traces"],
    queryFn: () => api<{ traces: CloudTrace[]; next_cursor: string | null }>("/api/cloud/traces"),
    enabled,
    retry: false,
  });
}

export function useImportActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["imports"] });
    void qc.invalidateQueries({ queryKey: ["cloud-traces"] });
  };
  return {
    start: useMutation({
      mutationFn: (b: { source: string; values: Record<string, string>; since_ms?: number; limit?: number; project?: string }) => post<ImportJob>("/api/imports", b),
      onSuccess: (j) => toast.success(`Importing from ${j.label}…`),
      onError: (e) => toast.error(`Couldn't start the import: ${(e as Error).message}`),
      onSettled: refresh,
    }),
    cancel: useMutation({ mutationFn: (id: string) => post(`/api/imports/${id}/cancel`), onSettled: refresh }),
    file: useMutation({
      mutationFn: (b: { name: string; content: string; project?: string }) => post<{ traces: number; spans: number; trace_ids: string[] }>("/api/imports/file", b),
      onSuccess: (r, b) => toast.success(`${b.name}: ${r.traces} run${r.traces === 1 ? "" : "s"}, ${r.spans} spans`),
      onError: (e, b) => toast.error(`${b.name}: ${(e as Error).message}`),
      onSettled: () => void qc.invalidateQueries({ queryKey: ["runs"] }),
    }),
    cloud: useMutation({
      mutationFn: (trace_ids: string[]) => post<ImportJob>("/api/cloud/import", { trace_ids }),
      onSuccess: (_j, ids) => toast.success(`Importing ${ids.length} trace${ids.length === 1 ? "" : "s"} from Neatlogs Cloud…`),
      onError: (e) => toast.error(`Couldn't import: ${(e as Error).message}`),
      onSettled: refresh,
    }),
  };
}
