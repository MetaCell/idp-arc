ARG CLOUDHARNESS_FRONTEND_BUILD
FROM ${CLOUDHARNESS_FRONTEND_BUILD} AS build

WORKDIR /app
COPY frontend/package.json ./
COPY frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
# Baked into the bundle by Vite at build time; the Codefresh pipeline passes them as build arguments.
# `bucket` sends uploads to VITE_UPLOAD_BUCKET_URL instead of EMBER-DANDI (the default).
ARG VITE_UPLOAD_BACKEND
ENV VITE_UPLOAD_BACKEND=${VITE_UPLOAD_BACKEND}
ARG VITE_UPLOAD_BUCKET_URL
ENV VITE_UPLOAD_BUCKET_URL=${VITE_UPLOAD_BUCKET_URL}
# EMBER-DANDI OAuth application (public client, PKCE) registered for this IDP origin.
ARG VITE_EMBER_CLIENT_ID
ENV VITE_EMBER_CLIENT_ID=${VITE_EMBER_CLIENT_ID}
RUN yarn build

FROM nginxinc/nginx-unprivileged:stable-alpine

USER root
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build --chown=101:101 /app/dist/ /usr/share/nginx/html/
COPY --chown=101:101 deploy/resources/default.conf /etc/nginx/conf.d/default.conf
USER 101

EXPOSE 8080