/** @type {import('next').NextConfig} */
const webpack = require('webpack');

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer }) => {
    // Polyfill Node.js modules for browser (needed for Supabase)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer'),
        crypto: false,
        stream: false,
        util: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        process: require.resolve('process/browser'),
      };
      
      // Provide Buffer and process as globals
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );
    }
    
    // Mark MCP SDK and related packages as external to avoid webpack bundling issues
    if (isServer) {
      config.externals = config.externals || [];
      // Externalize MCP SDK to prevent webpack bundling (it's ESM and causes issues)
      config.externals.push({
        '@modelcontextprotocol/sdk': 'commonjs @modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/client/index.js': 'commonjs @modelcontextprotocol/sdk/client/index.js',
        '@modelcontextprotocol/sdk/client/stdio.js': 'commonjs @modelcontextprotocol/sdk/client/stdio.js',
        '@modelcontextprotocol/sdk/client/sse.js': 'commonjs @modelcontextprotocol/sdk/client/sse.js',
      });
      
      // Also mark as external using function form for better control
      const originalExternal = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternal) ? originalExternal : [originalExternal]),
        ({ request }, callback) => {
          if (request?.includes('@modelcontextprotocol')) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    
    return config;
  },
}

module.exports = nextConfig

