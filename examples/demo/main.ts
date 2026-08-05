import { greet } from '../../src/index';

const app = document.getElementById('app');
if (app) {
  app.innerText = greet('Developer');
}