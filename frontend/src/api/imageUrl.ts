/**
 * Build image URL with auth token for <img src> usage.
 * The /api/images/:id/file endpoint requires ?token=JWT.
 */
export function imageUrl(imageId: number): string {
  const token = localStorage.getItem("token");
  return `/api/images/${imageId}/file?token=${token}`;
}
