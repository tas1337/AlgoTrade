const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

module.exports = (io, robinhood, priceData, SYMBOLS) => {
    router.get('/', (req, res) => {
        res.render('index', { title: 'Crypto Trading App' });
    });

    router.get('/current-price', async (req, res) => {
        const { symbol } = req.query;
        const bidAskData = await robinhood.getBestBidAsk([symbol]);
        res.json({ price: bidAskData[0]?.price || null });
    });

    router.post('/place-order', async (req, res) => {
        const { symbol, action, amount } = req.body;
        const tradingPairs = await robinhood.getTradingPairs();
        const availableSymbols = tradingPairs.results.map(pair => pair.symbol);

        if (!availableSymbols.includes(symbol)) {
            return res.render('order-failure', { title: 'Order Failed', message: `Trading pair for symbol "${symbol}" could not be found.` });
        }

        const config = action === 'buy' ? { asset_quantity: amount.toString() } : {
            asset_quantity: amount.toString(),
            limit_price: parseFloat((await robinhood.getBestBidAsk([symbol]))[0]?.price || 1).toFixed(6)
        };
        const order = await robinhood.placeOrder(uuidv4(), action, action === 'buy' ? 'market' : 'limit', symbol, config);

        res.render(order ? 'order-success' : 'order-failure', {
            title: order ? 'Order Placed' : 'Order Failed',
            message: order ? 'Order placed successfully!' : 'Order failed due to insufficient buying power or other issue.'
        });
    });

    router.get('/cancel-order', (req, res) => {
        res.render('cancel-order', { title: 'Cancel Order' });
    });

    router.post('/cancel-order', async (req, res) => {
        const { orderId } = req.body;
        const cancelResult = await robinhood.cancelOrder(orderId);
        res.render(cancelResult ? 'order-success' : 'order-failure', {
            title: cancelResult ? 'Order Canceled' : 'Order Cancellation Failed',
            message: cancelResult ? 'Order canceled successfully.' : 'Invalid order ID or other issue.'
        });
    });

    router.get('/account', async (req, res) => {
        const accountInfo = await robinhood.getAccount();
        res.render('account', { title: 'Account Information', accountInfo });
    });

    router.get('/trading-pairs', async (req, res) => {
        const tradingPairs = await robinhood.getTradingPairs(['BTC-USD', 'ETH-USD']);
        res.render('trading-pairs', { title: 'Trading Pairs', tradingPairs: tradingPairs.results });
    });

    router.get('/holdings', async (req, res) => {
        const holdings = await robinhood.getHoldings();
        res.render('holdings', { title: 'Holdings', holdings: holdings.results });
    });

    router.get('/place-order', async (req, res) => {
        const tradingPairsResponse = await robinhood.getTradingPairs();
        const tradingPairs = tradingPairsResponse.results.filter(pair => pair.quote_code === 'USD');
        const holdingsResponse = await robinhood.getHoldings();
        const holdings = holdingsResponse.results;
        res.render('place-order', { title: 'Place Order', tradingPairs, holdings });
    });

    return router;
};
