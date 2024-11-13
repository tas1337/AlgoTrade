require('dotenv').config();
const express = require('express');
const path = require('path');
const RobinhoodCrypto = require('./robinhoodCrypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const robinhood = new RobinhoodCrypto();

// Set up EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Home route
app.get('/', (req, res) => {
    res.render('index', { title: 'Crypto Trading App' });
});

// Account route
app.get('/account', async (req, res) => {
    const accountInfo = await robinhood.getAccount();
    res.render('account', { title: 'Account Information', accountInfo });
});

// Trading pairs route
app.get('/trading-pairs', async (req, res) => {
    const tradingPairs = await robinhood.getTradingPairs(['BTC-USD', 'ETH-USD']);
    res.render('trading-pairs', { title: 'Trading Pairs', tradingPairs: tradingPairs.results });
});

// Holdings route
app.get('/holdings', async (req, res) => {
    const holdings = await robinhood.getHoldings();
    res.render('holdings', { title: 'Holdings', holdings: holdings.results });
});

// Place order route
app.get('/place-order', async (req, res) => {
    // Fetch all trading pairs and filter only those with USD as the quote currency
    const tradingPairsResponse = await robinhood.getTradingPairs();
    const tradingPairs = tradingPairsResponse.results.filter(pair => pair.quote_code === 'USD');

    // Fetch holdings to display on the page
    const holdingsResponse = await robinhood.getHoldings();
    const holdings = holdingsResponse.results;

    res.render('place-order', { title: 'Place Order', tradingPairs, holdings });
});


app.post('/place-order', express.urlencoded({ extended: true }), async (req, res) => {
    const { symbol, quantity } = req.body;

    const order = await robinhood.placeOrder(
        uuidv4(),
        'buy',
        'market',
        symbol,
        { asset_quantity: quantity.toString() }
    );

    if (order) {
        res.render('order-success', { title: 'Order Placed', order });
    } else {
        res.render('order-failure', { title: 'Order Failed', message: 'Not enough buying power or other issue.' });
    }
});



// Cancel order route
app.get('/cancel-order', (req, res) => {
    res.render('cancel-order', { title: 'Cancel Order' });
});

app.post('/cancel-order', express.urlencoded({ extended: true }), async (req, res) => {
    const { orderId } = req.body;
    const cancelResult = await robinhood.cancelOrder(orderId);

    if (cancelResult) {
        res.render('order-success', { title: 'Order Canceled', message: 'Order canceled successfully.' });
    } else {
        res.render('order-failure', { title: 'Order Cancellation Failed', message: 'Invalid order ID or other issue.' });
    }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
