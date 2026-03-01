FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING
ENV NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING=$NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING
ARG NEXT_PUBLIC_AUTH_CLIENT_ID
ENV NEXT_PUBLIC_AUTH_CLIENT_ID=$NEXT_PUBLIC_AUTH_CLIENT_ID
ARG NEXT_PUBLIC_AUTH_AUTHORITY
ENV NEXT_PUBLIC_AUTH_AUTHORITY=$NEXT_PUBLIC_AUTH_AUTHORITY
ARG NEXT_PUBLIC_API_SCOPE
ENV NEXT_PUBLIC_API_SCOPE=$NEXT_PUBLIC_API_SCOPE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
