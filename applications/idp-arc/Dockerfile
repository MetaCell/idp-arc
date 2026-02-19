ARG CLOUDHARNESS_FRONTEND_BUILD
FROM ${CLOUDHARNESS_FRONTEND_BUILD} AS build

WORKDIR /app
COPY frontend/package.json ./
COPY frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
RUN yarn build

FROM nginxinc/nginx-unprivileged:stable-alpine

USER root
RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/dist/ /usr/share/nginx/html/

USER 101
EXPOSE 8080
