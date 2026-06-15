/**
 * The session cookie name, in its own module so the edge middleware can import
 * it without pulling in Prisma / next/headers (which can't run on the edge).
 */
export const SESSION_COOKIE = "sg_session";
