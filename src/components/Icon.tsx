// Icons from the Material Symbols font, the same set the Stitch design uses.
// Decorative only: every icon sits next to a text label, or its button has an aria-label.

export function Icon({ name, size, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined icon ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden="true">
      {name}
    </span>
  );
}

/** First letters of a name or email, for the avatar square. */
export function initials(text?: string | null): string {
  const clean = (text ?? '').split('@')[0].replace(/[^a-zA-Z ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)) || '?';
}
