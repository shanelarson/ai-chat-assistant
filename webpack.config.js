import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';

// Load .env variables for Webpack's DefinePlugin
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mode = process.env.NODE_ENV || 'development';
const isProd = mode === 'production';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'ws://localhost:4000';
const PUBLIC_URL = process.env.PUBLIC_URL || '/';

export default {
  mode,
  entry: path.resolve(__dirname, 'src/ui/components/index.jsx'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js',
    publicPath: PUBLIC_URL,
    clean: true
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        include: [
          path.resolve(__dirname, 'src/ui/components')
        ],
        loader: 'babel-loader',
        options: {
          presets: [
            '@babel/preset-react',
            [
              '@babel/preset-env',
              {
                targets: 'defaults'
              }
            ]
          ]
        }
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/ui/index.html'),
      inject: 'body',
      favicon: false,
      minify: isProd && {
        collapseWhitespace: true,
        removeComments: true
      },
      // Variables so that <script type="module"> in index.html is replaced
      templateParameters: {
        PUBLIC_URL
      }
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.PUBLIC_URL': JSON.stringify(PUBLIC_URL),
      'process.env.REACT_APP_API_URL': JSON.stringify(API_URL),
      'process.env.REACT_APP_SOCKET_URL': JSON.stringify(SOCKET_URL)
    })
  ],
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'dist')
    },
    host: '0.0.0.0',
    port: 1234,
    hot: true,
    open: true,
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
        secure: false,
        pathRewrite: { '^/api': '' }
      }
    },
    client: {
      overlay: true
    }
  },
  optimization: {
    splitChunks: {
      chunks: 'all'
    }
  }
};