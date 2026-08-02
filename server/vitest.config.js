export default {
  test: {
    environment: 'node',
    fileParallelism: false,
    // Sweeps leftover tp_% schemas out of the shared tripper_test database before and
    // after every run — see server/test/global-setup.js.
    globalSetup: ['./test/global-setup.js'],
  },
}
