/**
 * ⚠️ **Neutralised by the backend cutover — this hook no longer does anything.**
 *
 * The courier twin of the shop version, gone for the same reason: `POST /admin/couriers/:id/approve` sits behind `AdminGuard`, and a courier approving themselves is exactly what that gate exists to prevent.
 *
 * Kept as a no-op with its original shape so its caller needs no edit, and so
 * this note sits where the next person will look. Delete both together once the
 * screen stops referencing it.
 */
export function useDemoCourierApproval(_onApproved?: () => void) {
  return { approve: async () => {}, approving: false };
}
