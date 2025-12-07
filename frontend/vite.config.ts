// vite.config.ts
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

function executorSchemasPlugin(): Plugin {
  const VIRTUAL_ID = "virtual:executor-schemas";
  const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;

  return {
    name: "executor-schemas-plugin",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID; // keep it virtual
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;

      const schemasDir = path.resolve(__dirname, "../shared/schemas");
      const files = fs.existsSync(schemasDir)
        ? fs.readdirSync(schemasDir).filter((f) => f.endsWith(".json"))
        : [];

      const imports: string[] = [];
      const entries: string[] = [];

      files.forEach((file, i) => {
        const varName = `__schema_${i}`;
        const importPath = `shared/schemas/${file}`; // uses your alias
        const key = file.replace(/\.json$/, "").toUpperCase(); // claude_code -> CLAUDE_CODE
        imports.push(`import ${varName} from "${importPath}";`);
        entries.push(`  "${key}": ${varName}`);
      });

      // IMPORTANT: pure JS (no TS types), and quote keys.
      const code = `
${imports.join("\n")}

export const schemas = {
${entries.join(",\n")}
};

export default schemas;
`;
      return code;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    sentryVitePlugin({
      org: "bloop-ai",
      project: "vibe-kanban",
      telemetry: false,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
    executorSchemasPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      shared: path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: parseInt(process.env.FRONTEND_PORT || "3000"),
    allowedHosts: ['.local'],
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.BACKEND_PORT || "3001"}`,
        changeOrigin: true,
        ws: true,
      }
    },
    fs: {
      allow: [path.resolve(__dirname, "."), path.resolve(__dirname, "..")],
    },
    open: process.env.VITE_OPEN === "true",
  },
  optimizeDeps: {
    exclude: ["wa-sqlite"],
  },
  build: {
    sourcemap: true,
    // Set chunk size warning limit to 2000kb since we've implemented:
    // 1. Lazy loading for all route components
    // 2. Manual chunking strategy splitting vendors into 15+ chunks
    // 3. Code splitting via dynamic imports
    // The large vendor chunks are only loaded on-demand when routes are accessed
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core vendor chunks
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }

            // UI libraries (shadcn, radix-ui, etc.)
            if (id.includes('@radix-ui') || id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind')) {
              return 'vendor-ui';
            }

            // Form libraries
            if (id.includes('@tanstack/react-form') || id.includes('@rjsf') || id.includes('zod')) {
              return 'vendor-forms';
            }

            // Rich text editor (Lexical)
            if (id.includes('lexical') || id.includes('@lexical')) {
              return 'vendor-editor';
            }

            // Code/diff viewing (CodeMirror is large)
            if (id.includes('codemirror') || id.includes('@uiw/react-codemirror')) {
              return 'vendor-codemirror';
            }

            // Git diff viewing (separate from codemirror)
            if (id.includes('@git-diff-view')) {
              return 'vendor-git-diff';
            }

            // Virtualization libraries
            if (id.includes('react-window') || id.includes('react-virtuoso') || id.includes('@virtuoso')) {
              return 'vendor-virtualization';
            }

            // Analytics and monitoring
            if (id.includes('sentry') || id.includes('posthog')) {
              return 'vendor-analytics';
            }

            // i18n
            if (id.includes('i18next')) {
              return 'vendor-i18n';
            }

            // Database/state
            if (id.includes('@tanstack/react-query') || id.includes('@tanstack/electric') || id.includes('@tanstack/react-db') || id.includes('zustand')) {
              return 'vendor-state';
            }

            // Motion/animation
            if (id.includes('framer-motion') || id.includes('embla-carousel')) {
              return 'vendor-animation';
            }

            // DnD
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd';
            }

            // Icons (lucide and simple-icons can be large)
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }

            if (id.includes('simple-icons')) {
              return 'vendor-simple-icons';
            }

            // Lodash (utility library, can be large)
            if (id.includes('lodash')) {
              return 'vendor-lodash';
            }

            // Web companion and other Vibe-specific libs
            if (id.includes('vibe-kanban-web-companion') || id.includes('wa-sqlite')) {
              return 'vendor-vibe-specific';
            }

            // Utility libraries
            if (id.includes('click-to-react-component') || id.includes('react-hotkeys-hook') ||
                id.includes('react-dropzone') || id.includes('react-use-websocket') ||
                id.includes('react-resizable-panels') || id.includes('rfc6902') ||
                id.includes('fancy-ansi')) {
              return 'vendor-utils';
            }

            // Devtools (can be large in production builds)
            if (id.includes('@tanstack/react-devtools') || id.includes('@tanstack/react-form-devtools')) {
              return 'vendor-devtools';
            }

            // Modal management
            if (id.includes('nice-modal-react')) {
              return 'vendor-modal';
            }

            // Other smaller dependencies - split by first package namespace
            // This helps prevent a single massive misc chunk
            if (id.includes('@ebay/')) return 'vendor-ebay';
            if (id.includes('@types/')) return 'vendor-types';

            // Remaining misc
            return 'vendor-misc';
          }
        },
      },
    },
  },
});
