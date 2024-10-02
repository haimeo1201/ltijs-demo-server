FROM node:current-alpine

WORKDIR /usr/src/app

COPY . .

ENV DEBUG=provider:*

RUN npm install

EXPOSE 8080

CMD [ "node", "index.js" ]