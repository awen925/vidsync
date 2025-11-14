module.exports = {
  webpack: {
    configure: (webpackConfig, { paths }) => {
      const cssRules = webpackConfig.module.rules.filter(
        rule => rule.test && rule.test.test && rule.test.test('.css')
      );

      cssRules.forEach(rule => {
        if (rule.use || rule.oneOf) {
          const loaders = rule.oneOf || [rule];

          loaders.forEach(loader => {
            if (!loader.use) return;

            const postcssLoaderIndex = loader.use.findIndex(
              use =>
                (typeof use === 'string' && use.includes('postcss-loader')) ||
                (use.loader && use.loader.includes('postcss-loader'))
            );

            if (postcssLoaderIndex === -1) {
              // Add postcss-loader right after css-loader
              const cssLoaderIndex = loader.use.findIndex(
                use =>
                  (typeof use === 'string' && use.includes('css-loader')) ||
                  (use.loader && use.loader.includes('css-loader'))
              );

              if (cssLoaderIndex !== -1) {
                loader.use.splice(cssLoaderIndex + 1, 0, {
                  loader: require.resolve('postcss-loader'),
                  options: {
                    postcssOptions: {
                      plugins: [
                        require('tailwindcss'),
                        require('autoprefixer'),
                      ],
                    },
                  },
                });
              }
            } else {
              // Update existing postcss-loader options
              const postcssLoader = loader.use[postcssLoaderIndex];
              if (typeof postcssLoader === 'object') {
                postcssLoader.options = postcssLoader.options || {};
                postcssLoader.options.postcssOptions = {
                  plugins: [
                    require('tailwindcss'),
                    require('autoprefixer'),
                  ],
                };
              }
            }
          });
        }
      });

      return webpackConfig;
    },
  },
};
