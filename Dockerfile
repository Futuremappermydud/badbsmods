FROM node:20-alpine

WORKDIR /app

COPY package.json .
COPY package-lock.json .
COPY tsconfig.json .
COPY src/ src/
COPY assets/ assets/

RUN npm i
RUN npm run build
RUN npm prune --omit=dev

ARG GIT_REPO
ARG GIT_VERSION
LABEL org.opencontainers.image.source=${GIT_REPO}
ENV GIT_VERSION=${GIT_VERSION}

EXPOSE 5001

CMD ["npm", "run", "start_built"]