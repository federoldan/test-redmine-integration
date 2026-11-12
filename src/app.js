require('dotenv').config();

const express = require('express');
const customersRouter = require('./routes/customers');
const ordersRouter = require('./routes/orders');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`orders-service listening on port ${port}`);
});

module.exports = app;
