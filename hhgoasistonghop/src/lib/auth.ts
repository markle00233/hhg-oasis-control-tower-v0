import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resolveFeatureFlags, type FeatureCode } from "@/config/features";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      department: string;
      features: Record<FeatureCode, boolean>;
    };
  }
  interface User {
    role: string;
    department: string;
    features: Record<FeatureCode, boolean>;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    department: string;
    features: Record<FeatureCode, boolean>;
  }
}

const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "hhgo-oasis-crm-demo-auth-secret-change-me-32b";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  features: Record<FeatureCode, boolean>;
};

function toAuthUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department?: string | null;
  featureFlags?: unknown;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    department: user.department || "OPS_A",
    features: resolveFeatureFlags(user.role, user.featureFlags),
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authSecret,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Tài khoản", type: "text" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        try {
          const login = String(credentials?.email || "").trim();
          const password = String(credentials?.password || "");
          if (!login || !password) return null;

          if (!process.env.DATABASE_URL) {
            console.error("[auth] DATABASE_URL is missing");
            return null;
          }

          const user = await prisma.user.findFirst({
            where: {
              OR: [{ email: login }, { email: login.toLowerCase() }],
              isActive: true,
            },
          });
          if (!user) return null;

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          return toAuthUser(user);
        } catch (err) {
          console.error("[auth] authorize failed:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.department = user.department || "OPS_A";
        token.features = user.features;
      } else if (token.id && (trigger === "update" || !token.features)) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: String(token.id) },
            select: { role: true, featureFlags: true, department: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            token.department = dbUser.department || "OPS_A";
            token.features = resolveFeatureFlags(dbUser.role, dbUser.featureFlags);
          }
        } catch {
          /* keep token */
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email!;
      session.user.name = token.name!;
      session.user.role = token.role;
      session.user.department = token.department || "OPS_A";
      session.user.features =
        token.features || resolveFeatureFlags(token.role, null);
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
});

export function canWrite(role: string) {
  return role === "ADMIN" || role === "STAFF";
}

export function canReadOnly(role: string) {
  return role === "VIEWER" || role === "MANAGER";
}

export function canManageSettings(role: string) {
  return role === "ADMIN";
}

export function isAdmin(role: string) {
  return role === "ADMIN";
}

export function canAccessInternal(role: string) {
  return role === "ADMIN";
}

export function sessionHasFeature(
  session: { user?: { role?: string; features?: Record<string, boolean> } } | null,
  code: FeatureCode
) {
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;
  return !!session.user.features?.[code];
}
