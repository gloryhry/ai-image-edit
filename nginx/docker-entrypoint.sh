#!/bin/sh
set -e

# Generate runtime config from environment variables
cat > /usr/share/nginx/html/config.js << EOF
window.__ENV__ = {
  VITE_SUPABASE_URL: '${VITE_SUPABASE_URL:-}',
  VITE_SUPABASE_ANON_KEY: '${VITE_SUPABASE_ANON_KEY:-}',
};
EOF

exec "$@"
