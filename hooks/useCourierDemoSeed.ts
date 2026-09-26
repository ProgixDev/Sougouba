import type { Courier } from '@/data/types';
/**
 * ⚠️ **Neutralised by the backend cutover — this hook no longer does anything.**
 *
 * It fabricated a delivery history and a rating for a newly approved courier so the Courses and Gains tabs would not open empty. Against a real database that writes a reputation nobody earned — `delivery_count` is incremented by `delivery_complete`, once, per actual delivery. The server seed already gives eleven couriers histories.
 *
 * Kept as a no-op with its original shape so its caller needs no edit, and so
 * this note sits where the next person will look. Delete both together once the
 * screen stops referencing it.
 */
export function useCourierDemoSeed(_courier: Courier | null | undefined, _onSeeded?: () => void) {
  // Intentionally does nothing. See the note above.
}
