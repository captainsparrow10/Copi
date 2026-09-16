import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local embeddings (lib/rag/embed.ts) run ONNX models through native bindings,
  // which must be loaded from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  // Transformers.js loads onnxruntime-node dynamically, so file tracing misses it:
  // include it explicitly in the API routes that embed text.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/lib/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*",
      "./node_modules/onnxruntime-common/**/*",
    ],
  },
  // Serverless functions run on linux x64: drop the other platforms' ONNX Runtime
  // binaries and the browser build so the function stays under the size limit.
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
      "./node_modules/onnxruntime-web/**/*",
    ],
  },
};

export default nextConfig;
