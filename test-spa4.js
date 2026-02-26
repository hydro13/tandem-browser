const http = require('http');

async function doFetch(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TOKEN}`
      }
    };
    const req = http.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  try {
    const code = `
      (() => {
        // Find which element actually contains the 100kb of content we saw in the HTML
        const iframes = document.querySelectorAll('iframe');
        const mainEls = document.querySelectorAll('main, div');
        let biggestText = '';
        for (const el of mainEls) {
          if (el.innerText && el.innerText.length > biggestText.length) {
            biggestText = el.innerText;
          }
        }
        return {
          biggest: biggestText.length,
          biggestPreview: biggestText.substring(0, 100),
          iframes: iframes.length
        };
      })()
    `;
    console.log('Fetching DOM structure details...');
    const res = await doFetch('http://localhost:8765/execute-js', 'POST', { code });
    console.log('Result:', res.result);
  } catch (err) {
    console.error(err);
  }
}
run();
