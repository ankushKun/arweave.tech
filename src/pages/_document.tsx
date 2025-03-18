import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";
import { useEffect } from "react";

export default function Document() {
  // useEffect(() => {
  //   // Analytics initialization - just copy this entire script tag to any project
  //   (function () {
  //     // Configuration
  //     const ANALYTICS_CONFIG = {
  //       src: 'https://analytics_arlink.ar.io/browser.js',
  //       processId: 'RmDxZQfRIn2tmpLIgFr70P3nXTGiRBNT6OL4LWOoJPo',
  //       trackUrlHashes: true,
  //       debug: true
  //     };

  //     // Wait for DOM to be ready
  //     function init() {
  //       console.log('init analytics');
  //       const script = document.createElement('script');
  //       script.type = 'module';
  //       script.src = ANALYTICS_CONFIG.src;
  //       script.setAttribute('data-process-id', ANALYTICS_CONFIG.processId);
  //       script.setAttribute('data-track-url-hashes', ANALYTICS_CONFIG.trackUrlHashes.toString());
  //       script.setAttribute('data-debug', ANALYTICS_CONFIG.debug.toString());
  //       document.body.appendChild(script);
  //     }

  //     // Handle different loading states
  //     // document.addEventListener('DOMContentLoaded', init);
  //     // if (document.readyState === 'loading') {
  //     // } else {
  //     init();
  //     // }
  //   })();
  // }, [])

  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/svg+xml" href="/ar.svg" />
        <Script type="module" src="https://analytics_arlink.ar.io/browser.js"
          data-process-id="RmDxZQfRIn2tmpLIgFr70P3nXTGiRBNT6OL4LWOoJPo"
          data-track-url-hashes="true"
          data-debug="true">
        </Script>
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
