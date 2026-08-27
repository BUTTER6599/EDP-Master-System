const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'EDP Customer Portal V3',
    environment: 'TEST'
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`EDP Customer Portal V3 TEST listening on port ${port}`);
});
