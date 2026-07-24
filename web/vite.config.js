import vue from '@vitejs/plugin-vue'
export default {
  plugins: [vue()],
  server: { proxy: { '/api': process.env.API_PROXY || 'http://localhost:3000' } },
  test: { environment: 'happy-dom', setupFiles: ['./src/test-setup.js'] }
}
