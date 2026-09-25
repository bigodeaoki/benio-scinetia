FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY vite.config.js index.html ./
COPY src ./src
# public/ (favicon) vai para a raiz do dist no build do Vite
COPY public ./public
RUN npm run build

FROM nginx:1.27-alpine
# O template usa ${PORT} e ${BACKEND_URL}; o entrypoint do nginx gera o conf final
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY 30-resolver.sh /docker-entrypoint.d/30-resolver.sh
RUN chmod +x /docker-entrypoint.d/30-resolver.sh
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=80
ENV BACKEND_URL=http://backend:4000
EXPOSE 80
