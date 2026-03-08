#!/bin/sh
# Generate runtime env-config.js from container environment variables.
# This runs at container startup (before nginx) so that the frontend
# can read configuration without baking it into the JS bundle.

cat <<EOF > /usr/share/nginx/html/env-config.js
window.__ENV__ = {
  BFF_URL: "${BFF_URL:-}",
  ENABLE_GRAPH_DIRECT_FALLBACK: "${ENABLE_GRAPH_DIRECT_FALLBACK:-false}",
  GRAPH_CACHE_REFRESH_MS: "${GRAPH_CACHE_REFRESH_MS:-5000}",
  ALLOW_DEMO_CONSTRAINT_OVERRIDE: "${ALLOW_DEMO_CONSTRAINT_OVERRIDE:-false}"
};
EOF

exec "$@"
