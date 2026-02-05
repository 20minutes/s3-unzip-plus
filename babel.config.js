module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
      },
    ],
  ],
  plugins: ['@babel/plugin-transform-runtime'],
  env: {
    cjs: {
      presets: [
        [
          '@babel/preset-env',
          {
            modules: 'commonjs',
          },
        ],
      ],
      plugins: ['@babel/plugin-transform-runtime'],
    },
    esm: {
      presets: [
        [
          '@babel/preset-env',
          {
            modules: false,
          },
        ],
      ],
      plugins: ['@babel/plugin-transform-runtime'],
    },
  },
}
