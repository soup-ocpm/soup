// The environment of `ng serve` and of the production build (the image): the
// browser calls the backend directly on 127.0.0.1:8080 (no proxy in nginx).
// The e2e configuration replaces this file with environment.e2e.ts (`fileReplacements`
// in angular.json).

export const environment = {
  production: false,
  // The /api/v3 routes, and the origin the URLs of the package bundles are relative to
  v3BaseUrl: 'http://127.0.0.1:8080/api/v3',
  backendOrigin: 'http://127.0.0.1:8080',
  prosLabUrl: 'https://pros.unicam.it/soup/'
};
