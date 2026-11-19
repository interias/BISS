// The local preview of the goals in the settings (SPEC 3). It is display only: the backend
// computes the carbs when saving (ADR-0003).

export type GoalInput = { kcal: number; protein: number; fat: number };

/** The carbs are the remainder of the kcal: (kcal − 4·Eiweiß − 9·Fett) ÷ 4, below 0 when too much. */
export const carbsRemainder = ({ kcal, protein, fat }: GoalInput) => (kcal - 4 * protein - 9 * fat) / 4;

/** The kcal that protein and fat bring alone. */
export const proteinFatKcal = ({ protein, fat }: GoalInput) => 4 * protein + 9 * fat;

/**
 * The shares of the kcal for the bar in the three colours, in this order: Eiweiß,
 * Kohlenhydrate, Fett. When protein and fat already bring more, the bar shows only those two.
 * `labels` are whole percent that add up to 100.
 */
export function goalShares(goal: GoalInput) {
  const proteinKcal = 4 * goal.protein;
  const fatKcal = 9 * goal.fat;
  const carbsKcal = Math.max(goal.kcal - proteinKcal - fatKcal, 0);
  const whole = proteinKcal + carbsKcal + fatKcal || 1;
  const widths = { protein: proteinKcal / whole, carbs: carbsKcal / whole, fat: fatKcal / whole };
  const protein = Math.round(widths.protein * 100);
  const fat = Math.round(widths.fat * 100);
  return { widths, labels: { protein, carbs: carbsKcal > 0 ? 100 - protein - fat : 0, fat } };
}

/** A whole number above 0 from a field ("2.400" counts as 2400), else null. */
export function wholeNumber(text: string) {
  const digits = text.replace(/\D/g, "");
  const value = digits ? Number(digits) : 0;
  return value > 0 ? value : null;
}
