import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.', // ensure correct root
  build: {
    rollupOptions: {
      input: './index.html' // explicit entry point
    }
  }
});