const { v4: uuidv4 } = require('uuid');

function analyzeDataForDecision(priceData, SYMBOLS) {
    const recommendations = {};
    const cutoffTime = new Date(Date.now() - 3 * 60 * 60 * 1000); // Last 3 hours

    SYMBOLS.forEach(symbol => {
        const lastPrices = priceData
            .filter(data => data.symbol === symbol && data.timestamp >= cutoffTime)
            .map(data => data.price);

        if (lastPrices.length < 30) return;

        const latestPrice = lastPrices[lastPrices.length - 1];
        const shortTermAvg = calculateMovingAverage(lastPrices, 5);
        const longTermAvg = calculateMovingAverage(lastPrices, 30);
        const emaShort = calculateEMA(lastPrices, 5);
        const rsi = calculateRSI(lastPrices);
        const recentVolatility = calculateStandardDeviation(lastPrices.slice(-5));
        const bollingerBands = calculateBollingerBands(lastPrices, 20);

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
        } else if (latestPrice > bollingerBands.upperBand && recentVolatility > changeThreshold) {
            action = 'sell';
            prediction = 'High volatility and price above upper Bollinger Band - potential downward correction';
        } else if (latestPrice < bollingerBands.lowerBand && recentVolatility > changeThreshold) {
            action = 'buy';
            prediction = 'High volatility and price below lower Bollinger Band - potential upward correction';
        } else {
            action = 'hold';
            prediction = 'Uncertain trend, hold position';
        }

        recommendations[symbol] = { action, prediction };
    });

    return recommendations;
}

// Function to calculate Bollinger Bands
function calculateBollingerBands(data, period = 20) {
    const movingAvg = calculateMovingAverage(data, period);
    const stdDev = calculateStandardDeviation(data.slice(-period));
    const upperBand = movingAvg + 2 * stdDev;
    const lowerBand = movingAvg - 2 * stdDev;
    return { upperBand, lowerBand };
}

// Function to calculate Exponential Moving Average (EMA)
function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }
    return ema;
}

// Standard Deviation Calculation
function calculateStandardDeviation(data) {
    const mean = data.reduce((acc, value) => acc + value, 0) / data.length;
    const variance = data.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
}

// Moving Average Calculation
function calculateMovingAverage(data, period) {
    if (data.length < period) return null;
    const slicedData = data.slice(-period);
    return slicedData.reduce((sum, price) => sum + price, 0) / period;
}

// RSI Calculation
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

module.exports = {
    analyzeDataForDecision,
    calculateStandardDeviation,
    calculateMovingAverage,
    calculateRSI,
    calculateBollingerBands,
    calculateEMA
};
