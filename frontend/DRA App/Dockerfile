FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 8081
ENV EXPO_PUBLIC_API_URL=http://localhost:5000
CMD ["npx", "expo", "start", "--web", "--port", "8081", "--non-interactive"]
