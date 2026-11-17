/**
 * Three sparkles: the mark of every step that asks a language model (label, plate, dictation,
 * recipe import), so it is clear where a guess comes from. Takes the colour of its text.
 */
export function AiMark({ size = 14, className }: { size?: number; className?: string }) {
  // A four-pointed star around (x, y) with radius r.
  const star = (x: number, y: number, r: number) =>
    `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d={star(10, 14, 8)} />
      <path d={star(19, 5, 4)} />
      <path d={star(19.5, 19.5, 3)} />
    </svg>
  );
}
