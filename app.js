require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const RobinhoodCrypto = require('./robinhoodCrypto');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const robinhood = new RobinhoodCrypto();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const PRICE_DATA_FILE = 'priceData.json';
const SYMBOLS = ['BTC-USD', 'ETH-USD', 'DOGE-USD', 'SHIB-USD', 'ETC-USD'];

// Route for home page
app.get('/', (req, res) => {
    res.render('index', { title: 'Crypto Trading App' });
});

// Load existing data from file
function loadPriceData() {
    try {
        if (fs.existsSync(PRICE_DATA_FILE)) {
            const data = fs.readFileSync(PRICE_DATA_FILE, 'utf8');
            return data ? JSON.parse(data) : [];
        }
    } catch (error) {
        console.error('Error loading price data:', error);
    }
    return [];
}

// Save price data to file
function savePriceData(data) {
    fs.writeFileSync(PRICE_DATA_FILE, JSON.stringify(data, null, 2));
}

// In-memory storage loaded from the file
let priceData = loadPriceData();
console.log(`Loaded price data points on startup: ${priceData.length}`);
setInterval(() => savePriceData(priceData), 5 * 60 * 1000);

// Fetch and broadcast stats and docs every second
async function fetchStatsAndDocs() {
    try {
        const bidAskData = await robinhood.getBestBidAsk(SYMBOLS);
        if (!Array.isArray(bidAskData)) {
            console.error('Expected bidAskData to be an array, but got:', bidAskData);
            return;
        }

        const newPriceData = [];
        const prices = {};
        const detailedPrices = {};
        const timestamp = new Date();

        bidAskData.forEach(data => {
            const assetCode = data.symbol;
            const currentPrice = parseFloat(data.price);
            if (!isNaN(currentPrice)) {
                prices[assetCode] = currentPrice;
                detailedPrices[assetCode] = { ...data, price: currentPrice };
                newPriceData.push({ timestamp, symbol: assetCode, price: currentPrice });
            }
        });

        priceData = priceData.concat(newPriceData);
        savePriceData(priceData);

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

        // Emit holdings data every second
        io.emit('updateHoldings', { holdings });
    } catch (error) {
        console.error('Error fetching stats and docs:', error);
    }
}

function fetchPredictionsAndActions() {
    const recommendations = analyzeDataForDecision();
    // Emit recommendations data every 30 seconds
    io.emit('updateRecommendations', recommendations);
}
function placeOrder(event, symbol, action, currencyType) {
    event.preventDefault();
    const amountElement = document.getElementById(`${action}-amount-${symbol}`);
    const amountInUSD = parseFloat(amountElement.value);

    // Convert USD to asset quantity based on the current price
    fetch(`/current-price?symbol=${symbol}`)
        .then(response => response.json())
        .then(data => {
            const currentPrice = data.price;
            const assetQuantity = amountInUSD / currentPrice;

            // Send the order in quantity terms
            fetch('/place-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: `${symbol}-USD`,
                    action,
                    amount: assetQuantity.toFixed(6) 
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Order placed successfully!');
                } else {
                    alert('Failed to place order.');
                }
            })
            .catch(error => console.error('Error placing order:', error));
        })
        .catch(error => console.error('Error fetching current price:', error));
}

app.get('/current-price', async (req, res) => {
    const { symbol } = req.query;
    const bidAskData = await robinhood.getBestBidAsk([symbol]);
    const currentPrice = bidAskData[0]?.price || null;
    res.json({ price: currentPrice });
});
// Adjusted analyzeDataForDecision function to log conditionally triggered paths
function analyzeDataForDecision() {
    const recommendations = {};
    const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // Last 2 hours

    SYMBOLS.forEach(symbol => {
        const lastPrices = priceData
            .filter(data => data.symbol === symbol && data.timestamp >= cutoffTime)
            .map(data => data.price);

        console.log(`Symbol: ${symbol}, Price Data Points: ${lastPrices.length}`);

        if (lastPrices.length < 30) return;

        const latestPrice = lastPrices[lastPrices.length - 1];
        const shortTermAvg = calculateMovingAverage(lastPrices, 5);
        const longTermAvg = calculateMovingAverage(lastPrices, 30);
        const rsi = calculateRSI(lastPrices);
        const recentVolatility = calculateStandardDeviation(lastPrices.slice(-5));

        let action, prediction;
        const changeThreshold = 0.0002 * latestPrice;

        if (latestPrice > shortTermAvg && recentVolatility < changeThreshold) {
            console.log(`Symbol ${symbol}: Buy triggered by stable upward trend`);
            action = 'buy';
            prediction = 'Stable upward trend with low volatility';
        } else if (latestPrice < shortTermAvg && recentVolatility < changeThreshold) {
            console.log(`Symbol ${symbol}: Sell triggered by stable downward trend`);
            action = 'sell';
            prediction = 'Stable downward trend with low volatility';
        } else if (rsi < 30) {
            console.log(`Symbol ${symbol}: Buy triggered by oversold condition`);
            action = 'buy';
            prediction = 'Oversold condition - potential upward reversal';
        } else if (rsi > 70) {
            console.log(`Symbol ${symbol}: Sell triggered by overbought condition`);
            action = 'sell';
            prediction = 'Overbought condition - potential downward reversal';
        } else {
            console.log(`Symbol ${symbol}: Hold triggered by uncertain trend`);
            action = 'hold';
            prediction = 'Uncertain trend, hold position';
        }

        recommendations[symbol] = { action, prediction };
    });

    console.log("Emitting recommendations to front end:", recommendations);
    return recommendations;
}

// Helper function to calculate standard deviation for volatility measurement
function calculateStandardDeviation(data) {
    const mean = data.reduce((acc, value) => acc + value, 0) / data.length;
    const variance = data.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
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

function calculateTrend(data) {
    const [first, ...rest] = data;
    const increasing = rest.every((price, i) => price > data[i]);
    const decreasing = rest.every((price, i) => price < data[i]);

    if (increasing) return 'up';
    if (decreasing) return 'down';
    return 'sideways';
}

// Place Order endpoint with success/failure page rendering
app.post('/place-order', express.json(), async (req, res) => {
    const { symbol, action, amount } = req.body;

    const tradingPairs = await robinhood.getTradingPairs();
    const availableSymbols = tradingPairs.results.map(pair => pair.symbol);

    if (!availableSymbols.includes(symbol)) {
        return res.render('order-failure', { title: 'Order Failed', message: `Trading pair for symbol "${symbol}" could not be found.` });
    }

    let config;
    if (action === 'buy') {
        config = { asset_quantity: amount.toString() };
    } else if (action === 'sell') {
        const currentPriceData = await robinhood.getBestBidAsk([symbol]);
        let limitPrice = currentPriceData[0]?.price || 1;
        limitPrice = parseFloat(limitPrice).toFixed(6);
        config = { asset_quantity: amount.toString(), limit_price: limitPrice };
    } else {
        return res.render('order-failure', { title: 'Order Failed', message: 'Invalid action specified.' });
    }

    const orderType = action === 'buy' ? 'market' : 'limit';

    const order = await robinhood.placeOrder(uuidv4(), action, orderType, symbol, config);

    if (order) {
        res.render('order-success', { title: 'Order Placed', order });
    } else {
        res.render('order-failure', { title: 'Order Failed', message: 'Not enough buying power or other issue.' });
    }
});

app.get('/cancel-order', (req, res) => {
    res.render('cancel-order', { title: 'Cancel Order' });
});

app.post('/cancel-order', express.urlencoded({ extended: true }), async (req, res) => {
    const { orderId } = req.body;
    const cancelResult = await robinhood.cancelOrder(orderId);
    res.render(cancelResult ? 'order-success' : 'order-failure', { title: cancelResult ? 'Order Canceled' : 'Order Cancellation Failed', message: cancelResult ? 'Order canceled successfully.' : 'Invalid order ID or other issue.' });
});

// Scheduling intervals for fetch functions
setInterval(fetchStatsAndDocs, 1000);        // stats and docs update every second
setInterval(fetchPredictionsAndActions, 14000); // predictions and actions update every 30 seconds

io.on('connection', (socket) => {
    console.log('New client connected');
    fetchStatsAndDocs();
    fetchPredictionsAndActions();
    socket.on('disconnect', () => console.log('Client disconnected'));
});

app.get('/account', async (req, res) => {
    const accountInfo = await robinhood.getAccount();
    res.render('account', { title: 'Account Information', accountInfo });
});

app.get('/trading-pairs', async (req, res) => {
    const tradingPairs = await robinhood.getTradingPairs(['BTC-USD', 'ETH-USD']);
    res.render('trading-pairs', { title: 'Trading Pairs', tradingPairs: tradingPairs.results });
});

app.get('/holdings', async (req, res) => {
    const holdings = await robinhood.getHoldings();
    res.render('holdings', { title: 'Holdings', holdings: holdings.results });
});

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
