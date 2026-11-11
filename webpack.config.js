const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const mode = argv.mode === 'production' ? 'production' : 'development';

  var config = {
    mode,

    entry: {
      app: path.resolve(__dirname, 'src/index.tsx'),
      'ocr-poc': path.resolve(__dirname, 'src/ocr/poc.tsx'),
    },

    output: {
      path: path.join(__dirname, 'dist'),
      publicPath: mode === 'production' ? '/batch-csv/' : '/',
      chunkFilename:
        mode === 'development' ? '[name].js' : '[name]-[fullhash].js',
      filename: mode === 'development' ? '[name].js' : '[name]-[fullhash].js',
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [{ loader: 'ts-loader' }],
        },
        {
          test: /\.js$/,
          use: [
            {
              loader: 'babel-loader',
            },
          ],
          exclude: '/node_modules',
        },
        {
          test: /\.scss$/,
          use: [
            'style-loader',
            {
              loader: '@teamsupercell/typings-for-css-modules-loader',
            },
            {
              loader: 'css-loader',
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[fullhash:base64:3]',
                },
                url: false,
              },
            },
            {
              loader: 'sass-loader',
              options: {},
            },
          ],
        },
      ],
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: path.join(__dirname, 'src/index.html'),
        chunks: ['app'],
      }),
      new HtmlWebpackPlugin({
        filename: 'ocr-poc.html',
        template: path.join(__dirname, 'src/ocr/poc.html'),
        chunks: ['ocr-poc'],
      }),
    ],

    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      //   fallback: {
      //     fs: false,
      //     buffer: require.resolve('buffer'),
      //     http: require.resolve('stream-http'),
      //     https: require.resolve('https-browserify'),
      //     zlib: require.resolve('browserify-zlib'),
      //   },
    },
  };

  if (mode === 'development') {
    config.devServer = {
      historyApiFallback: true,
      static: path.join(__dirname, 'dist'),
      // publicPath: 'http://localhost:9000',
      port: process.env.GD_WEB_SERVER_PORT,
      open: true,
    };
  }

  if (mode === 'production') {
    config.optimization = {
      minimize: true,
      minimizer: [new TerserPlugin()],
    };
  }

  return config;
};
