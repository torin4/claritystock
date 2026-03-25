/** `public.users.role` is text; tolerate legacy casing. */
export function isAdminRole(role: string | null | undefined): boolean {
  return (role ?? '').toLowerCase() === 'admin'
}
