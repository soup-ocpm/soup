FROM node:alpine

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN apk add --no-cache curl
RUN npm install -g @angular/cli
RUN npm install --force

CMD ["ng", "serve", "--host", "0.0.0.0", "--disable-host-check"]

