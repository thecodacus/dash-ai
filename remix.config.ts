import type { AppConfig } from '@remix-run/dev';

export default {
    serverBuildTarget: "node-cjs",
    server: process.env.NODE_ENV === "development" ? undefined : "./server.js",
    ignoredRouteFiles: ["**/.*"],
    appDirectory: "app",
    assetsBuildDirectory: "public/build",
    serverBuildPath: "build/index.js",
    publicPath: "/build/",
    future: {
        v2_errorBoundary: true,
        v2_meta: true,
        v2_normalizeFormMethod: true,
        v2_routeConvention: true,
    }
} as AppConfig;