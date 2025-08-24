import { PrismaClient } from '@prisma/client'
import { env } from '@acme/core'

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined
}

export const prisma: PrismaClient = globalThis.prismaGlobal ?? new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
})

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

