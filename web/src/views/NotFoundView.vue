<template>
  <main class="nf-page">
    <div class="nf-box">
      <p class="nf-brand"><i class="pi pi-compass" aria-hidden="true" /> Tripper</p>
      <div class="card nf-card">
        <i class="pi pi-map" aria-hidden="true" />
        <h1>Page not found</h1>
        <p>The page you're looking for doesn't exist or has moved.</p>
        <RouterLink to="/">Back to trips</RouterLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.nf-page {
  min-height: calc(100vh - 2rem);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
}
.nf-box {
  width: 100%;
  max-width: 22rem;
}
.nf-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  margin: 0 0 1rem;
  color: var(--app-primary);
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: -0.01em;
}
.nf-card {
  text-align: center;
  padding: 2rem 1.5rem;
}
.nf-card > i {
  font-size: 2rem;
  color: var(--app-text-muted);
}
.nf-card h1 { margin: 0.75rem 0 0.375rem; }
.nf-card p { margin: 0 0 1rem; color: var(--app-text-muted); }
</style>
