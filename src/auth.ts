import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { isAllowedWorkspaceDomain } from "@/lib/auth/domain";
import type { GoogleProfile } from "next-auth/providers/google";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/auth/session-policy";

const allowedDomain = process.env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN ?? "";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // FR-02/FR-03/T-27: reject any Google account outside the company Workspace domain.
    async signIn({ profile, account }) {
      if (account?.provider !== "google") return false;
      return isAllowedWorkspaceDomain(profile as GoogleProfile | undefined, allowedDomain);
    },
    // Expose id + role to server-side session consumers (requireRole, NFR-02).
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
      return session;
    },
    // NFR-04: gate every route except the public sign-in surface. Auth.js's
    // database session strategy already drops sessions once `expires` (set
    // from SESSION_MAX_AGE_SECONDS/SESSION_UPDATE_AGE_SECONDS above) is in
    // the past, so an inactivity-expired session lands here as `auth: null`.
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api/auth");
      if (isPublic) return true;
      return Boolean(auth?.user);
    },
  },
});
