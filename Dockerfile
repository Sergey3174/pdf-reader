FROM nginx:1.25-alpine AS build

WORKDIR /app
RUN apk add --no-cache brotli gzip
COPY build/ /app/

# Сжимаем .js, .css, .html, .json, .svg и т.п.
RUN find . -type f \( -iname '*.js' -o -iname '*.css' -o -iname '*.html' -o -iname '*.json' -o -iname '*.svg' \) -exec brotli --best --keep {} \; \
 && find . -type f \( -iname '*.js' -o -iname '*.css' -o -iname '*.html' -o -iname '*.json' -o -iname '*.svg' \) -exec gzip -k -f -9 {} \;

FROM nginx:1.25-alpine

COPY --from=build /app/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
