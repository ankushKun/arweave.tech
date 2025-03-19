import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {


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
