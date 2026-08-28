export function getInitials(title: string): string {
  const initials = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .filter(Boolean)
    .join('')

  return initials || title.slice(0, 2).toUpperCase()
}
