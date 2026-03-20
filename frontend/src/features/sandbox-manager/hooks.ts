import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Sandbox, SandboxCreateRequest } from "@/lib/types";

// ---------------------------------------------------------------------------
// List sandboxes
// ---------------------------------------------------------------------------

export function useSandboxes() {
  return useQuery({
    queryKey: ["sandboxes"],
    queryFn: () => api.getSandboxes().then((r) => r.data),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

// ---------------------------------------------------------------------------
// Create sandbox
// ---------------------------------------------------------------------------

export function useCreateSandbox() {
  const queryClient = useQueryClient();

  return useMutation<Sandbox, Error, SandboxCreateRequest>({
    mutationFn: (request) => api.createSandbox(request).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete sandbox
// ---------------------------------------------------------------------------

export function useDeleteSandbox() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.deleteSandbox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Upload DAR
// ---------------------------------------------------------------------------

export function useUploadDar() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { sandboxId: string; dar: File }>({
    mutationFn: ({ sandboxId, dar }) => api.uploadDar(sandboxId, dar),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Allocate party
// ---------------------------------------------------------------------------

export function useAllocateParty() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { sandboxId: string; partyName: string }>({
    mutationFn: ({ sandboxId, partyName }) =>
      api.allocateParty(sandboxId, partyName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Reset sandbox
// ---------------------------------------------------------------------------

export function useResetSandbox() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.resetSandbox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
    },
  });
}
