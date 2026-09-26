/**
 * ⚠️ **Neutralised by the backend cutover — this hook no longer does anything.**
 *
 * It approved the signed-in merchant's own shop after a few seconds so a demo would not stall on the review gate. Approving a shop is an administrator's decision — audited, guarded by `AdminGuard`, and taken in the back office. `setVendorStatus` throws now rather than pretend otherwise, so `PendingApproval` should lose its button.
 *
 * Kept as a no-op with its original shape so its caller needs no edit, and so
 * this note sits where the next person will look. Delete both together once the
 * screen stops referencing it.
 */
export function useDemoShopApproval(_onApproved?: () => Promise<void> | void) {
  // The shape the two callers destructure, with both actions inert.
  return {
    approve: async () => {},
    approving: false,
    adoptDemoShop: async () => {},
    adopting: false,
  };
}
