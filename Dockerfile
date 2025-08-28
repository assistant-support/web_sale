# Base image
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i; \
  else echo "Lockfile not found." && exit 1; \
  fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .


# COPY .env.production.sample .env.production
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
ENV NODE_OPTIONS=--openssl-legacy-provider
ENV NODE_ENV=production
# Cấu hình biến môi trường cho Mongoose và các biến khác
ENV MONGODB_URI="mongodb+srv://assistantsupdev:658XsWFO3aTZlzzH@web-ts.rlqlmxg.mongodb.net/web-ts"
ENV JWT_SECRET="A1412I8400R"
ENV GOOGLE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCaj27QQCgs37NH\nK5nVYClObEX6FudN11ikJoGb2d+spYaIT/9vAjj91Q7n/8uXlYNVWKS6po3LIqeH\nl1AT7yIlvaE+dztMq6zzRlsP8YvoGOWziE/wlPJF7icBfE1YtWih/MvIoQaBvp6I\nkpw5jUrxhlAd2DKxH4OnV6HsIoNIoBb3yKTPfhxfROuR/0uPT6V/y9TYWURo3rfF\nOC/lHwhIzlE2Z4G0BHRJVRylSbpMbPgpKfU7EQirq1pP9daxdz0WcrqBYC3h62ub\nJ6ycVwT8j4th3GNh1s5CXCqa2krpTmxUEbTCAbcgoMD/UWlbgq/evS4CF3suQJpT\njsHQjLJbAgMBAAECggEACBIBOUKAVod/tvGh4LBat8uTg9F6VmguKrQQBHFF6p/h\n/HAg6Ez3aNmdI6QJn2qhJu2v/EcCFF9E3CGcfs33vHzAVKCpKgG00CcWTijQo1fZ\ndpxhgDBmzhv3UW6KI12ljv/CLEGsM04evQbavW6RQTdAK67ERtdcanp66/eJX1tX\n0cljnVAlkzFi1Ctl89Ikc/arq6iEbIKczmlDC3QE3qEcqZhC68/9z0whdoe2nSje\nqR5oGwg1uHUrECelzoK0gkmUvdszRpSlWF1I0TqqXJuIZKdPzKRzbxk8nXXYQn6M\nOgPa7zYbbpCHwgY5GFrRkDB3mfDmH65FV2y/vPNBYQKBgQDHDIkcyijExPy+TU1z\nyWVdw5lpeOOANAkpKq9NUUMA+s0+KoRMSnYy8V4RnD5OmFbXdm6YjLdVBMLw727K\nxa4VDUFRPLLXiAQ/8YKs1/5jrIzanF5G7iKrbEkp2zm24+jhqQmUmTyNhVReq9u8\neov0MmQVVeRiYJ4XEz9MI9JAYwKBgQDGyEvYUHXkmB2IkeG2UQ4E2NcHZu1OhzKF\nsxE6zMkArEQoPVe5Xynjb3W25j6nosTlv6tC1rlm/x4C8BwSMXhvVJhF2bP8S9g2\nzwCguEQDXjt4pmTKnPrmkrHrv+RghsHz9WMGC6p7ZglUhPw/6X+kQdD1LqGC/XvV\nkKZNTL9bqQKBgDtN6tQfD0KBBmSUl4z15jOngV/BWtbpqgkP5Kb+nR3/m4L4G+63\nCLxo2YQZrx6vmMAdUxo0YrL79jDexX24pAM1rc5MbWR16/45MJvaxrpfwJ+pkxVD\nAiVc3/eOj4WEJfCF8orJlRb9MIP8ZD2lrWkWUmdg7ei5rKBnZaaDzbLNAoGBALql\nl5Gk+w2JRzHUyHrH4MHsWPs6SdhSWb3wRV1Qq+tV1Slzb8s+77X+EimKR4pf60FO\nlyBLPgrXwPZBPhpXGR5v8AqmP7nF/V55P72pRzNiZ7UBh+I3Q978HtOdenKoFbVb\n0375tTnotRoHRFM+i/tPUUTmZAD6wivlhkFOrt8BAoGBAKIZLPRr35ulqvKXwVOz\nDur/3sgr/dB9PMoG4UIGnujJgltVcL8FU1zhzVRP0k6kINX0xO8I6JYVD1DL1P7u\nBHRpVHkCDgwvjcZthoVXu9oZDUa7qlCGghxEJv+BUiIHvNM8/o9SwL1XXCP5kBc4\n50SEJBVXwva69G/ZdU1PIkAW\n-----END PRIVATE KEY-----\n'
ENV GOOGLE_PROJECT_ID="systemair-441909"
ENV token='sys1'
ENV GOOGLE_CLIENT_EMAIL='air-900@systemair-441909.iam.gserviceaccount.com'
ENV URL="http://localhost:4001/"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 4001

ENV PORT=4001
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]