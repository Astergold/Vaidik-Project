import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import pg from "pg";
import type { Config } from "../config.js";
import type { Mailer } from "../lib/mailer.js";

const ac = createAccessControl(defaultStatements);
/** The four tenant roles from handbook §7.5. Fine-grained checks live in guards.ts, not here. */
const roles = {
  owner: ac.newRole(ownerAc.statements),
  admin: ac.newRole(adminAc.statements),
  admission_head: ac.newRole(memberAc.statements),
  counsellor: ac.newRole(memberAc.statements),
};

export interface AuthDeps {
  config: Config;
  mailer: Mailer;
  /** Public self-sign-up is OFF. Only seed scripts and tests turn this on. */
  allowSignUp?: boolean;
  pool?: pg.Pool;
}

export function createAuthPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 5, options: "-c search_path=crm" });
}

export function createAuth({ config, mailer, allowSignUp = false, pool }: AuthDeps) {
  const db = pool ?? createAuthPool(config.databaseUrl);

  return betterAuth({
    appName: "Vernacular AI",
    baseURL: config.publicBaseUrl,
    secret: config.betterAuthSecret,
    database: db,
    trustedOrigins: [config.publicBaseUrl],

    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignUp,
      minPasswordLength: 10,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: "Reset your password",
          text: `Hi ${user.name},\n\nReset your password: ${url}\n\nIf you didn't ask for this, ignore this email.`,
        });
      },
    },

    // Google sign-in is for people who already exist (invited). It never creates accounts.
    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
            disableSignUp: true,
          },
        }
      : {},
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },

    user: {
      additionalFields: {
        // authoritative super-admin flag. input:false => cannot be set from any client request.
        isPlatformAdmin: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },

    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },

    advanced: {
      // ids come from crm.uuid_v7() (column defaults) — see migration 0200.
      database: { generateId: false },
      useSecureCookies: config.env === "production",
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },

    databaseHooks: {
      session: {
        create: {
          // Tenant context comes from the session. Default it to the user's oldest membership.
          before: async (session) => {
            const r = await db.query<{ organizationId: string }>(
              `select "organizationId" from crm.member where "userId" = $1 order by "createdAt" asc limit 1`,
              [session.userId],
            );
            return {
              data: { ...session, activeOrganizationId: r.rows[0]?.organizationId ?? null },
            };
          },
        },
      },
    },

    plugins: [
      organization({
        ac,
        roles,
        creatorRole: "owner",
        // Tenants are created by Laveric (platform console), never by end users.
        allowUserToCreateOrganization: false,
        sendInvitationEmail: async (data) => {
          const link = `${config.publicBaseUrl}/accept-invitation/${data.id}`;
          await mailer.send({
            to: data.email,
            subject: `You're invited to ${data.organization.name}`,
            text: `${data.inviter.user.name} invited you to join ${data.organization.name} as ${data.role}.\n\nAccept: ${link}`,
          });
        },
      }),
      // Platform-level user management/impersonation (Day 6). Authority for "super-admin" is
      // user.isPlatformAdmin; keep user.role = 'admin' in sync for those users (seed does).
      admin(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export const TENANT_ROLES = ["owner", "admin", "admission_head", "counsellor"] as const;
