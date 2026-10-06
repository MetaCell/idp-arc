ARG CLOUDHARNESS_FRONTEND_BUILD
FROM ${CLOUDHARNESS_FRONTEND_BUILD} AS build

WORKDIR /app
COPY frontend/package.json ./
COPY frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
# Baked into the bundle by Vite at build time; the Codefresh pipeline passes it as a build argument.
ARG VITE_UPLOAD_BUCKET_URL
ENV VITE_UPLOAD_BUCKET_URL=${VITE_UPLOAD_BUCKET_URL}
RUN yarn build

FROM nginxinc/nginx-unprivileged:stable-alpine

USER root
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build --chown=101:101 /app/dist/ /usr/share/nginx/html/
COPY --chown=101:101 deploy/resources/default.conf /etc/nginx/conf.d/default.conf
USER 101

EXPOSE 8080