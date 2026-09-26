/**
 * ⚠️ **Neutralised by the backend cutover — this hook no longer does anything.**
 *
 * It wrote a month of orders for a newly registered shopper. An order is only created by a paid checkout now, and the server seed already provides 242 of them.
 *
 * Kept as a no-op with its original shape so its caller needs no edit, and so
 * this note sits where the next person will look. Delete both together once the
 * screen stops referencing it.
 */
export function useDemoSeed() {
  // Intentionally does nothing. See the note above.
}
