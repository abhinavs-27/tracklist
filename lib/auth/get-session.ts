import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/** One `getServerSession` per request (RSC layout + page + API helpers that share this module). */
export const getSession = cache(async () => getServerSession(authOptions));
