require('dotenv').config();
const express = require('express');
const path = require('path');
const RobinhoodCrypto = require('./robinhoodCrypto');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const robinhood = new RobinhoodCrypto();

// Set up EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// In-memory storage for the last 2 hours of price data
const priceData = [];

// Fetch and broadcast prices and holdings every 10 seconds
async function fetchPricesAndHoldings() {
    try {
        const symbols = ['BTC-USD', 'ETH-USD', 'DOGE-USD', 'SHIB-USD', 'ETC-USD', 'USDC-USD'];
        
        // Fetch best bid/ask prices
        const bidAskData = await robinhood.getBestBidAsk(symbols);
        
        if (!Array.isArray(bidAskData)) {
            console.error('Expected bidAskData to be an array, but got:', bidAskData);
            return;
        }

        const prices = {};
        const detailedPrices = {};

        // Store fetched data for analysis
        const timestamp = new Date();
        bidAskData.forEach(data => {
            const assetCode = data.symbol;
            const currentPrice = parseFloat(data.price);
            if (!isNaN(currentPrice)) {
                prices[assetCode] = currentPrice;
                detailedPrices[assetCode] = {
                    ...data,
                    price: currentPrice
                };

                // Add entry to priceData for analysis
                priceData.push({ timestamp, symbol: assetCode, price: currentPrice });
            } else {
                console.error(`No valid price found for ${assetCode}`, data);
            }
        });

        // Keep only the last 2 hours of data
        const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
        while (priceData.length > 0 && priceData[0].timestamp < cutoffTime) {
            priceData.shift();
        }

        // Fetch holdings
        const holdingsData = await robinhood.getHoldings();
        if (!holdingsData || !Array.isArray(holdingsData.results)) {
            console.error("Error fetching holdings or unexpected response format:", holdingsData);
            return;
        }

        const holdings = holdingsData.results.map(holding => {
            const assetCode = holding.asset_code + '-USD';
            const quantity = parseFloat(holding.total_quantity);
            const usdValue = quantity * (prices[assetCode] || 0);

            return {
                asset_code: holding.asset_code,
                total_quantity: quantity,
                usd_value: usdValue,
                detailed_info: detailedPrices[assetCode] || {}
            };
        });

        // Generate recommendations based on the stored price data
        const recommendations = analyzeDataForDecision();

        console.log('Emitting updateHoldings with data:', holdings, 'and recommendations:', recommendations);
        io.emit('updateHoldings', { holdings, recommendations });
    } catch (error) {
        console.error('Error fetching prices and holdings:', error);
    }
}

// Analysis function to generate buy/sell recommendations
function analyzeDataForDecision() {
    const recommendations = {};
    priceData.forEach(({ symbol }) => {
        const lastPrices = priceData.filter(data => data.symbol === symbol).map(data => data.price);
        const movingAverage15 = calculateMovingAverage(lastPrices, 15);
        const movingAverage120 = calculateMovingAverage(lastPrices, 120);
        const latestPrice = lastPrices[lastPrices.length - 1];
        const rsi = calculateRSI(lastPrices);

        // Decision-making based on rules
        if (latestPrice > movingAverage15 && latestPrice > movingAverage120 && rsi < 30) {
            recommendations[symbol] = 'buy';
        } else if (latestPrice < movingAverage15 && rsi > 70) {
            recommendations[symbol] = 'sell';
        } else {
            recommendations[symbol] = 'hold';
        }
    });
    return recommendations;
}

// Helper functions for moving average and RSI calculation
function calculateMovingAverage(data, period) {
    if (data.length < period) return null;
    const slicedData = data.slice(-period);
    return slicedData.reduce((sum, price) => sum + price, 0) / period;
}

function calculateRSI(data) {
    if (data.length < 14) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i < 14; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

// Place Order endpoint
app.post('/place-order', express.urlencoded({ extended: true }), async (req, res) => {
    const { symbol, action, amount } = req.body; // action: 'buy' or 'sell'
    
    const orderType = action === 'buy' ? 'market' : 'limit';
    const config = action === 'buy' ? { asset_quantity: amount.toString() } : { limit_price: amount.toString() };
    const order = await robinhood.placeOrder(uuidv4(), action, orderType, symbol, config);
    
    res.json(order ? { success: true, order } : { success: false, error: 'Order failed' });
});

// Cancel order route
app.get('/cancel-order', (req, res) => {
    res.render('cancel-order', { title: 'Cancel Order' });
});

app.post('/cancel-order', express.urlencoded({ extended: true }), async (req, res) => {
    const { orderId } = req.body;
    const cancelResult = await robinhood.cancelOrder(orderId);
    res.render(cancelResult ? 'order-success' : 'order-failure', { title: cancelResult ? 'Order Canceled' : 'Order Cancellation Failed', message: cancelResult ? 'Order canceled successfully.' : 'Invalid order ID or other issue.' });
});

// Run fetchPricesAndHoldings every 10 seconds
setInterval(fetchPricesAndHoldings, 1000);

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('New client connected');
    fetchPricesAndHoldings(); // Send initial data on connection

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
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

// Place order route (GET)
app.get('/place-order', async (req, res) => {
    const tradingPairsResponse = await robinhood.getTradingPairs();
    const tradingPairs = tradingPairsResponse.results.filter(pair => pair.quote_code === 'USD');
    const holdingsResponse = await robinhood.getHoldings();
    const holdings = holdingsResponse.results;
    res.render('place-order', { title: 'Place Order', tradingPairs, holdings });
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
