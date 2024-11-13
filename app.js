require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const RobinhoodCrypto = require('./robinhoodCrypto');
const routes = require('./routes');

const { v4: uuidv4 } = require('uuid');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const robinhood = new RobinhoodCrypto();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const PRICE_DATA_FILE = 'priceData.json';
const SYMBOLS = ['BTC-USD', 'ETH-USD', 'DOGE-USD', 'SHIB-USD', 'ETC-USD'];

// In-memory storage loaded from the file
let priceData = loadPriceData();
setInterval(() => savePriceData(priceData), 5 * 60 * 1000);

setInterval(fetchStatsAndDocs, 1000);
setInterval(fetchPredictionsAndActions, 14000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Load routes and pass dependencies
app.use('/', routes(io, robinhood, priceData, SYMBOLS));

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

function savePriceData(data) {
    fs.writeFileSync(PRICE_DATA_FILE, JSON.stringify(data, null, 2));
}

async function fetchStatsAndDocs() {
    try {
        const bidAskData = await robinhood.getBestBidAsk(SYMBOLS);
        const prices = {};
        const detailedPrices = {};
        const timestamp = new Date();

        bidAskData.forEach(data => {
            const assetCode = data.symbol;
            const currentPrice = parseFloat(data.price);
            if (!isNaN(currentPrice)) {
                prices[assetCode] = currentPrice;
                detailedPrices[assetCode] = { ...data, price: currentPrice };
                priceData.push({ timestamp, symbol: assetCode, price: currentPrice });
            }
        });

        savePriceData(priceData);

        const holdingsData = await robinhood.getHoldings();
        const holdings = holdingsData.results.map(holding => {
            const assetCode = holding.asset_code + '-USD';
            const quantity = parseFloat(holding.total_quantity);
            return {
                asset_code: holding.asset_code,
                total_quantity: quantity,
                usd_value: quantity * (prices[assetCode] || 0),
                detailed_info: detailedPrices[assetCode] || {}
            };
        });

        io.emit('updateHoldings', { holdings });
    } catch (error) {
        console.error('Error fetching stats and docs:', error);
    }
}

function fetchPredictionsAndActions() {
    const recommendations = analyzeDataForDecision();
    io.emit('updateRecommendations', recommendations);
}

function analyzeDataForDecision() {
    const recommendations = {};
    const cutoffTime = new Date(Date.now() - 3 * 60 * 60 * 1000);

    SYMBOLS.forEach(symbol => {
        const lastPrices = priceData
            .filter(data => data.symbol === symbol && data.timestamp >= cutoffTime)
            .map(data => data.price);

        if (lastPrices.length < 30) return;

        const latestPrice = lastPrices[lastPrices.length - 1];
        const shortTermAvg = calculateMovingAverage(lastPrices, 5);
        const longTermAvg = calculateMovingAverage(lastPrices, 30);
        const rsi = calculateRSI(lastPrices);
        const recentVolatility = calculateStandardDeviation(lastPrices.slice(-5));

        let action, prediction;
        const changeThreshold = 0.0002 * latestPrice;

        if (latestPrice > shortTermAvg && recentVolatility < changeThreshold) {
            action = 'buy';
            prediction = 'Stable upward trend with low volatility';
        } else if (latestPrice < shortTermAvg && recentVolatility < changeThreshold) {
            action = 'sell';
            prediction = 'Stable downward trend with low volatility';
        } else if (rsi < 30) {
            action = 'buy';
            prediction = 'Oversold condition - potential upward reversal';
        } else if (rsi > 70) {
            action = 'sell';
            prediction = 'Overbought condition - potential downward reversal';
        } else {
            action = 'hold';
            prediction = 'Uncertain trend, hold position';
        }

        recommendations[symbol] = { action, prediction };
    });

    return recommendations;
}

function calculateStandardDeviation(data) {
    const mean = data.reduce((acc, value) => acc + value, 0) / data.length;
    const variance = data.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
}

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

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
