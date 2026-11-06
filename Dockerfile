# 构建：docker build -t <registry>/kk-ai-hub-bi:<tag> .
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json server.js reset-admin.js ./
COPY server ./server
COPY web ./web
COPY docs ./docs
# data/ 由宿主机挂载（db.json、files/solution.pptx），升级不丢数据
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
