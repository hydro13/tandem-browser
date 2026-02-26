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
    console.log('1. Checking status...');
    const s1 = await doFetch('http://localhost:8765/passwords/status');
    console.log('Status:', s1);

    console.log('\n2. Unlocking vault with new password...');
    const unlockRes = await doFetch('http://localhost:8765/passwords/unlock', 'POST', { password: 'my-super-secret-password' });
    console.log('Unlock res:', unlockRes);

    console.log('\n3. Saving new dummy password for github.com...');
    const saveRes = await doFetch('http://localhost:8765/passwords/save', 'POST', { 
      domain: 'github.com', 
      username: 'robin', 
      payload: { password: 'mypassword123', notes: 'hello auth' } 
    });
    console.log('Save res:', saveRes);

    console.log('\n4. Suggesting passwords for github.com...');
    const suggestRes = await doFetch('http://localhost:8765/passwords/suggest?domain=github.com');
    console.log('Suggestions:', suggestRes);

  } catch (err) {
    console.error(err);
  }
}
run();
