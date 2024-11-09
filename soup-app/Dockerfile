# Build phase
FROM node:18-alpine as build

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files to install dependencies
COPY package*.json ./

# run npm install
RUN npm install --force

# Install Angular CLI globally
RUN npm install -g @angular/cli@18.2.0

# Copy the rest of the application code
COPY . .

# Build the Angular application in production mode
RUN ng build --configuration production

# Deploy phase with Nginx
FROM nginx:alpine

# Remove the nginx file html
RUN rm -rf /usr/share/nginx/html

# Copy the Nginx configuration file
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static build files from the build phase to Nginx's serving directory
COPY --from=build /usr/src/app/dist/soup-app/browser /usr/share/nginx/html

# Expose port 80 for Nginx
EXPOSE 80

# Run Nginx in the foreground (necessary for the container to keep running)
CMD ["nginx", "-g", "daemon off;"]