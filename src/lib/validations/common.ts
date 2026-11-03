import { z } from "zod";

/** Generic database id (cuid) coming from the client. Still verified against the DB. */
export const idSchema = z.string().min(1).max(100);