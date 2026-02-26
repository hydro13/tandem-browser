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
        // Try to find the content in shadow roots
        const allElements = document.querySelectorAll('*');
        let shadowContent = '';
        for (const el of allElements) {
          if (el.shadowRoot) {
            shadowContent += el.shadowRoot.innerHTML;
          }
        }
        return {
          bodyText: document.body.innerText.length,
          shadowTextLen: shadowContent.length
        };
      })()
    `;
    console.log('Fetching shadow root content...');
    const res = await doFetch('http://localhost:8765/execute-js', 'POST', { code });
    console.log('Result:', res.result);
  } catch (err) {
    console.error(err);
  }
}
run();
